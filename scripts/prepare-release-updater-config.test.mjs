import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createReleaseUpdaterConfig,
  GITHUB_UPDATER_FALLBACK_ENDPOINT,
  normalizeOssPublicBaseUrl,
  normalizeUpdaterPublicKey,
  prepareReleaseUpdaterConfig,
  validateReleaseVersion,
} from './prepare-release-updater-config.mjs';

const minisignPublicKey =
  'untrusted comment: minisign public key: 0123456789ABCDEF\nRWRmYWRvcmFVcGRhdGVyUHVibGljS2V5MDEyMzQ1Njc4OQ==';
const publicKey = Buffer.from(minisignPublicKey, 'utf8').toString('base64');

const ossPublicBaseUrl =
  'https://madora-releases-example.oss-cn-shanghai.aliyuncs.com';

test('release config uses Shanghai OSS first and GitHub as metadata fallback', () => {
  const config = createReleaseUpdaterConfig(publicKey, ossPublicBaseUrl);

  assert.equal(
    GITHUB_UPDATER_FALLBACK_ENDPOINT,
    'https://github.com/Refinex-Space/madora-site/releases/latest/download/latest-github.json',
  );
  assert.deepEqual(config.plugins.updater.endpoints, [
    `${ossPublicBaseUrl}/updates/stable/latest.json`,
    GITHUB_UPDATER_FALLBACK_ENDPOINT,
  ]);
  assert.equal(
    normalizeOssPublicBaseUrl(`${ossPublicBaseUrl}/`),
    ossPublicBaseUrl,
  );
  assert.equal(config.plugins.updater.pubkey, publicKey);
  assert.equal(config.plugins.updater.windows.installMode, 'passive');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.equal(config.bundle.macOS.signingIdentity, '-');
});

test('release config rejects non-Shanghai or ambiguous OSS public URLs', () => {
  for (const value of [
    'http://madora-releases-example.oss-cn-shanghai.aliyuncs.com',
    'https://madora-releases-example.oss-cn-hangzhou.aliyuncs.com',
    'https://madora-releases-example.oss-cn-shanghai.aliyuncs.com/prefix',
    'https://user@example.com',
  ]) {
    assert.throws(() => normalizeOssPublicBaseUrl(value), /cn-shanghai/);
  }
});

test('base Tauri config keeps updater inert but structurally valid for local development', async () => {
  const tauriConfig = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );

  assert.deepEqual(tauriConfig.plugins?.updater, {
    endpoints: [],
    pubkey: '',
  });
});

test('release workflow publishes public-safe notes without OS signing secrets', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const releaseBody = workflow.slice(
    workflow.indexOf('          releaseBody: |'),
    workflow.indexOf('          releaseCommitish: main'),
  );

  assert.match(workflow, /contents: read/);
  assert.match(workflow, /MADORA_RELEASES_TOKEN/);
  assert.match(workflow, /owner: Refinex-Space/);
  assert.match(workflow, /repo: madora-site/);
  assert.match(workflow, /releaseCommitish: main/);
  assert.match(releaseBody, /本版本包含功能改进、体验优化和问题修复/);
  assert.doesNotMatch(releaseBody, /github\.sha/);
  assert.doesNotMatch(releaseBody, /构建来源|私有 madora 仓库|正式发布前必须/);
  assert.equal(workflow.match(/run: pnpm release:prepare/g)?.length, 2);
  assert.doesNotMatch(workflow, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /APPLE_/);
});

test('release workflow uses Node 24 and a non-broken pnpm release', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );

  assert.equal(workflow.match(/actions\/checkout@v7/g)?.length, 3);
  assert.equal(workflow.match(/pnpm\/action-setup@v6/g)?.length, 2);
  assert.equal(workflow.match(/actions\/setup-node@v7/g)?.length, 3);
  assert.equal(workflow.match(/version: 11\.16\.0/g)?.length, 2);
  assert.equal(workflow.match(/node-version: 24/g)?.length, 3);
  assert.doesNotMatch(workflow, /11\.12\.0/);
  assert.doesNotMatch(workflow, /node-version: 20/);
});

test('release workflow builds macOS updater bundles and gates the completed draft', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );

  assert.equal(workflow.match(/bundles: app,dmg/g)?.length, 2);
  assert.doesNotMatch(workflow, /bundles: dmg(?:\s|$)/);
  assert.match(workflow, /verify_release:\s+name: Verify draft release assets/);
  assert.match(workflow, /needs: publish/);
  assert.match(workflow, /run: node scripts\/verify-release-assets\.mjs/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.MADORA_RELEASES_TOKEN \}\}/);
  assert.match(workflow, /scripts\/verify-release-assets\.mjs/);
  assert.match(workflow, /scripts\/verify-release-assets\.test\.mjs/);
});

test('promotion workflow uses protected OIDC and pinned Alibaba tooling', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/promote-release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /environment: production-release/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /contents: read/);
  assert.match(
    workflow,
    /aliyun\/configure-aliyun-credentials-action@1e5248c8d5d93a8781ac344a68e19a43341e79e6/,
  );
  assert.match(workflow, /audience: sts\.aliyuncs\.com/);
  assert.match(workflow, /ossutil-2\.3\.0-linux-amd64\.zip/);
  assert.match(
    workflow,
    /3ae4d9fc85a7a6e9f5654d1599766f1a3a42a3692870887b5ae9338d582ef65a/,
  );
  assert.match(workflow, /scripts\/print-oidc-claims\.mjs/);
  assert.doesNotMatch(workflow, /ACCESS_KEY_ID|ACCESS_KEY_SECRET/);
});

test('release workflow verifies dev before tags and publishes only tags', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /branches:\s+\- dev/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /if: github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref_name, 'v'\)/,
  );
});

test('release verification avoids a Linux Tauri cold build while native builds stage sidecars', async () => {
  const [workflow, tauriConfig] = await Promise.all([
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  ]);
  const verifyJob = workflow.slice(
    workflow.indexOf('  verify:'),
    workflow.indexOf('\n  publish:'),
  );

  assert.doesNotMatch(verifyJob, /dtolnay\/rust-toolchain/);
  assert.doesNotMatch(verifyJob, /apt-get/);
  assert.doesNotMatch(verifyJob, /cargo (?:test|check|build)/);
  assert.doesNotMatch(verifyJob, /pnpm codex:stage/);
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/);
  assert.match(workflow, /tauri-apps\/tauri-action@v1/);

  const parsedTauriConfig = JSON.parse(tauriConfig);
  assert.equal(
    parsedTauriConfig.build.beforeBuildCommand,
    'pnpm codex:stage && pnpm document-export:stage && pnpm build:desktop:web',
  );
  assert.deepEqual(parsedTauriConfig.bundle.externalBin, [
    'binaries/codex',
    'binaries/pandoc',
    'binaries/typst',
  ]);
});

test('version validation requires package, Tauri, and tag versions to match', () => {
  assert.equal(validateReleaseVersion('1.2.3', '1.2.3', 'v1.2.3'), '1.2.3');
  assert.throws(
    () => validateReleaseVersion('1.2.3', '1.2.4', 'v1.2.3'),
    /Version mismatch/,
  );
  assert.throws(
    () => validateReleaseVersion('1.2.3', '1.2.3', 'v1.2.4'),
    /Release tag mismatch/,
  );
});

test('public key validation preserves the Base64 value generated by the Tauri CLI', () => {
  assert.equal(normalizeUpdaterPublicKey(`  ${publicKey}\n`), publicKey);
});

test('public key validation normalizes legacy two-line minisign input to Base64', () => {
  assert.equal(
    normalizeUpdaterPublicKey(`  ${minisignPublicKey}\n`),
    publicKey,
  );
});

test('public key validation rejects malformed Base64 and incomplete minisign values', () => {
  assert.throws(
    () => normalizeUpdaterPublicKey('not-base64***'),
    /Tauri-generated.*\.key\.pub/,
  );
  assert.throws(
    () => normalizeUpdaterPublicKey(
      Buffer.from('untrusted comment: incomplete', 'utf8').toString('base64'),
    ),
    /Tauri-generated.*\.key\.pub/,
  );
  assert.throws(
    () => normalizeUpdaterPublicKey(
      Buffer.from(
        `untrusted comment: minisign encrypted secret key\n${minisignPublicKey.split('\n')[1]}`,
        'utf8',
      ).toString('base64'),
    ),
    /Tauri-generated.*\.key\.pub/,
  );
});

test('release preparation writes an ignored Tauri override without private data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'madora-release-config-'));
  try {
    await mkdir(join(root, 'src-tauri'));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ version: '1.2.3' }),
    );
    await writeFile(
      join(root, 'src-tauri', 'tauri.conf.json'),
      JSON.stringify({ version: '1.2.3' }),
    );

    const result = await prepareReleaseUpdaterConfig({
      env: {
        GITHUB_REF_NAME: 'v1.2.3',
        GITHUB_REF_TYPE: 'tag',
        MADORA_OSS_PUBLIC_BASE_URL: ossPublicBaseUrl,
        MADORA_UPDATER_PUBLIC_KEY: publicKey,
      },
      root,
    });
    const generated = await readFile(result.outputPath, 'utf8');

    assert.equal(result.version, '1.2.3');
    const generatedConfig = JSON.parse(generated);

    assert.match(generated, /updates\/stable\/latest\.json/);
    assert.match(generated, /releases\/latest\/download\/latest-github\.json/);
    assert.equal(generatedConfig.plugins.updater.pubkey, publicKey);
    assert.doesNotMatch(generated, /untrusted comment:/);
    assert.doesNotMatch(generated, /TAURI_SIGNING_PRIVATE_KEY/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
