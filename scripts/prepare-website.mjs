#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = (p) => resolve(new URL(`../${p}`, import.meta.url).pathname);

// 1. Obtener la versión objetivo (del argumento o de package.json)
let targetVersion = process.argv[2];
if (!targetVersion) {
  const pkg = JSON.parse(readFileSync(root("package.json"), "utf8"));
  targetVersion = pkg.version;
}
targetVersion = targetVersion.replace(/^v/, "");

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error("Versión inválida:", targetVersion);
  process.exit(1);
}

const tag = `v${targetVersion}`;
console.log(`Preparando recursos web para Adhan Companion ${tag}...`);

// 2. Generar datos del release
const baseUrl = `https://github.com/MarcosRehtanz/adhan-companion/releases/download/${tag}`;
const releaseData = {
  tag_name: tag,
  version: targetVersion,
  updated_at: new Date().toISOString(),
  assets: {
    deb: `${baseUrl}/Adhan.Companion_${targetVersion}_amd64.deb`,
    appimage: `${baseUrl}/Adhan.Companion_${targetVersion}_amd64.AppImage`,
    windows: `${baseUrl}/Adhan.Companion_${targetVersion}_x64-setup.exe`,
    android_arm64: `${baseUrl}/Adhan-Companion_${targetVersion}_android-arm64.apk`,
    android_armv7: `${baseUrl}/Adhan-Companion_${targetVersion}_android-armv7.apk`,
    sha256: `${baseUrl}/SHA256SUMS`
  }
};

// 3. Escribir website/latest-release.json
const releaseJsonPath = root("website/latest-release.json");
writeFileSync(releaseJsonPath, JSON.stringify(releaseData, null, 2) + "\n");
console.log(`✔ Generado ${releaseJsonPath}`);

// 4. Actualizar website/index.html estático para SEO y navegadores sin JS
const htmlPath = root("website/index.html");
if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, "utf8");

  // Reemplazar versiones hardcodeadas en enlaces y etiquetas
  html = html.replace(/v\d+\.\d+\.\d+/g, (match) => {
    return tag;
  });
  html = html.replace(/Adhan\.Companion_\d+\.\d+\.\d+_amd64\.deb/g, `Adhan.Companion_${targetVersion}_amd64.deb`);
  html = html.replace(/Adhan\.Companion_\d+\.\d+\.\d+_amd64\.AppImage/g, `Adhan.Companion_${targetVersion}_amd64.AppImage`);
  html = html.replace(/Adhan\.Companion_\d+\.\d+\.\d+_x64-setup\.exe/g, `Adhan.Companion_${targetVersion}_x64-setup.exe`);
  html = html.replace(/Adhan-Companion_\d+\.\d+\.\d+_android-arm64\.apk/g, `Adhan-Companion_${targetVersion}_android-arm64.apk`);
  html = html.replace(/Adhan-Companion_\d+\.\d+\.\d+_android-armv7\.apk/g, `Adhan-Companion_${targetVersion}_android-armv7.apk`);

  writeFileSync(htmlPath, html);
  console.log(`✔ Actualizado ${htmlPath} con estáticos de ${tag}`);
}

console.log("✔ Preparación web completada con éxito.");
