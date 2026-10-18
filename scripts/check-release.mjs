import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { version } = JSON.parse(read("package.json"));
assert.match(version, /^\d+\.\d+\.\d+$/, "La release requiere una versión estable X.Y.Z");
assert.equal(JSON.parse(read("src-tauri/tauri.conf.json")).version, version, "Versión de Tauri desincronizada");
assert.equal(read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1], version, "Versión de Cargo desincronizada");
assert.equal(read("src-tauri/Cargo.lock").match(/name = "adhan-companion"\r?\nversion = "([^"]+)"/)?.[1], version, "Versión de Cargo.lock desincronizada");
if (process.env.RELEASE_TAG) {
  assert.equal(process.env.RELEASE_TAG, `v${version}`, "El tag no coincide con la versión del proyecto");
}
assert.ok(existsSync(new URL(`../docs/releases/v${version}.md`, import.meta.url)), "Faltan las notas de la release");
const corpus = JSON.parse(read("public/quran/manifest.json"));
for (const file of corpus.files) {
  assert.ok(!file.path.includes("..") && !file.path.startsWith("/"), "Ruta inválida en el manifiesto del Qur’an");
  const bytes = readFileSync(new URL(`../public/quran/${file.path}`, import.meta.url));
  assert.equal(bytes.length, file.bytes, `Tamaño del recurso modificado: ${file.path}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `Hash del recurso modificado: ${file.path}`);
}
assert.equal(read("src/data/quran-suras.json"), read("public/quran/suras.json"), "Metadatos del lector desincronizados");
const { suras } = JSON.parse(read("public/quran/suras.json"));
assert.equal(suras.length, 114, "Faltan suras del Qur’an");
assert.equal(suras.reduce((n, s) => n + s.count, 0), 6236, "Recuento de aleyas inesperado");
for (const notice of ["ARABIC-LICENSE.txt", "TRANSLATION-TERMS.txt", "fonts/OFL.txt"]) {
  assert.ok(corpus.files.some((file) => file.path === notice), `Falta el aviso ${notice}`);
}
console.log(`Release v${version}: versiones, notas y recursos del Qur’an correctos.`);
