import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILD_RELEASE_ASSET_NAMES,
  buildGitHubReleaseAssetUrl,
  buildOssObjectUrl,
  createDownloadManifest,
  createUpdaterManifest,
  PUBLISHED_RELEASE_ASSET_NAMES,
  validateDistributionEnvironment,
} from './release-distribution.mjs';

const tag = 'v1.2.3';
const bucket = 'madora-releases-example1';
const publicBaseUrl = `https://${bucket}.oss-cn-shanghai.aliyuncs.com`;
const signatures = {
  'Madora_aarch64.app.tar.gz.sig': 'arm-signature',
  'Madora_x64.app.tar.gz.sig': 'intel-signature',
  'Madora_x64-setup.exe.sig': 'windows-signature',
};

test('published release adds only the GitHub fallback manifest', () => {
  assert.deepEqual(PUBLISHED_RELEASE_ASSET_NAMES, [
    ...BUILD_RELEASE_ASSET_NAMES,
    'latest-github.json',
  ]);
});

test('distribution variables are fail-closed and bound to Shanghai', () => {
  const result = validateDistributionEnvironment({
    MADORA_OSS_BUCKET: bucket,
    MADORA_OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
    MADORA_OSS_PUBLIC_BASE_URL: publicBaseUrl,
    MADORA_OSS_REGION: 'cn-shanghai',
    MADORA_OSS_ROLE_ARN: 'acs:ram::1234567890123456:role/madora-github-release',
    MADORA_OSS_OIDC_PROVIDER_ARN:
      'acs:ram::1234567890123456:oidc-provider/github-actions',
  });

  assert.equal(result.bucket, bucket);
  assert.equal(result.publicBaseUrl, publicBaseUrl);
  assert.throws(
    () =>
      validateDistributionEnvironment({
        ...process.env,
        MADORA_OSS_BUCKET: bucket,
        MADORA_OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com',
        MADORA_OSS_PUBLIC_BASE_URL: publicBaseUrl,
        MADORA_OSS_REGION: 'cn-hangzhou',
        MADORA_OSS_ROLE_ARN:
          'acs:ram::1234567890123456:role/madora-github-release',
        MADORA_OSS_OIDC_PROVIDER_ARN:
          'acs:ram::1234567890123456:oidc-provider/github-actions',
      }),
    /cn-shanghai/,
  );
});

test('primary and fallback updater manifests share notes and signatures', () => {
  const common = {
    releaseNotes: '公开且最终的 Release Notes',
    signatureContents: signatures,
    tag,
    timestamp: '2026-07-25T00:00:00Z',
  };
  const primary = createUpdaterManifest({
    ...common,
    assetUrlForName: (name) =>
      buildOssObjectUrl(publicBaseUrl, `releases/${tag}/${name}`),
  });
  const fallback = createUpdaterManifest({
    ...common,
    assetUrlForName: (name) => buildGitHubReleaseAssetUrl(tag, name),
  });

  assert.equal(primary.notes, fallback.notes);
  assert.equal(
    primary.platforms['darwin-aarch64'].url,
    `${publicBaseUrl}/releases/v1.2.3/Madora_aarch64.app.tar.gz`,
  );
  assert.equal(
    fallback.platforms['windows-x86_64'].url,
    'https://github.com/Refinex-Space/madora-site/releases/download/v1.2.3/Madora_x64-setup.exe',
  );
  assert.equal(
    primary.platforms['windows-x86_64'].signature,
    'windows-signature',
  );
});

test('download manifest contains only supported installers with hashes', () => {
  const metadata = Object.fromEntries(
    [
      'Madora_aarch64.dmg',
      'Madora_x64.dmg',
      'Madora_x64-setup.exe',
    ].map((name) => [
      name,
      {
        size: 128,
        sha256: 'a'.repeat(64),
        url: buildOssObjectUrl(publicBaseUrl, `releases/${tag}/${name}`),
      },
    ]),
  );
  const manifest = createDownloadManifest({
    artifactMetadata: metadata,
    releaseUrl: `https://github.com/Refinex-Space/madora-site/releases/tag/${tag}`,
    tag,
    timestamp: '2026-07-25T00:00:00Z',
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(Object.keys(manifest.artifacts), [
    'macos-arm64-dmg',
    'macos-x64-dmg',
    'windows-x64-exe',
  ]);
});
