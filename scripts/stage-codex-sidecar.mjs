import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootRequire = createRequire(import.meta.url);
const codexPackagePath = rootRequire.resolve('@openai/codex/package.json');
const codexRequire = createRequire(codexPackagePath);
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(currentDir);
const target = resolveTarget();
const vendorPackage = `@openai/codex-${target.packageSuffix}`;
const source = codexRequire.resolve(
  `${vendorPackage}/vendor/${target.vendorTriple}/bin/codex${target.extension}`,
);
const destinationDir = join(projectRoot, 'src-tauri', 'binaries');
const destination = join(
  destinationDir,
  `codex-${target.tauriTriple}${target.extension}`,
);

await mkdir(destinationDir, { recursive: true });
const sourceProbe = probeVersion(source);
if (!sourceProbe) {
  throw new Error('Bundled Codex sidecar failed the version probe.');
}

const shouldCopy = !(await isCurrentSidecar(destination, source, sourceProbe));
if (shouldCopy) {
  await copyFile(source, destination);

  if (process.platform !== 'win32') {
    await chmod(destination, 0o755);
  }
}

const stagedProbe = probeVersion(destination);
if (!stagedProbe) {
  throw new Error('Staged Codex sidecar failed the version probe.');
}

process.stdout.write(
  `${shouldCopy ? 'Staged' : 'Reused'} ${stagedProbe} for ${target.tauriTriple}\n`,
);

async function isCurrentSidecar(destinationPath, sourcePath, expectedVersion) {
  try {
    const [destinationStat, sourceStat] = await Promise.all([
      stat(destinationPath),
      stat(sourcePath),
    ]);

    if (destinationStat.size !== sourceStat.size) {
      return false;
    }

    return probeVersion(destinationPath) === expectedVersion;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function probeVersion(binaryPath) {
  const probe = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' });

  if (probe.status !== 0) {
    return null;
  }

  return probe.stdout.trim();
}

function resolveTarget() {
  const key = `${process.platform}-${process.arch}`;
  const targets = {
    'darwin-arm64': {
      extension: '',
      packageSuffix: 'darwin-arm64',
      tauriTriple: 'aarch64-apple-darwin',
      vendorTriple: 'aarch64-apple-darwin',
    },
    'darwin-x64': {
      extension: '',
      packageSuffix: 'darwin-x64',
      tauriTriple: 'x86_64-apple-darwin',
      vendorTriple: 'x86_64-apple-darwin',
    },
    'linux-arm64': {
      extension: '',
      packageSuffix: 'linux-arm64',
      tauriTriple: 'aarch64-unknown-linux-gnu',
      vendorTriple: 'aarch64-unknown-linux-musl',
    },
    'linux-x64': {
      extension: '',
      packageSuffix: 'linux-x64',
      tauriTriple: 'x86_64-unknown-linux-gnu',
      vendorTriple: 'x86_64-unknown-linux-musl',
    },
    'win32-arm64': {
      extension: '.exe',
      packageSuffix: 'win32-arm64',
      tauriTriple: 'aarch64-pc-windows-msvc',
      vendorTriple: 'aarch64-pc-windows-msvc',
    },
    'win32-x64': {
      extension: '.exe',
      packageSuffix: 'win32-x64',
      tauriTriple: 'x86_64-pc-windows-msvc',
      vendorTriple: 'x86_64-pc-windows-msvc',
    },
  };
  const target = targets[key];

  if (!target) {
    throw new Error(`Unsupported Codex sidecar target: ${key}`);
  }

  return target;
}
