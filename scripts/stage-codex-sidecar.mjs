import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function codexPackageBin(target = resolveTarget()) {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('@openai/codex/package.json');
  const codexRequire = createRequire(packagePath);
  return dirname(
    codexRequire.resolve(
      `@openai/codex-${target.packageSuffix}/vendor/${target.vendorTriple}/bin/codex${target.extension}`,
    ),
  );
}

export async function stageCodexSidecars({
  target = resolveTarget(),
  sourceDir = codexPackageBin(target),
  destinationDir = fileURLToPath(
    new URL('../src-tauri/binaries', import.meta.url),
  ),
} = {}) {
  const manifest = JSON.parse(
    await readFile(
      new URL('../contracts/codex/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const names = ['codex', 'codex-code-mode-host'];
  // Verify the complete source pair before replacing either staged executable.
  // author: refinex
  for (const name of names)
    await stat(join(sourceDir, name + target.extension));
  if (
    probe(join(sourceDir, 'codex' + target.extension), '--version') !==
    `codex-cli ${manifest.version}`
  )
    throw new Error(
      'Bundled Codex version differs from the verified contract.',
    );
  if (
    !probe(
      join(sourceDir, 'codex-code-mode-host' + target.extension),
      '--help',
    )?.includes('codex-code-mode-host')
  )
    throw new Error('Bundled Codex code-mode host is not executable.');
  await mkdir(destinationDir, { recursive: true });
  const staged = [];
  for (const name of names) {
    const source = join(sourceDir, name + target.extension);
    const destination = join(
      destinationDir,
      `${name}-${target.tauriTriple}${target.extension}`,
    );
    const expected = await digest(source);
    let current = null;
    try {
      current = await digest(destination);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const copied = current !== expected;
    if (copied) {
      const temporary = destination + `.${process.pid}.tmp`;
      try {
        await copyFile(source, temporary);
        if (process.platform !== 'win32') await chmod(temporary, 0o755);
        if ((await digest(temporary)) !== expected)
          throw new Error(`Staged ${name} hash mismatch.`);
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    if (
      process.platform !== 'win32' &&
      ((await stat(destination)).mode & 0o111) !== 0o111
    ) await chmod(destination, 0o755);
    if (!probe(destination, name === 'codex' ? '--version' : '--help'))
      throw new Error(`Staged ${name} is not executable.`);
    staged.push({ name, destination, copied });
  }
  return staged;
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function probe(binary, argument) {
  const result = spawnSync(binary, [argument], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const item of await stageCodexSidecars())
    process.stdout.write(
      `${item.copied ? 'Staged' : 'Reused'} ${item.name} for ${resolveTarget().tauriTriple}\n`,
    );
}

export function resolveTarget() {
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
