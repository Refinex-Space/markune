import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GITHUB_UPDATER_ENDPOINT =
  'https://github.com/Refinex-Space/markune/releases/latest/download/latest.json';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = dirname(dirname(scriptPath));

export function validateReleaseVersion(packageVersion, tauriVersion, tagName) {
  const semverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

  if (!semverPattern.test(packageVersion)) {
    throw new Error(`package.json version is not valid SemVer: ${packageVersion}`);
  }
  if (packageVersion !== tauriVersion) {
    throw new Error(
      `Version mismatch: package.json=${packageVersion}, tauri.conf.json=${tauriVersion}`,
    );
  }
  if (tagName && tagName !== `v${packageVersion}`) {
    throw new Error(
      `Release tag mismatch: expected v${packageVersion}, received ${tagName}`,
    );
  }

  return packageVersion;
}

export function normalizeUpdaterPublicKey(value) {
  const rawValue = String(value ?? '').trim();
  let minisignPublicKey;

  if (rawValue.includes('\n') || rawValue.includes('\r')) {
    minisignPublicKey = normalizeMinisignPublicKey(rawValue);
  } else {
    if (!isCanonicalBase64(rawValue)) {
      throwInvalidUpdaterPublicKey();
    }

    const decodedValue = Buffer.from(rawValue, 'base64').toString('utf8');
    minisignPublicKey = normalizeMinisignPublicKey(decodedValue);
  }

  return Buffer.from(minisignPublicKey, 'utf8').toString('base64');
}

function normalizeMinisignPublicKey(value) {
  const lines = value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    lines.length !== 2 ||
    !lines[0].startsWith('untrusted comment: minisign public key:') ||
    !lines[1].startsWith('RW') ||
    lines[1].length < 22 ||
    !isCanonicalBase64(lines[1])
  ) {
    throwInvalidUpdaterPublicKey();
  }

  return `${lines[0]}\n${lines[1]}`;
}

function isCanonicalBase64(value) {
  if (
    !value ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return false;
  }

  return Buffer.from(value, 'base64').toString('base64') === value;
}

function throwInvalidUpdaterPublicKey() {
  throw new Error(
    'MARKUNE_UPDATER_PUBLIC_KEY must be the Base64 content of the Tauri-generated .key.pub file or a complete two-line minisign public key.',
  );
}

export function createReleaseUpdaterConfig(publicKey) {
  return {
    bundle: {
      createUpdaterArtifacts: true,
      macOS: {
        signingIdentity: '-',
      },
    },
    plugins: {
      updater: {
        endpoints: [GITHUB_UPDATER_ENDPOINT],
        pubkey: normalizeUpdaterPublicKey(publicKey),
        windows: {
          installMode: 'passive',
        },
      },
    },
  };
}

export async function prepareReleaseUpdaterConfig({
  env = process.env,
  root = projectRoot,
} = {}) {
  const [packageJson, tauriConfig] = await Promise.all([
    readJson(join(root, 'package.json')),
    readJson(join(root, 'src-tauri', 'tauri.conf.json')),
  ]);
  const tagName = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : null;
  const version = validateReleaseVersion(
    packageJson.version,
    tauriConfig.version,
    tagName,
  );
  const config = createReleaseUpdaterConfig(env.MARKUNE_UPDATER_PUBLIC_KEY);
  const outputPath = join(root, '.tauri-build', 'tauri.release.generated.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return { outputPath, version };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  prepareReleaseUpdaterConfig()
    .then(({ version }) => {
      process.stdout.write(
        `Prepared updater release config for Markune v${version}: .tauri-build/tauri.release.generated.json\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
