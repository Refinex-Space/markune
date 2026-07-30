import { createHash } from 'node:crypto';

export const DISTRIBUTION_OWNER = 'Refinex-Space';
export const DISTRIBUTION_REPO = 'madora-site';
export const OSS_REGION = 'cn-shanghai';
export const OSS_ENDPOINT = 'https://oss-cn-shanghai.aliyuncs.com';

export const RELEASE_ARTIFACT_NAMES = Object.freeze([
  'Madora_aarch64.dmg',
  'Madora_aarch64.app.tar.gz',
  'Madora_aarch64.app.tar.gz.sig',
  'Madora_x64.dmg',
  'Madora_x64.app.tar.gz',
  'Madora_x64.app.tar.gz.sig',
  'Madora_x64-setup.exe',
  'Madora_x64-setup.exe.sig',
]);

export const BUILD_RELEASE_ASSET_NAMES = Object.freeze([
  ...RELEASE_ARTIFACT_NAMES,
  'latest.json',
]);

export const PUBLISHED_RELEASE_ASSET_NAMES = Object.freeze([
  ...BUILD_RELEASE_ASSET_NAMES,
  'latest-github.json',
]);

export const UPDATER_TARGETS = Object.freeze({
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

export const DOWNLOAD_TARGETS = Object.freeze({
  'macos-arm64-dmg': 'Madora_aarch64.dmg',
  'macos-x64-dmg': 'Madora_x64.dmg',
  'windows-x64-exe': 'Madora_x64-setup.exe',
});

export function validateDistributionEnvironment(env = process.env) {
  const required = [
    'MADORA_OSS_BUCKET',
    'MADORA_OSS_ENDPOINT',
    'MADORA_OSS_PUBLIC_BASE_URL',
    'MADORA_OSS_REGION',
    'MADORA_OSS_ROLE_ARN',
    'MADORA_OSS_OIDC_PROVIDER_ARN',
  ];
  const missing = required.filter((name) => !String(env[name] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`Missing GitHub Actions Variables: ${missing.join(', ')}`);
  }

  if (env.MADORA_OSS_REGION !== OSS_REGION) {
    throw new Error(`MADORA_OSS_REGION must be ${OSS_REGION}`);
  }
  if (env.MADORA_OSS_ENDPOINT !== OSS_ENDPOINT) {
    throw new Error(`MADORA_OSS_ENDPOINT must be ${OSS_ENDPOINT}`);
  }

  const bucket = String(env.MADORA_OSS_BUCKET);
  if (!/^madora-releases-[a-z0-9](?:[a-z0-9-]{0,45}[a-z0-9])?$/.test(bucket)) {
    throw new Error(
      'MADORA_OSS_BUCKET must match madora-releases-<unique-suffix> and OSS bucket naming limits.',
    );
  }

  const publicBaseUrl = normalizePublicBaseUrl(env.MADORA_OSS_PUBLIC_BASE_URL);
  if (publicBaseUrl !== `https://${bucket}.oss-cn-shanghai.aliyuncs.com`) {
    throw new Error('MADORA_OSS_PUBLIC_BASE_URL does not match MADORA_OSS_BUCKET');
  }
  if (!/^acs:ram::\d+:role\/madora-github-release$/i.test(env.MADORA_OSS_ROLE_ARN)) {
    throw new Error('MADORA_OSS_ROLE_ARN must reference role madora-github-release');
  }
  if (
    !/^acs:ram::\d+:oidc-provider\/github-actions$/i.test(
      env.MADORA_OSS_OIDC_PROVIDER_ARN,
    )
  ) {
    throw new Error(
      'MADORA_OSS_OIDC_PROVIDER_ARN must reference provider github-actions',
    );
  }

  return {
    bucket,
    endpoint: OSS_ENDPOINT,
    publicBaseUrl,
    region: OSS_REGION,
  };
}

export function normalizePublicBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('OSS public base URL is invalid');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith('.oss-cn-shanghai.aliyuncs.com')
  ) {
    throw new Error('OSS public base URL must be a path-free Shanghai HTTPS domain');
  }

  return `https://${url.hostname}`;
}

export function buildOssObjectUrl(publicBaseUrl, objectKey) {
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  const segments = String(objectKey)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  if (segments.length === 0) {
    throw new Error('OSS object key is required');
  }
  return `${baseUrl}/${segments.join('/')}`;
}

export function buildGitHubReleaseAssetUrl(tag, assetName) {
  validateReleaseTag(tag);
  return `https://github.com/${DISTRIBUTION_OWNER}/${DISTRIBUTION_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

export function createUpdaterManifest({
  assetUrlForName,
  releaseNotes,
  signatureContents,
  tag,
  timestamp,
}) {
  validateReleaseTag(tag);
  if (typeof assetUrlForName !== 'function') {
    throw new Error('assetUrlForName must be a function');
  }
  if (!String(releaseNotes ?? '').trim()) {
    throw new Error('Release notes must not be empty');
  }
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Updater timestamp must be RFC 3339');
  }

  const platforms = Object.fromEntries(
    Object.entries(UPDATER_TARGETS).map(([platformName, target]) => {
      const signature = String(signatureContents?.[target.signatureName] ?? '').trim();
      if (!signature) {
        throw new Error(`Missing updater signature ${target.signatureName}`);
      }
      const url = assetUrlForName(target.assetName);
      assertHttpsUrl(url, `${platformName} updater URL`);
      return [platformName, { signature, url }];
    }),
  );

  return {
    version: tag.slice(1),
    notes: String(releaseNotes).trim(),
    pub_date: new Date(timestamp).toISOString(),
    platforms,
  };
}

export function createDownloadManifest({ artifactMetadata, releaseUrl, tag, timestamp }) {
  validateReleaseTag(tag);
  assertHttpsUrl(releaseUrl, 'release URL');
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Download manifest timestamp must be RFC 3339');
  }

  const artifacts = Object.fromEntries(
    Object.entries(DOWNLOAD_TARGETS).map(([targetName, assetName]) => {
      const metadata = artifactMetadata?.[assetName];
      if (!metadata || !Number.isInteger(metadata.size) || metadata.size <= 0) {
        throw new Error(`Missing size for ${assetName}`);
      }
      if (!/^[0-9a-f]{64}$/.test(metadata.sha256)) {
        throw new Error(`Invalid SHA-256 for ${assetName}`);
      }
      assertHttpsUrl(metadata.url, `${assetName} URL`);
      return [
        targetName,
        {
          name: assetName,
          url: metadata.url,
          size: metadata.size,
          sha256: metadata.sha256,
        },
      ];
    }),
  );

  return {
    schemaVersion: 1,
    version: tag.slice(1),
    publishedAt: new Date(timestamp).toISOString(),
    releaseUrl,
    artifacts,
  };
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateReleaseTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(tag ?? ''))) {
    throw new Error(`Invalid release tag: ${String(tag)}`);
  }
  return tag;
}

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} must use HTTPS without embedded credentials`);
  }
}
