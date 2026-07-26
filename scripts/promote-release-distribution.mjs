import { spawn } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  BUILD_RELEASE_ASSET_NAMES,
  buildGitHubReleaseAssetUrl,
  buildOssObjectUrl,
  createDownloadManifest,
  createUpdaterManifest,
  DISTRIBUTION_OWNER,
  DISTRIBUTION_REPO,
  PUBLISHED_RELEASE_ASSET_NAMES,
  RELEASE_ARTIFACT_NAMES,
  sha256Bytes,
  UPDATER_TARGETS,
  validateDistributionEnvironment,
  validateReleaseTag,
} from './release-distribution.mjs';
import {
  normalizeUpdaterPublicKey,
} from './prepare-release-updater-config.mjs';
import { verifyGitHubDraftRelease } from './verify-release-assets.mjs';

const GITHUB_API_ROOT = 'https://api.github.com';
const GITHUB_UPLOADS_ROOT = 'https://uploads.github.com';
const REQUEST_TIMEOUT_MS = 60_000;
const scriptPath = fileURLToPath(import.meta.url);

export function decodeUpdaterSignature(value) {
  const encoded = String(value ?? '').trim();
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new Error('Updater signature must be canonical Base64');
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  if (
    !decoded.startsWith('untrusted comment: ') ||
    !decoded.includes('\ntrusted comment: ')
  ) {
    throw new Error('Updater signature must decode to a Minisign signature file');
  }
  return decoded;
}

export async function promoteReleaseDistribution({
  env = process.env,
  fetchImpl = fetch,
  ossutilBin = env.OSSUTIL_BIN || 'ossutil',
  minisignBin = env.MINISIGN_BIN || 'minisign',
  runCommand = run,
  tag,
}) {
  validateReleaseTag(tag);
  const token = String(env.GITHUB_TOKEN ?? '').trim();
  const sourceSha = String(env.MADORA_SOURCE_SHA ?? '').trim();
  const updaterPublicKey = String(env.MADORA_UPDATER_PUBLIC_KEY ?? '').trim();
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!sourceSha.match(/^[0-9a-f]{40,64}$/i)) {
    throw new Error('MADORA_SOURCE_SHA must be the checked-out source tag commit');
  }
  if (!updaterPublicKey) throw new Error('MADORA_UPDATER_PUBLIC_KEY is required');

  const distribution = validateDistributionEnvironment(env);
  const workdir = await mkdtemp(join(tmpdir(), 'madora-promotion-'));
  try {
    let release = await findReleaseByTag(tag, { fetchImpl, token });
    if (release.prerelease) throw new Error('Promotion refuses prerelease releases');
    if (release.draft) {
      await verifyGitHubDraftRelease({
        expectedSourceSha: sourceSha,
        expectedTag: tag,
        fetchImpl,
        token,
      });
    }
    assertFinalReleaseNotes(release.body);

    const expectedAssetNames = release.draft
      ? BUILD_RELEASE_ASSET_NAMES
      : PUBLISHED_RELEASE_ASSET_NAMES;
    assertAssetSet(release.assets, expectedAssetNames);

    const assetsByName = new Map(release.assets.map((asset) => [asset.name, asset]));
    const localArtifactPaths = {};
    for (const name of RELEASE_ARTIFACT_NAMES) {
      const path = join(workdir, name);
      await downloadGitHubAsset(assetsByName.get(name), path, {
        fetchImpl,
        token,
      });
      localArtifactPaths[name] = path;
    }

    const signatureContents = Object.fromEntries(
      Object.values(UPDATER_TARGETS)
        .map(({ signatureName }) => signatureName)
        .filter((name, index, names) => names.indexOf(name) === index)
        .map((name) => [name, null]),
    );
    for (const name of Object.keys(signatureContents)) {
      signatureContents[name] = await readFile(localArtifactPaths[name], 'utf8');
    }

    const timestamp = release.created_at;
    const releaseNotes = release.body;
    const primaryManifest = createUpdaterManifest({
      assetUrlForName: (name) =>
        buildOssObjectUrl(
          distribution.publicBaseUrl,
          `releases/${tag}/${name}`,
        ),
      releaseNotes,
      signatureContents,
      tag,
      timestamp,
    });
    const fallbackManifest = createUpdaterManifest({
      assetUrlForName: (name) => buildGitHubReleaseAssetUrl(tag, name),
      releaseNotes,
      signatureContents,
      tag,
      timestamp,
    });

    const artifactMetadata = {};
    for (const name of RELEASE_ARTIFACT_NAMES) {
      const bytes = await readFile(localArtifactPaths[name]);
      artifactMetadata[name] = {
        sha256: sha256Bytes(bytes),
        size: bytes.byteLength,
        url: buildOssObjectUrl(
          distribution.publicBaseUrl,
          `releases/${tag}/${name}`,
        ),
      };
    }
    const downloadManifest = createDownloadManifest({
      artifactMetadata,
      releaseUrl: `https://github.com/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases/tag/${tag}`,
      tag,
      timestamp,
    });

    const primaryPath = join(workdir, 'latest.json');
    const fallbackPath = join(workdir, 'latest-github.json');
    const downloadsPath = join(workdir, 'stable.json');
    await Promise.all([
      writeJson(primaryPath, primaryManifest),
      writeJson(fallbackPath, fallbackManifest),
      writeJson(downloadsPath, downloadManifest),
    ]);

    const ossEnv = createOssEnvironment(env, distribution);
    for (const name of RELEASE_ARTIFACT_NAMES) {
      const objectKey = `releases/${tag}/${name}`;
      const exists = await ossObjectExists({
        bucket: distribution.bucket,
        env: ossEnv,
        objectKey,
        ossutilBin,
        runCommand,
      });
      if (!exists) {
        await uploadOssObject({
          bucket: distribution.bucket,
          cacheControl: 'public, max-age=31536000, immutable',
          env: ossEnv,
          localPath: localArtifactPaths[name],
          objectKey,
          ossutilBin,
          runCommand,
        });
      }
      await verifyPublicObject({
        expectedPath: localArtifactPaths[name],
        fetchImpl,
        url: artifactMetadata[name].url,
      });
    }

    const publicKeyPath = join(workdir, 'madora-updater.pub');
    const normalizedPublicKey = normalizeUpdaterPublicKey(updaterPublicKey);
    await writeFile(
      publicKeyPath,
      Buffer.from(normalizedPublicKey, 'base64').toString('utf8'),
      { encoding: 'utf8', mode: 0o600 },
    );
    for (const { assetName, signatureName } of uniqueUpdaterArtifacts()) {
      const readbackPath = join(workdir, `readback-${basename(assetName)}`);
      const decodedSignaturePath = join(
        workdir,
        `decoded-${basename(signatureName)}`,
      );
      await downloadPublicFile(artifactMetadata[assetName].url, readbackPath, {
        fetchImpl,
      });
      await writeFile(
        decodedSignaturePath,
        decodeUpdaterSignature(signatureContents[signatureName]),
        { encoding: 'utf8', mode: 0o600 },
      );
      await runCommand(
        minisignBin,
        [
          '-Vm',
          readbackPath,
          '-x',
          decodedSignaturePath,
          '-p',
          publicKeyPath,
        ],
        { env: process.env },
      );
    }

    if (release.draft) {
      await replaceDraftManifestAssets({
        fallbackPath,
        fetchImpl,
        primaryPath,
        release,
        token,
      });
      release = await publishRelease(release, { fetchImpl, token });
    } else {
      await assertPublishedManifestAssets({
        fallbackPath,
        fetchImpl,
        primaryPath,
        release,
        token,
      });
    }

    await verifyPublicObject({
      expectedPath: fallbackPath,
      fetchImpl,
      url: buildGitHubReleaseAssetUrl(tag, 'latest-github.json'),
    });
    await verifyPublicObject({
      expectedPath: primaryPath,
      fetchImpl,
      url: buildGitHubReleaseAssetUrl(tag, 'latest.json'),
    });

    await uploadOssObject({
      bucket: distribution.bucket,
      cacheControl: 'no-cache, no-store, must-revalidate',
      contentType: 'application/json',
      env: ossEnv,
      localPath: primaryPath,
      objectKey: 'updates/stable/latest.json',
      ossutilBin,
      runCommand,
    });
    await verifyPublicObject({
      expectedPath: primaryPath,
      fetchImpl,
      url: buildOssObjectUrl(
        distribution.publicBaseUrl,
        'updates/stable/latest.json',
      ),
    });

    await uploadOssObject({
      bucket: distribution.bucket,
      cacheControl: 'no-cache, no-store, must-revalidate',
      contentType: 'application/json',
      env: ossEnv,
      localPath: downloadsPath,
      objectKey: 'downloads/stable.json',
      ossutilBin,
      runCommand,
    });
    await verifyPublicObject({
      expectedPath: downloadsPath,
      fetchImpl,
      url: buildOssObjectUrl(distribution.publicBaseUrl, 'downloads/stable.json'),
    });

    return {
      releaseUrl: release.html_url,
      tag,
      versionedObjectCount: RELEASE_ARTIFACT_NAMES.length,
    };
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
}

function assertFinalReleaseNotes(body) {
  const notes = String(body ?? '').trim();
  if (!notes) throw new Error('Final GitHub Release body is empty');
  if (notes.includes('本版本包含功能改进、体验优化和问题修复。')) {
    throw new Error('Replace the generated fallback Release body before promotion');
  }
  if (/<[^>]+>/.test(notes)) {
    throw new Error('Final GitHub Release body still contains placeholders');
  }
}

function assertAssetSet(assets, expectedNames) {
  const actual = Array.isArray(assets) ? assets.map((asset) => asset.name).sort() : [];
  const expected = [...expectedNames].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Release assets must be exactly: ${expectedNames.join(', ')}; received: ${actual.join(', ')}`,
    );
  }
}

async function findReleaseByTag(tag, options) {
  const releases = await githubJson(
    `${GITHUB_API_ROOT}/repos/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases?per_page=100`,
    options,
  );
  const release = Array.isArray(releases)
    ? releases.find((candidate) => candidate?.tag_name === tag)
    : null;
  if (!release) throw new Error(`GitHub Release ${tag} was not found`);
  return release;
}

async function downloadGitHubAsset(asset, destination, { fetchImpl, token }) {
  if (!asset?.id || asset.url !== `${GITHUB_API_ROOT}/repos/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases/assets/${asset.id}`) {
    throw new Error(`Unexpected GitHub asset URL for ${asset?.name ?? 'unknown asset'}`);
  }
  const response = await githubRequest(asset.url, {
    accept: 'application/octet-stream',
    fetchImpl,
    token,
  });
  await streamResponseToFile(response, destination);
  const info = await stat(destination);
  if (info.size <= 0 || info.size !== asset.size) {
    throw new Error(`Downloaded GitHub asset size mismatch for ${asset.name}`);
  }
}

async function replaceDraftManifestAssets({
  fallbackPath,
  fetchImpl,
  primaryPath,
  release,
  token,
}) {
  for (const name of ['latest.json', 'latest-github.json']) {
    const existing = release.assets.find((asset) => asset.name === name);
    if (existing) {
      await githubRequest(existing.url, {
        fetchImpl,
        method: 'DELETE',
        token,
      });
    }
  }
  await uploadGitHubAsset(release.id, primaryPath, 'latest.json', {
    fetchImpl,
    token,
  });
  await uploadGitHubAsset(release.id, fallbackPath, 'latest-github.json', {
    fetchImpl,
    token,
  });
}

async function assertPublishedManifestAssets({
  fallbackPath,
  fetchImpl,
  primaryPath,
  release,
  token,
}) {
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  for (const [name, expectedPath] of [
    ['latest.json', primaryPath],
    ['latest-github.json', fallbackPath],
  ]) {
    const actualPath = `${expectedPath}.published`;
    await downloadGitHubAsset(assets.get(name), actualPath, { fetchImpl, token });
    await assertFilesEqual(expectedPath, actualPath, `published ${name}`);
  }
}

async function uploadGitHubAsset(releaseId, path, name, { fetchImpl, token }) {
  const bytes = await readFile(path);
  const url = `${GITHUB_UPLOADS_ROOT}/repos/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
  await githubJson(url, {
    body: bytes,
    contentType: 'application/json',
    fetchImpl,
    method: 'POST',
    token,
  });
}

async function publishRelease(release, { fetchImpl, token }) {
  const published = await githubJson(release.url, {
    body: JSON.stringify({ draft: false }),
    contentType: 'application/json',
    fetchImpl,
    method: 'PATCH',
    token,
  });
  if (published.draft !== false || published.prerelease !== false) {
    throw new Error('GitHub did not publish the stable Release');
  }
  return published;
}

function createOssEnvironment(env, distribution) {
  const accessKeyId = env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  const securityToken = env.ALIBABA_CLOUD_SECURITY_TOKEN;
  if (!accessKeyId || !accessKeySecret || !securityToken) {
    throw new Error('Alibaba Cloud OIDC action did not export temporary STS credentials');
  }
  return {
    ...process.env,
    OSS_ACCESS_KEY_ID: accessKeyId,
    OSS_ACCESS_KEY_SECRET: accessKeySecret,
    OSS_ENDPOINT: distribution.endpoint,
    OSS_REGION: distribution.region,
    OSS_SESSION_TOKEN: securityToken,
  };
}

async function ossObjectExists({
  bucket,
  env,
  objectKey,
  ossutilBin,
  runCommand,
}) {
  try {
    await runCommand(
      ossutilBin,
      [
        'stat',
        `oss://${bucket}/${objectKey}`,
        '--endpoint',
        env.OSS_ENDPOINT,
        '--region',
        env.OSS_REGION,
        '--mode',
        'StsToken',
        '--quiet',
      ],
      { env, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

async function uploadOssObject({
  bucket,
  cacheControl,
  contentType,
  env,
  localPath,
  objectKey,
  ossutilBin,
  runCommand,
}) {
  const args = [
    'cp',
    localPath,
    `oss://${bucket}/${objectKey}`,
    '--endpoint',
    env.OSS_ENDPOINT,
    '--region',
    env.OSS_REGION,
    '--mode',
    'StsToken',
    '--force',
    '--no-progress',
  ];
  if (contentType) args.push('--content-type', contentType);
  if (cacheControl) args.push('--cache-control', cacheControl);
  await runCommand(ossutilBin, args, { env });
}

async function verifyPublicObject({ expectedPath, fetchImpl, url }) {
  const actualPath = `${expectedPath}.readback`;
  await downloadPublicFile(url, actualPath, { fetchImpl });
  await assertFilesEqual(expectedPath, actualPath, url);
}

async function downloadPublicFile(url, destination, { fetchImpl }) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/octet-stream' },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await streamResponseToFile(response, destination);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    }
  }
  throw new Error(`Public readback failed for ${url}: ${lastError?.message ?? lastError}`);
}

async function assertFilesEqual(expectedPath, actualPath, label) {
  const [expected, actual] = await Promise.all([
    readFile(expectedPath),
    readFile(actualPath),
  ]);
  if (sha256Bytes(expected) !== sha256Bytes(actual)) {
    throw new Error(`SHA-256 readback mismatch for ${label}`);
  }
}

function uniqueUpdaterArtifacts() {
  const seen = new Set();
  return Object.values(UPDATER_TARGETS).filter(({ assetName }) => {
    if (seen.has(assetName)) return false;
    seen.add(assetName);
    return true;
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function githubJson(url, options) {
  const response = await githubRequest(url, options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GitHub returned invalid JSON for ${url}`);
  }
}

async function githubRequest(
  url,
  {
    accept = 'application/vnd.github+json',
    body,
    contentType,
    fetchImpl,
    method = 'GET',
    token,
  },
) {
  const parsed = new URL(url);
  if (!['api.github.com', 'uploads.github.com'].includes(parsed.hostname)) {
    throw new Error(`Refusing to send GitHub token to ${parsed.hostname}`);
  }
  const headers = {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'User-Agent': 'madora-release-promoter',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (contentType) headers['Content-Type'] = contentType;
  const response = await fetchImpl(url, {
    body,
    headers,
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed with HTTP ${response.status}: ${method} ${parsed.pathname}`);
  }
  return response;
}

async function streamResponseToFile(response, destination) {
  if (!response.body) throw new Error('Download response body is missing');
  const file = await import('node:fs').then(({ createWriteStream }) =>
    createWriteStream(destination, { flags: 'w', mode: 0o600 }),
  );
  await pipeline(Readable.fromWeb(response.body), file);
}

function run(command, args, { env, stdio = 'inherit' } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env, stdio });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function parseTag(argv) {
  const index = argv.indexOf('--tag');
  return index >= 0 ? argv[index + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const tag = parseTag(process.argv.slice(2));
  promoteReleaseDistribution({ tag })
    .then((result) => {
      process.stdout.write(
        `Promoted ${result.tag}: ${result.versionedObjectCount} immutable OSS objects; ${result.releaseUrl}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
