import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PANDOC_VERSION = '3.10.1';
const TYPST_VERSION = '0.15.1';
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(currentDir);
const destinationDir = join(projectRoot, 'src-tauri', 'binaries');
const licenseDir = join(
  projectRoot,
  'src-tauri',
  'resources',
  'document-export',
  'licenses',
);
const cacheDir = join(projectRoot, '.tauri-build', 'document-export-runtime');
const target = resolveTarget();
const licenseResources = [
  {
    fileName: 'Pandoc-COPYING.md',
    sha256: '3ebfbf9235b049d384cdba5a66a1a3434bb544391e720b76faa8e1b3ee61a4e5',
    url: `https://raw.githubusercontent.com/jgm/pandoc/${PANDOC_VERSION}/COPYING.md`,
  },
  {
    fileName: 'Pandoc-COPYRIGHT',
    sha256: '842e33ef01625e93f85bebb8bac83aa570186b7aa77a09971257cc29f8f60740',
    url: `https://raw.githubusercontent.com/jgm/pandoc/${PANDOC_VERSION}/COPYRIGHT`,
  },
  {
    fileName: 'Typst-LICENSE',
    sha256: '62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a',
    url: `https://raw.githubusercontent.com/typst/typst/v${TYPST_VERSION}/LICENSE`,
  },
  {
    fileName: 'Typst-NOTICE',
    sha256: '1778244777547c281b6f5fa9fc0c18ab21f8d4491c803f64e09046800f5fcb26',
    url: `https://raw.githubusercontent.com/typst/typst/v${TYPST_VERSION}/NOTICE`,
  },
];

await Promise.all([
  mkdir(destinationDir, { recursive: true }),
  mkdir(cacheDir, { recursive: true }),
  mkdir(licenseDir, { recursive: true }),
]);

for (const resource of licenseResources) {
  await stageVerifiedResource(licenseDir, resource);
}

for (const tool of target.tools) {
  await stageTool(tool);
}

async function stageTool(tool) {
  const destination = join(
    destinationDir,
    `${tool.name}-${target.tauriTriple}${target.extension}`,
  );
  const expectedVersion = `${tool.name} ${tool.version}`;

  if (probeVersion(destination)?.startsWith(expectedVersion)) {
    process.stdout.write(`Reused ${expectedVersion} for ${target.tauriTriple}\n`);
    return;
  }

  const override = process.env[tool.override];
  let source;
  let temporaryDirectory = null;

  if (override) {
    const probe = probeVersion(override);
    if (!probe?.startsWith(expectedVersion)) {
      throw new Error(
        `${tool.override} must point to ${expectedVersion}; received ${probe ?? 'an unusable binary'}.`,
      );
    }
    source = override;
  } else {
    const archive = await ensureArchive(tool);
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), `markune-${tool.name}-${tool.version}-`),
    );
    extractArchive(archive, temporaryDirectory);
    source = await findBinary(
      temporaryDirectory,
      `${tool.name}${target.extension}`,
    );
  }

  try {
    await copyFile(source, destination);
    if (process.platform !== 'win32') {
      await chmod(destination, 0o755);
    }

    const stagedProbe = probeVersion(destination);
    if (!stagedProbe?.startsWith(expectedVersion)) {
      throw new Error(`Staged ${tool.name} failed the version probe.`);
    }
    process.stdout.write(`Staged ${stagedProbe} for ${target.tauriTriple}\n`);
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

async function stageVerifiedResource(directory, resource) {
  const destination = join(directory, resource.fileName);

  try {
    if ((await sha256(destination)) === resource.sha256) {
      return;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const response = await fetch(resource.url, downloadRequestOptions());
  if (!response.ok) {
    throw new Error(
      `Unable to download ${resource.fileName}: HTTP ${response.status}.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== resource.sha256) {
    throw new Error(
      `${resource.fileName} checksum mismatch: expected ${resource.sha256}, received ${digest}.`,
    );
  }

  const temporaryPath = `${destination}.${process.pid}.download`;
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await rename(temporaryPath, destination);
}

async function ensureArchive(tool) {
  const archivePath = join(cacheDir, basename(tool.url));

  try {
    if ((await sha256(archivePath)) === tool.sha256) {
      return archivePath;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const response = await fetch(tool.url, downloadRequestOptions());
  if (!response.ok) {
    throw new Error(
      `Unable to download ${tool.name} ${tool.version}: HTTP ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== tool.sha256) {
    throw new Error(
      `${tool.name} ${tool.version} checksum mismatch: expected ${tool.sha256}, received ${digest}.`,
    );
  }

  const temporaryPath = `${archivePath}.${process.pid}.download`;
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await rename(temporaryPath, archivePath);
  return archivePath;
}

function extractArchive(archive, destination) {
  const isZip = archive.toLocaleLowerCase().endsWith('.zip');
  const command =
    isZip && process.platform !== 'win32' ? 'unzip' : 'tar';
  const args = isZip && process.platform !== 'win32'
    ? ['-q', archive, '-d', destination]
    : ['-xf', archive, '-C', destination];
  const result = spawnSync(command, args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(
      `Unable to extract ${basename(archive)}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
}

async function findBinary(directory, executableName) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isFile() && entry.name === executableName) {
      return path;
    }
    if (entry.isDirectory()) {
      const nested = await findBinary(path, executableName).catch(() => null);
      if (nested) {
        return nested;
      }
    }
  }

  throw new Error(`${executableName} was not found in the verified archive.`);
}

async function sha256(path) {
  const file = await readFile(path);
  return createHash('sha256').update(file).digest('hex');
}

function probeVersion(binaryPath) {
  try {
    if (!binaryPath) {
      return null;
    }
    const result = spawnSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim().split(/\r?\n/u)[0] : null;
  } catch {
    return null;
  }
}

function downloadRequestOptions() {
  return {
    headers: { 'User-Agent': 'Markune-build-runtime-stager' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  };
}

function resolveTarget() {
  const key = `${process.platform}-${process.arch}`;
  const manifests = {
    'darwin-arm64': {
      extension: '',
      tauriTriple: 'aarch64-apple-darwin',
      pandoc: {
        sha256: '8607160694a70ed9aa63776caa44acef3afb729c379c7c283724b7e27455bfda',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-arm64-macOS.zip`,
      },
      typst: {
        sha256: '48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-apple-darwin.tar.xz`,
      },
    },
    'darwin-x64': {
      extension: '',
      tauriTriple: 'x86_64-apple-darwin',
      pandoc: {
        sha256: '76430dd0ce5305fc4b91d8c0d5c22a00c8d2197ad3cef3937f65048f087164f7',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-x86_64-macOS.zip`,
      },
      typst: {
        sha256: '7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-apple-darwin.tar.xz`,
      },
    },
    'linux-arm64': {
      extension: '',
      tauriTriple: 'aarch64-unknown-linux-gnu',
      pandoc: {
        sha256: 'cd3963da375793a4804c65ae538b4f7b9c23f87cac7f6c74a1cf5e2fff7e8d59',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-arm64.tar.gz`,
      },
      typst: {
        sha256: '5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz`,
      },
    },
    'linux-x64': {
      extension: '',
      tauriTriple: 'x86_64-unknown-linux-gnu',
      pandoc: {
        sha256: '72948bf5784f560d5ad1876709daca27e0667f262da727bb33f77b58e52df2f5',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
      },
      typst: {
        sha256: 'a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz`,
      },
    },
    'win32-arm64': {
      extension: '.exe',
      tauriTriple: 'aarch64-pc-windows-msvc',
      pandoc: {
        sha256: '4725a1883e2171c2e181e6fd45003acb59ca4e9cbe031fdd3b79ef0d697d36aa',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
      },
      typst: {
        sha256: '4ab28e1b71ec3184d38d580ab797f499b6770d952b6b19167be5cea5c2662e14',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-pc-windows-msvc.zip`,
      },
    },
    'win32-x64': {
      extension: '.exe',
      tauriTriple: 'x86_64-pc-windows-msvc',
      pandoc: {
        sha256: '4725a1883e2171c2e181e6fd45003acb59ca4e9cbe031fdd3b79ef0d697d36aa',
        url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
      },
      typst: {
        sha256: '19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736',
        url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-pc-windows-msvc.zip`,
      },
    },
  };
  const manifest = manifests[key];

  if (!manifest) {
    throw new Error(`Unsupported document export runtime target: ${key}`);
  }

  return {
    extension: manifest.extension,
    tauriTriple: manifest.tauriTriple,
    tools: [
      {
        ...manifest.pandoc,
        name: 'pandoc',
        override: 'MARKUNE_PANDOC_BIN',
        version: PANDOC_VERSION,
      },
      {
        ...manifest.typst,
        name: 'typst',
        override: 'MARKUNE_TYPST_BIN',
        version: TYPST_VERSION,
      },
    ],
  };
}
