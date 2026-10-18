import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

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
console.log(`Release v${version}: versiones y notas correctas.`);
