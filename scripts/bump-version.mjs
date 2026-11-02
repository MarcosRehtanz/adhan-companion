#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = (p) => resolve(new URL(`../${p}`, import.meta.url).pathname);
const target = process.argv[2];

if (!target || !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error("Uso: node scripts/bump-version.mjs <X.Y.Z>");
  process.exit(1);
}

const pkgPath = root("package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const oldVersion = pkg.version;

if (oldVersion === target) {
  console.log(`La versión ya es ${target}.`);
  process.exit(0);
}

console.log(`Actualizando de v${oldVersion} a v${target}...`);

// 1. package.json
pkg.version = target;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("✔ package.json actualizado");

// 2. src-tauri/tauri.conf.json
const tauriConfPath = root("src-tauri/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = target;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log("✔ src-tauri/tauri.conf.json actualizado");

// 3. src-tauri/Cargo.toml
const cargoTomlPath = root("src-tauri/Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf8");
cargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${target}"`);
writeFileSync(cargoTomlPath, cargoToml);
console.log("✔ src-tauri/Cargo.toml actualizado");

// 4. src-tauri/Cargo.lock
const cargoLockPath = root("src-tauri/Cargo.lock");
if (existsSync(cargoLockPath)) {
  let cargoLock = readFileSync(cargoLockPath, "utf8");
  cargoLock = cargoLock.replace(
    new RegExp(`(name = "adhan-companion"\\r?\\nversion = )"[^"]+"`),
    `$1"${target}"`
  );
  writeFileSync(cargoLockPath, cargoLock);
  console.log("✔ src-tauri/Cargo.lock actualizado");
}

// 5. README.md
const readmePath = root("README.md");
let readme = readFileSync(readmePath, "utf8");
readme = readme.replace(
  new RegExp(`✅ \\*\\*v${oldVersion.replace(/\./g, "\\.")} para Linux`),
  `✅ **v${target} para Linux`
);
readme = readme.replace(
  new RegExp(`Adhan\\.Companion_${oldVersion.replace(/\./g, "\\.")}_amd64\\.deb`, "g"),
  `Adhan.Companion_${target}_amd64.deb`
);
readme = readme.replace(
  new RegExp(`docs/releases/v${oldVersion.replace(/\./g, "\\.")}\\.md`),
  `docs/releases/v${target}.md`
);
writeFileSync(readmePath, readme);
console.log("✔ README.md actualizado");

// 6. AGENTS.md
const agentsPath = root("AGENTS.md");
let agents = readFileSync(agentsPath, "utf8");
agents = agents.replace(
  new RegExp(`el checkout está en \\*\\*v${oldVersion.replace(/\./g, "\\.")}\\*\\*`),
  `el checkout está en **v${target}**`
);
writeFileSync(agentsPath, agents);
console.log("✔ AGENTS.md actualizado");

// 7. Template de notas de release si no existe
const releaseNotesPath = root(`docs/releases/v${target}.md`);
if (!existsSync(releaseNotesPath)) {
  const template = `# Adhan Companion v${target}

Notas de la versión v${target}. Disponible para Linux x64 (.deb y AppImage), Windows x64 (instalador NSIS) y Android ARMv7/ARM64 (APK release firmados).

## Novedades

- 

## Actualizar

- **Android:** Configuración → Actualizaciones.
- **Linux .deb, AppImage y Windows:** desde la app, en Configuración → Actualizaciones → **Actualizar ahora**.

Los datos, el registro de rezos y las preferencias se conservan.
`;
  writeFileSync(releaseNotesPath, template);
  console.log(`✔ Plantilla creada en docs/releases/v${target}.md`);
}

// 8. Validación final
try {
  execSync("node scripts/check-release.mjs", { stdio: "inherit", cwd: root("") });
  console.log(`\n🎉 Sincronización completa a v${target}. No olvides completar docs/releases/v${target}.md.`);
} catch {
  console.error("\n❌ Advertencia: La validación final falló. Revisa los errores anteriores.");
  process.exit(1);
}
