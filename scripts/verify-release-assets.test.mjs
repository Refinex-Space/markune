import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_RELEASE_ASSET_NAMES,
  validateReleaseSnapshot,
  verifyGitHubDraftRelease,
} from './verify-release-assets.mjs';

const tag = 'v0.1.12';
const sourceSha = '0123456789abcdef0123456789abcdef01234567';

function createAsset(name, id) {
  return {
    id,
    name,
    size: 128,
    url: `https://api.github.com/repos/Refinex-Space/madora-site/releases/assets/${id}`,
  };
}

function createValidSnapshot() {
  const assets = EXPECTED_RELEASE_ASSET_NAMES.map((name, index) =>
    createAsset(name, index + 1),
  );
  const assetByName = new Map(assets.map((asset) => [asset.name, asset]));
  const signatures = {
    'Madora_aarch64.app.tar.gz.sig': 'arm-signature',
    'Madora_x64.app.tar.gz.sig': 'intel-signature',
    'Madora_x64-setup.exe.sig': 'windows-signature',
  };
  const platform = (assetName, signatureName) => ({
    signature: signatures[signatureName],
    url: assetByName.get(assetName).url,
  });

  return {
    release: {
      body: `## Madora ${tag}\n\n本版本包含功能改进、体验优化和问题修复。`,
      draft: true,
      name: 'Madora v0.1.12',
      prerelease: false,
      tag_name: tag,
      target_commitish: 'main',
      assets,
    },
    latestJson: {
      version: '0.1.12',
      notes: 'release notes',
      pub_date: '2026-07-24T00:00:00.000Z',
      platforms: {
        'darwin-aarch64': platform(
          'Madora_aarch64.app.tar.gz',
          'Madora_aarch64.app.tar.gz.sig',
        ),
        'darwin-aarch64-app': platform(
          'Madora_aarch64.app.tar.gz',
          'Madora_aarch64.app.tar.gz.sig',
        ),
        'darwin-x86_64': platform(
          'Madora_x64.app.tar.gz',
          'Madora_x64.app.tar.gz.sig',
        ),
        'darwin-x86_64-app': platform(
          'Madora_x64.app.tar.gz',
          'Madora_x64.app.tar.gz.sig',
        ),
        'windows-x86_64': platform(
          'Madora_x64-setup.exe',
          'Madora_x64-setup.exe.sig',
        ),
        'windows-x86_64-nsis': platform(
          'Madora_x64-setup.exe',
          'Madora_x64-setup.exe.sig',
        ),
      },
    },
    signatureContents: signatures,
  };
}

test('accepts a complete three-target draft release', () => {
  const snapshot = createValidSnapshot();

  const result = validateReleaseSnapshot({
    ...snapshot,
    expectedSourceSha: sourceSha,
    expectedTag: tag,
  });

  assert.deepEqual(result, {
    assetCount: EXPECTED_RELEASE_ASSET_NAMES.length,
    platformCount: 6,
    version: '0.1.12',
  });
});

test('rejects the macOS updater omissions seen in v0.1.11', () => {
  const snapshot = createValidSnapshot();
  snapshot.release.assets = snapshot.release.assets.filter(
    (asset) => !asset.name.includes('.app.tar.gz'),
  );
  delete snapshot.latestJson.platforms['darwin-aarch64'];
  delete snapshot.latestJson.platforms['darwin-aarch64-app'];
  delete snapshot.latestJson.platforms['darwin-x86_64'];
  delete snapshot.latestJson.platforms['darwin-x86_64-app'];

  assert.throws(
    () =>
      validateReleaseSnapshot({
        ...snapshot,
        expectedSourceSha: sourceSha,
        expectedTag: tag,
      }),
    (error) => {
      assert.match(error.message, /Madora_aarch64\.app\.tar\.gz/);
      assert.match(error.message, /darwin-aarch64/);
      assert.match(error.message, /darwin-x86_64/);
      return true;
    },
  );
});

test('rejects updater URLs or signatures that do not match release assets', () => {
  const snapshot = createValidSnapshot();
  snapshot.latestJson.platforms['darwin-aarch64'].url =
    'https://example.com/untrusted-update.tar.gz';
  snapshot.latestJson.platforms['windows-x86_64'].signature =
    'wrong-signature';

  assert.throws(
    () =>
      validateReleaseSnapshot({
        ...snapshot,
        expectedSourceSha: sourceSha,
        expectedTag: tag,
      }),
    (error) => {
      assert.match(error.message, /darwin-aarch64 URL/);
      assert.match(error.message, /windows-x86_64 signature/);
      return true;
    },
  );
});

test('rejects a published or prerelease release', () => {
  const snapshot = createValidSnapshot();
  snapshot.release.draft = false;
  snapshot.release.prerelease = true;

  assert.throws(
    () =>
      validateReleaseSnapshot({
        ...snapshot,
        expectedSourceSha: sourceSha,
        expectedTag: tag,
      }),
    (error) => {
      assert.match(error.message, /must remain a draft/);
      assert.match(error.message, /must not be a prerelease/);
      return true;
    },
  );
});

test('rejects private source metadata in user-visible release notes', () => {
  const snapshot = createValidSnapshot();
  snapshot.release.body = [
    `Madora ${tag} 安装包与自动更新资源。`,
    '',
    `构建来源：私有 madora 仓库 commit \`${sourceSha}\`。`,
    '',
    '正式发布前必须补充用户可见的更新说明并完成手册中的验收。',
  ].join('\n');

  assert.throws(
    () =>
      validateReleaseSnapshot({
        ...snapshot,
        expectedSourceSha: sourceSha,
        expectedTag: tag,
      }),
    /release body must not expose private source metadata/,
  );
});

test('rejects private source metadata in latest.json notes', () => {
  const snapshot = createValidSnapshot();
  snapshot.latestJson.notes = `构建来源：私有 madora 仓库 commit \`${sourceSha}\`。`;

  assert.throws(
    () =>
      validateReleaseSnapshot({
        ...snapshot,
        expectedSourceSha: sourceSha,
        expectedTag: tag,
      }),
    /latest\.json notes must not expose private source metadata/,
  );
});

test('allows the public madora-site release URL in user-visible release notes', () => {
  const snapshot = createValidSnapshot();
  snapshot.release.body = [
    `## Madora ${tag}`,
    '',
    '下载地址：https://github.com/Refinex-Space/madora-site/releases',
  ].join('\n');

  assert.doesNotThrow(() =>
    validateReleaseSnapshot({
      ...snapshot,
      expectedSourceSha: sourceSha,
      expectedTag: tag,
    }),
  );
});

test('uses GitHub JSON media type for release metadata and binary media type for assets', async () => {
  const snapshot = createValidSnapshot();
  const requestAcceptHeaders = [];
  const textByAssetName = {
    'latest.json': JSON.stringify(snapshot.latestJson),
    ...snapshot.signatureContents,
  };
  const assetNameByUrl = new Map(
    snapshot.release.assets.map((asset) => [asset.url, asset.name]),
  );

  const result = await verifyGitHubDraftRelease({
    expectedSourceSha: sourceSha,
    expectedTag: tag,
    token: 'test-token',
    fetchImpl: async (url, options) => {
      requestAcceptHeaders.push([url, options.headers.Accept]);
      if (url.includes('/releases?per_page=')) {
        return new Response(JSON.stringify([snapshot.release]), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      const assetName = assetNameByUrl.get(url);
      return new Response(textByAssetName[assetName] ?? '', { status: 200 });
    },
  });

  assert.equal(result.version, '0.1.12');
  assert.equal(requestAcceptHeaders[0][1], 'application/vnd.github+json');
  assert.deepEqual(
    requestAcceptHeaders.slice(1).map(([, accept]) => accept),
    Array(4).fill('application/octet-stream'),
  );
});

test('never sends the release token to an unexpected asset URL', async () => {
  const snapshot = createValidSnapshot();
  const latestAsset = snapshot.release.assets.find(
    (asset) => asset.name === 'latest.json',
  );
  latestAsset.url = 'https://example.com/latest.json';
  let requestedUnexpectedUrl = false;

  await assert.rejects(
    verifyGitHubDraftRelease({
      expectedSourceSha: sourceSha,
      expectedTag: tag,
      token: 'test-token',
      fetchImpl: async (url) => {
        if (url.includes('/releases?per_page=')) {
          return new Response(JSON.stringify([snapshot.release]), {
            status: 200,
          });
        }
        if (url.startsWith('https://example.com/')) {
          requestedUnexpectedUrl = true;
        }
        return new Response('', { status: 200 });
      },
    }),
    /latest\.json has an unexpected API URL/,
  );
  assert.equal(requestedUnexpectedUrl, false);
});
