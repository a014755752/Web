import { copyFile, mkdir, writeFile } from "node:fs/promises";

const modules = new URL("../node_modules/", import.meta.url);
const destination = new URL("../public/ocr/", import.meta.url);
const assets = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js/dist/worker.min.js.LICENSE.txt", "worker.min.js.LICENSE.txt"],
  ["tesseract.js/LICENSE.md", "tesseract-LICENSE.md"],
  ["tesseract.js-core/LICENSE", "core-LICENSE.txt"],
  ["@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz", "chi_sim.traineddata.gz"],
];

for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  const file = `tesseract-core-${variant}.wasm.js`;
  assets.push([`tesseract.js-core/${file}`, file]);
}

await mkdir(destination, { recursive: true });
await Promise.all(assets.map(([source, target]) => copyFile(new URL(source, modules), new URL(target, destination))));

// Tesseract prints resolution estimates and legacy training parameters to stderr.
const workerEntry = [
  "const reportError = console.error.bind(console);",
  "console.error = (message, ...details) => {",
  "  const diagnostic = typeof message === 'string' && (",
  "    message.startsWith('Warning: Parameter not found:') || message.startsWith('Estimating resolution as ')",
  "  );",
  "  if (diagnostic) console.debug(message, ...details);",
  "  else reportError(message, ...details);",
  "};",
  "importScripts('./worker.min.js');",
].join("\n");
await writeFile(new URL("worker.js", destination), workerEntry);
