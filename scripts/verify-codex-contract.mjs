import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(
  readFileSync(
    new URL('../contracts/codex/manifest.json', import.meta.url),
    'utf8',
  ),
);
const packagePath = require.resolve('@openai/codex/package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
if (pkg.version !== manifest.version)
  throw new Error('Codex package version differs from verified contract');
const codexRequire = createRequire(packagePath);
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const triple =
  process.platform === 'darwin'
    ? `${arch}-apple-darwin`
    : process.platform === 'win32'
      ? `${arch}-pc-windows-msvc`
      : `${arch}-unknown-linux-musl`;
const binary = codexRequire.resolve(
  `@openai/codex-${process.platform}-${process.arch}/vendor/${triple}/bin/codex${process.platform === 'win32' ? '.exe' : ''}`,
);
const probe = spawnSync(binary, ['--version'], {
  encoding: 'utf8',
  timeout: 5000,
  maxBuffer: 64 * 1024,
});
if (
  probe.status !== 0 ||
  probe.stdout.trim() !== `codex-cli ${manifest.version}`
)
  throw new Error('Codex binary version mismatch');
const output = mkdtempSync(join(tmpdir(), 'markune-schema-'));
try {
  const generate = spawnSync(
    binary,
    ['app-server', 'generate-json-schema', '--experimental', '--out', output],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  if (generate.status !== 0) throw new Error('Codex schema generation failed');
  for (const [file, expected] of Object.entries(manifest.schemaSha256)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(output, file)))
      .digest('hex');
    if (actual !== expected) throw new Error(`Codex schema drift: ${file}`);
  }
  process.stdout.write(
    JSON.stringify({
      version: manifest.version,
      schemas: Object.keys(manifest.schemaSha256).length,
      status: 'passed',
    }) + '\n',
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}
