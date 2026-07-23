import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPDATER_ENDPOINT =
  'https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json';

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
  const lines = String(value ?? '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    lines.length !== 2 ||
    !lines[0].startsWith('untrusted comment:') ||
    !/^RW[A-Za-z0-9+/=]{20,}$/.test(lines[1])
  ) {
    throw new Error(
      'MADORA_UPDATER_PUBLIC_KEY must contain the complete two-line minisign public key.',
    );
  }

  return `${lines[0]}\n${lines[1]}`;
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
        endpoints: [UPDATER_ENDPOINT],
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
  const config = createReleaseUpdaterConfig(env.MADORA_UPDATER_PUBLIC_KEY);
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
        `Prepared updater release config for Madora v${version}: .tauri-build/tauri.release.generated.json\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
