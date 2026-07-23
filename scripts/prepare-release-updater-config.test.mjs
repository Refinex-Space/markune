import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createReleaseUpdaterConfig,
  normalizeUpdaterPublicKey,
  prepareReleaseUpdaterConfig,
  UPDATER_ENDPOINT,
  validateReleaseVersion,
} from './prepare-release-updater-config.mjs';

const publicKey =
  'untrusted comment: minisign public key: 0123456789ABCDEF\nRWRmYWRvcmFVcGRhdGVyUHVibGljS2V5MDEyMzQ1Njc4OQ==';

test('release config contains only the fixed HTTPS updater endpoint', () => {
  const config = createReleaseUpdaterConfig(publicKey);

  assert.equal(
    UPDATER_ENDPOINT,
    'https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json',
  );
  assert.deepEqual(config.plugins.updater.endpoints, [UPDATER_ENDPOINT]);
  assert.equal(config.plugins.updater.pubkey, publicKey);
  assert.equal(config.plugins.updater.windows.installMode, 'passive');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.equal(config.bundle.macOS.signingIdentity, '-');
});

test('release workflow publishes to the public distribution repository without OS signing secrets', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /contents: read/);
  assert.match(workflow, /MADORA_RELEASES_TOKEN/);
  assert.match(workflow, /owner: Refinex-Space/);
  assert.match(workflow, /repo: madora-site/);
  assert.match(workflow, /releaseCommitish: main/);
  assert.match(workflow, /github\.sha/);
  assert.doesNotMatch(workflow, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /APPLE_/);
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

test('public key validation rejects incomplete or non-minisign values', () => {
  assert.equal(normalizeUpdaterPublicKey(`  ${publicKey}\n`), publicKey);
  assert.throws(() => normalizeUpdaterPublicKey('missing'), /two-line minisign/);
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
        MADORA_UPDATER_PUBLIC_KEY: publicKey,
      },
      root,
    });
    const generated = await readFile(result.outputPath, 'utf8');

    assert.equal(result.version, '1.2.3');
    assert.match(generated, /releases\/latest\/download\/latest\.json/);
    assert.doesNotMatch(generated, /TAURI_SIGNING_PRIVATE_KEY/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
