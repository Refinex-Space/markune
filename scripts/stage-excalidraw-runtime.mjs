import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRuntimeDir = resolve(
  rootDir,
  'node_modules/@excalidraw/excalidraw/dist/prod',
);
const sourceDir = resolve(
  packageRuntimeDir,
  'fonts',
);
const runtimeDir = resolve(rootDir, 'public/excalidraw-runtime');
const targetDir = resolve(runtimeDir, 'fonts');

if (!existsSync(sourceDir)) {
  throw new Error(
    'Excalidraw fonts are missing. Run pnpm install before staging the runtime.',
  );
}

rmSync(runtimeDir, { force: true, recursive: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
copyFileSync(resolve(packageRuntimeDir, 'index.css'), resolve(runtimeDir, 'index.css'));
