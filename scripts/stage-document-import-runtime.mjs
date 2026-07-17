import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = join(rootDir, 'public', 'import-runtime');

function packageDir(name, paths) {
  return dirname(require.resolve(`${name}/package.json`, paths ? { paths } : undefined));
}

const tesseractDir = packageDir('tesseract.js');
const tesseractCoreDir = packageDir('tesseract.js-core', [tesseractDir]);
const pdfjsDir = packageDir('pdfjs-dist');
const englishDataDir = packageDir('@tesseract.js-data/eng');
const chineseDataDir = packageDir('@tesseract.js-data/chi_sim');

rmSync(targetDir, { force: true, recursive: true });
mkdirSync(join(targetDir, 'lang'), { recursive: true });
mkdirSync(join(targetDir, 'tesseract-core'), { recursive: true });
cpSync(join(pdfjsDir, 'cmaps'), join(targetDir, 'cmaps'), { recursive: true });
cpSync(join(pdfjsDir, 'standard_fonts'), join(targetDir, 'standard_fonts'), {
  recursive: true,
});
cpSync(join(pdfjsDir, 'wasm'), join(targetDir, 'pdfjs-wasm'), { recursive: true });

const copies = [
  [join(pdfjsDir, 'build', 'pdf.worker.min.mjs'), join(targetDir, 'pdf.worker.min.mjs')],
  [join(tesseractDir, 'dist', 'worker.min.js'), join(targetDir, 'worker.min.js')],
  [
    join(englishDataDir, '4.0.0_best_int', 'eng.traineddata.gz'),
    join(targetDir, 'lang', 'eng.traineddata.gz'),
  ],
  [
    join(chineseDataDir, '4.0.0_best_int', 'chi_sim.traineddata.gz'),
    join(targetDir, 'lang', 'chi_sim.traineddata.gz'),
  ],
];

for (const stem of [
  'tesseract-core-lstm',
  'tesseract-core-simd-lstm',
  'tesseract-core-relaxedsimd-lstm',
]) {
  copies.push(
    [join(tesseractCoreDir, `${stem}.wasm.js`), join(targetDir, 'tesseract-core', `${stem}.wasm.js`)],
    [join(tesseractCoreDir, `${stem}.wasm`), join(targetDir, 'tesseract-core', `${stem}.wasm`)],
  );
}

for (const [source, target] of copies) {
  copyFileSync(source, target);
}

console.log(`Staged document import runtime at ${targetDir}`);
