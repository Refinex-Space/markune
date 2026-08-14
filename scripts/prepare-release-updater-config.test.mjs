import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createReleaseUpdaterConfig,
  GITHUB_UPDATER_ENDPOINT,
  normalizeUpdaterPublicKey,
  prepareReleaseUpdaterConfig,
  validateReleaseVersion,
} from './prepare-release-updater-config.mjs';

const minisignPublicKey =
  'untrusted comment: minisign public key: 0123456789ABCDEF\nRWRmYWRvcmFVcGRhdGVyUHVibGljS2V5MDEyMzQ1Njc4OQ==';
const publicKey = Buffer.from(minisignPublicKey, 'utf8').toString('base64');

test('release config uses the Markune GitHub release as its only endpoint', () => {
  const config = createReleaseUpdaterConfig(publicKey);

  assert.equal(
    GITHUB_UPDATER_ENDPOINT,
    'https://github.com/Refinex-Space/markune/releases/latest/download/latest.json',
  );
  assert.deepEqual(config.plugins.updater.endpoints, [GITHUB_UPDATER_ENDPOINT]);
  assert.equal(config.plugins.updater.pubkey, publicKey);
  assert.equal(config.plugins.updater.windows.installMode, 'passive');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.equal(config.bundle.macOS.signingIdentity, '-');
});

test('base Tauri config keeps updater inert for local development', async () => {
  const tauriConfig = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );

  assert.deepEqual(tauriConfig.plugins?.updater, {
    endpoints: [],
    pubkey: '',
  });
});

test('release workflows build a draft and publish it manually in the current repository', async () => {
  const [workflow, publishWorkflow] = await Promise.all([
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
    readFile(
      new URL('../.github/workflows/publish-release.yml', import.meta.url),
      'utf8',
    ),
  ]);
  const combinedWorkflows = `${workflow}\n${publishWorkflow}`;

  assert.match(workflow, /branches:\s+\- dev/);
  assert.match(workflow, /tags:\s+\- 'v\*'/);
  assert.equal(workflow.match(/bundles: app,dmg/g)?.length, 2);
  assert.match(workflow, /bundles: nsis/);
  assert.match(workflow, /releaseAssetNamePattern: Markune_\[arch\]\[setup\]\[ext\]/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /gh release edit .* --draft=false/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /ref: \$\{\{ inputs\.tag \}\}/);
  assert.match(publishWorkflow, /environment: production-release/);
  assert.match(publishWorkflow, /node scripts\/verify-release-assets\.mjs/);
  assert.match(publishWorkflow, /gh release edit .* --draft=false/);
  assert.doesNotMatch(
    combinedWorkflows,
    /markune-site|MARKUNE_OSS|MARKUNE_RELEASES_TOKEN/,
  );
  assert.doesNotMatch(combinedWorkflows, /owner:|repo:/);
});

test('release workflow verifies source before native tag builds', async () => {
  const [workflow, tauriConfig] = await Promise.all([
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  ]);
  const verifyJob = workflow.slice(
    workflow.indexOf('  verify:'),
    workflow.indexOf('\n  publish:'),
  );

  assert.doesNotMatch(verifyJob, /cargo (?:test|check|build)/);
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/);
  assert.match(workflow, /tauri-apps\/tauri-action@v1/);
  assert.doesNotMatch(workflow, /publish_release:/);

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

test('public key validation accepts Tauri Base64 and minisign formats', () => {
  assert.equal(normalizeUpdaterPublicKey(`  ${publicKey}\n`), publicKey);
  assert.equal(normalizeUpdaterPublicKey(`  ${minisignPublicKey}\n`), publicKey);
  assert.throws(
    () => normalizeUpdaterPublicKey('not-base64***'),
    /Tauri-generated.*\.key\.pub/,
  );
});

test('release preparation writes a GitHub-only Tauri override', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markune-release-config-'));
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
        MARKUNE_UPDATER_PUBLIC_KEY: publicKey,
      },
      root,
    });
    const generated = await readFile(result.outputPath, 'utf8');
    const generatedConfig = JSON.parse(generated);

    assert.equal(result.version, '1.2.3');
    assert.deepEqual(generatedConfig.plugins.updater.endpoints, [
      GITHUB_UPDATER_ENDPOINT,
    ]);
    assert.equal(generatedConfig.plugins.updater.pubkey, publicKey);
    assert.doesNotMatch(generated, /OSS|latest-github|markune-site/);
    assert.doesNotMatch(generated, /TAURI_SIGNING_PRIVATE_KEY/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
