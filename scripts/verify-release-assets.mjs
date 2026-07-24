import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISTRIBUTION_OWNER = 'Refinex-Space';
const DISTRIBUTION_REPO = 'madora-site';
const GITHUB_API_ROOT = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;

export const EXPECTED_RELEASE_ASSET_NAMES = Object.freeze([
  'Madora_aarch64.dmg',
  'Madora_aarch64.app.tar.gz',
  'Madora_aarch64.app.tar.gz.sig',
  'Madora_x64.dmg',
  'Madora_x64.app.tar.gz',
  'Madora_x64.app.tar.gz.sig',
  'Madora_x64-setup.exe',
  'Madora_x64-setup.exe.sig',
  'latest.json',
]);

const REQUIRED_UPDATER_PLATFORMS = Object.freeze({
  'darwin-aarch64': {
    assetName: 'Madora_aarch64.app.tar.gz',
    signatureName: 'Madora_aarch64.app.tar.gz.sig',
  },
  'darwin-aarch64-app': {
    assetName: 'Madora_aarch64.app.tar.gz',
    signatureName: 'Madora_aarch64.app.tar.gz.sig',
  },
  'darwin-x86_64': {
    assetName: 'Madora_x64.app.tar.gz',
    signatureName: 'Madora_x64.app.tar.gz.sig',
  },
  'darwin-x86_64-app': {
    assetName: 'Madora_x64.app.tar.gz',
    signatureName: 'Madora_x64.app.tar.gz.sig',
  },
  'windows-x86_64': {
    assetName: 'Madora_x64-setup.exe',
    signatureName: 'Madora_x64-setup.exe.sig',
  },
  'windows-x86_64-nsis': {
    assetName: 'Madora_x64-setup.exe',
    signatureName: 'Madora_x64-setup.exe.sig',
  },
});

const scriptPath = fileURLToPath(import.meta.url);

export function validateReleaseSnapshot({
  expectedSourceSha,
  expectedTag,
  latestJson,
  release,
  signatureContents,
}) {
  const errors = [];
  const version = expectedTag.startsWith('v') ? expectedTag.slice(1) : '';

  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(expectedTag)) {
    errors.push(`expected release tag is invalid: ${expectedTag}`);
  }
  if (!/^[0-9a-f]{40,64}$/i.test(expectedSourceSha)) {
    errors.push('expected source commit must be a full Git commit SHA');
  }
  if (!release || typeof release !== 'object') {
    throw new Error('Release verification failed:\n- release payload is missing');
  }

  if (release.tag_name !== expectedTag) {
    errors.push(
      `release tag mismatch: expected ${expectedTag}, received ${String(release.tag_name)}`,
    );
  }
  if (release.name !== `Madora ${expectedTag}`) {
    errors.push(
      `release name mismatch: expected Madora ${expectedTag}, received ${String(release.name)}`,
    );
  }
  if (release.draft !== true) {
    errors.push('release must remain a draft until manual acceptance is complete');
  }
  if (release.prerelease !== false) {
    errors.push('release must not be a prerelease');
  }
  if (release.target_commitish !== 'main') {
    errors.push(
      `release target must be madora-site main, received ${String(release.target_commitish)}`,
    );
  }
  if (typeof release.body !== 'string' || !release.body.includes(expectedSourceSha)) {
    errors.push('release body does not contain the private source commit');
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (!Array.isArray(release.assets)) {
    errors.push('release assets payload is missing');
  }
  const assetsByName = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset.name !== 'string') {
      errors.push('release contains an asset without a valid name');
      continue;
    }
    if (assetsByName.has(asset.name)) {
      errors.push(`release contains duplicate asset ${asset.name}`);
      continue;
    }
    assetsByName.set(asset.name, asset);
  }

  const expectedAssetNames = new Set(EXPECTED_RELEASE_ASSET_NAMES);
  for (const name of EXPECTED_RELEASE_ASSET_NAMES) {
    const asset = assetsByName.get(name);
    if (!asset) {
      errors.push(`missing release asset ${name}`);
      continue;
    }
    if (!Number.isFinite(asset.size) || asset.size <= 0) {
      errors.push(`release asset ${name} is empty`);
    }
    if (!isExpectedAssetApiUrl(asset.url, asset.id)) {
      errors.push(`release asset ${name} has an unexpected API URL`);
    }
  }
  for (const name of assetsByName.keys()) {
    if (!expectedAssetNames.has(name)) {
      errors.push(`unexpected release asset ${name}`);
    }
  }

  if (!latestJson || typeof latestJson !== 'object') {
    errors.push('latest.json payload is missing');
  } else {
    if (latestJson.version !== version) {
      errors.push(
        `latest.json version mismatch: expected ${version}, received ${String(latestJson.version)}`,
      );
    }
    if (
      typeof latestJson.pub_date !== 'string' ||
      Number.isNaN(Date.parse(latestJson.pub_date))
    ) {
      errors.push('latest.json pub_date must be a valid RFC 3339 timestamp');
    }

    const platforms =
      latestJson.platforms && typeof latestJson.platforms === 'object'
        ? latestJson.platforms
        : {};
    if (!latestJson.platforms || typeof latestJson.platforms !== 'object') {
      errors.push('latest.json platforms payload is missing');
    }

    for (const [platformName, expected] of Object.entries(
      REQUIRED_UPDATER_PLATFORMS,
    )) {
      const platform = platforms[platformName];
      if (!platform || typeof platform !== 'object') {
        errors.push(`missing latest.json platform ${platformName}`);
        continue;
      }

      const updaterAsset = assetsByName.get(expected.assetName);
      if (!updaterAsset || platform.url !== updaterAsset.url) {
        errors.push(
          `${platformName} URL does not reference ${expected.assetName} in this release`,
        );
      }

      const expectedSignature = signatureContents?.[expected.signatureName];
      if (
        typeof expectedSignature !== 'string' ||
        expectedSignature.trim().length === 0
      ) {
        errors.push(`signature content is missing for ${expected.signatureName}`);
      } else if (
        typeof platform.signature !== 'string' ||
        platform.signature.trim() !== expectedSignature.trim()
      ) {
        errors.push(
          `${platformName} signature does not match ${expected.signatureName}`,
        );
      }
    }

    const expectedPlatformNames = new Set(
      Object.keys(REQUIRED_UPDATER_PLATFORMS),
    );
    for (const platformName of Object.keys(platforms)) {
      if (!expectedPlatformNames.has(platformName)) {
        errors.push(`unexpected latest.json platform ${platformName}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Release verification failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return {
    assetCount: EXPECTED_RELEASE_ASSET_NAMES.length,
    platformCount: Object.keys(REQUIRED_UPDATER_PLATFORMS).length,
    version,
  };
}

export async function verifyGitHubDraftRelease({
  expectedSourceSha,
  expectedTag,
  fetchImpl = fetch,
  token,
}) {
  if (!token) {
    throw new Error('GITHUB_TOKEN is required to inspect the draft release');
  }

  const releases = await requestJson(
    `${GITHUB_API_ROOT}/repos/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases?per_page=100`,
    { fetchImpl, token },
  );
  if (!Array.isArray(releases)) {
    throw new Error('GitHub Releases API returned an invalid response');
  }

  const release = releases.find((candidate) => candidate?.tag_name === expectedTag);
  if (!release) {
    throw new Error(`Draft release ${expectedTag} was not found in madora-site`);
  }

  const assetsByName = new Map(
    Array.isArray(release.assets)
      ? release.assets.map((asset) => [asset.name, asset])
      : [],
  );
  const textAssetNames = [
    'latest.json',
    'Madora_aarch64.app.tar.gz.sig',
    'Madora_x64.app.tar.gz.sig',
    'Madora_x64-setup.exe.sig',
  ];
  const textAssets = await Promise.all(
    textAssetNames.map(async (name) => {
      const asset = assetsByName.get(name);
      if (!asset?.url) {
        return [name, null];
      }
      if (!isExpectedAssetApiUrl(asset.url, asset.id)) {
        throw new Error(`Release asset ${name} has an unexpected API URL`);
      }
      return [
        name,
        await requestText(asset.url, {
          fetchImpl,
          maxBytes: name === 'latest.json' ? 128 * 1024 : 16 * 1024,
          token,
        }),
      ];
    }),
  );
  const textByName = Object.fromEntries(textAssets);

  let latestJson = null;
  if (typeof textByName['latest.json'] === 'string') {
    try {
      latestJson = JSON.parse(textByName['latest.json']);
    } catch {
      throw new Error('latest.json is not valid JSON');
    }
  }

  return validateReleaseSnapshot({
    expectedSourceSha,
    expectedTag,
    latestJson,
    release,
    signatureContents: textByName,
  });
}

async function requestJson(url, options) {
  const text = await requestText(url, {
    ...options,
    accept: 'application/vnd.github+json',
    maxBytes: 2 * 1024 * 1024,
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('GitHub API returned invalid JSON');
  }
}

async function requestText(
  url,
  { accept = 'application/octet-stream', fetchImpl, maxBytes, token },
) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'User-Agent': 'madora-release-verifier',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`GitHub API response exceeds ${maxBytes} bytes`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error(`GitHub API response exceeds ${maxBytes} bytes`);
  }
  return new TextDecoder().decode(bytes);
}

function isExpectedAssetApiUrl(value, assetId) {
  return (
    typeof value === 'string' &&
    value ===
      `${GITHUB_API_ROOT}/repos/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases/assets/${assetId}`
  );
}

async function runCli() {
  const expectedSourceSha = process.env.GITHUB_SHA ?? '';
  const expectedTag = process.env.GITHUB_REF_NAME ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  const attempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await verifyGitHubDraftRelease({
        expectedSourceSha,
        expectedTag,
        token,
      });
      process.stdout.write(
        `Verified Madora v${result.version} draft: ${result.assetCount} assets and ${result.platformCount} updater targets.\n`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        process.stderr.write(
          `Draft release verification attempt ${attempt}/${attempts} is incomplete; retrying in 5 seconds.\n`,
        );
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
      }
    }
  }

  throw lastError;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
