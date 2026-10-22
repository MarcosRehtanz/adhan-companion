#!/usr/bin/env node
// Spike de sincronización con Google (ver docs/sincronizacion-google.md).
// Valida de punta a punta, SIN tocar el código de la app:
//   1) OAuth instalado (PKCE + loopback) → access + refresh token
//   2) Renovación con el refresh token (acceso offline)
//   3) Guardado del refresh token en GNOME Keyring (libsecret vía python3-gi)
//   4) Drive appDataFolder: subir, listar, descargar y verificar hash, sobrescribir y borrar
//
// Uso:  node spikes/gdrive-sync/spike.mjs [--keep] [--no-drive] [--resume] [--clear-keyring]
//   --keep            no borra el archivo de prueba en Drive
//   --no-drive        solo flujo OAuth + keyring
//   --resume          salta el navegador: toma el refresh token del keyring y sigue (ruta diaria real)
//   --clear-keyring   borra la entrada del keyring y sale
//
// Credenciales: .oauth.local en la raíz del repo (fuera de git por el patrón *.local).

import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';

const root = new URL('../../', import.meta.url);
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const NO_DRIVE = args.includes('--no-drive');
const RESUME = args.includes('--resume');

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const REMOTE_NAME = 'adhan-companion-backup.json';
const KEYRING_PY = `
import gi, sys
gi.require_version('Secret','1')
from gi.repository import Secret
attrs = {'service':'adhan-companion-google-refresh'}
schema = Secret.Schema.new('com.adhancompanion.oauth', Secret.SchemaFlags.NONE,
                           {'service': Secret.SchemaAttributeType.STRING})
if '--clear' in sys.argv:
    Secret.password_clear_sync(schema, attrs, None)
    print('clear-ok'); sys.exit(0)
if '--get' in sys.argv:
    v = Secret.password_lookup_sync(schema, attrs, None)
    sys.stdout.write(v or '')
    sys.exit(0)
token = sys.stdin.read()
Secret.password_store_sync(schema, attrs, Secret.COLLECTION_DEFAULT,
                           'Adhan Companion (spike) refresh token', token, None)
got = Secret.password_lookup_sync(schema, attrs, None)
print('ok' if got == token else 'no-coincide')
`;

// ---------- utilidades ----------
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

function paso(n, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!ok) {
    console.error('Spike detenido en este paso.');
    process.exit(1);
  }
}

async function api(url, opts = {}, token) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} en ${new URL(url).pathname}: ${body.slice(0, 400)}`);
  return body;
}
const apiJson = async (url, opts, token) => JSON.parse(await api(url, opts, token));

// ---------- credenciales ----------
const conf = {};
for (const linea of readFileSync(new URL('.oauth.local', root), 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m) conf[m[1]] = m[2].trim();
}
const clientId = conf.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = conf.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId) {
  console.error('Falta GOOGLE_OAUTH_CLIENT_ID en .oauth.local (el que termina en .apps.googleusercontent.com).');
  process.exit(1);
}
const form = (extra) => {
  const p = new URLSearchParams({ client_id: clientId, ...extra });
  if (clientSecret) p.set('client_secret', clientSecret);
  return p;
};

if (args.includes('--clear-keyring')) {
  const r = spawnSync('python3', ['-c', KEYRING_PY, '--clear'], { encoding: 'utf8' });
  console.log('entrada del keyring:', r.stdout.trim(), r.status === 0 ? '' : `(stderr: ${r.stderr.slice(0, 200)})`);
  process.exit(0);
}

// ---------- acceso: flujo completo con navegador, o reintentar desde el keyring ----------
let access;
if (RESUME) {
  console.log('Modo resume: tomo el refresh token del GNOME Keyring y renuevo sin navegador…');
  const r = spawnSync('python3', ['-c', KEYRING_PY, '--get'], { encoding: 'utf8' });
  const refreshToken = (r.stdout ?? '').trim();
  paso('R1) refresh token leído del keyring', refreshToken.length > 20, `${refreshToken.length} caracteres`);
  const fresh = await apiJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }).catch((e) => { paso('R2) renovación', false, e.message); throw e; });
  paso('R2) renovación con refresh token (offline access)', !!fresh.access_token, `nuevo access en ${fresh.expires_in}s`);
  access = fresh.access_token;
} else {
  // ---------- 1) OAuth: PKCE + loopback ----------
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const { code, redirect } = await new Promise((resolve, reject) => {
    let port = 0; // capturado al abrir el server: tras server.close(), address() devuelve null
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/') return;
      if (url.searchParams.get('state') !== state) {
        res.end('state no coincide');
        return reject(new Error('state no coincide (posible CSRF)'));
      }
      const err = url.searchParams.get('error');
      server.close();
      const cerrar = (msg) => { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(msg); };
      if (err) {
        cerrar('Autorización rechazada — puede cerrar la pestaña.');
        return reject(new Error(`Google devolvió: ${err}`));
      }
      cerrar('Autorización recibida ✔ — puede cerrar esta pestaña y volver a la terminal.');
      resolve({ code: url.searchParams.get('code'), redirect: `http://127.0.0.1:${port}` });
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [k, v] of Object.entries({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline', // pide refresh token
        prompt: 'consent', // fuerza la entrega del refresh en la primera autorización
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })) authUrl.searchParams.set(k, v);

      console.log('\nAbriendo el navegador para autorizar (acepte la pantalla de Google)…');
      const opened = spawnSync('xdg-open', [authUrl.toString()], { stdio: 'ignore' }).status === 0;
      if (!opened) console.log('No se pudo abrir el navegador; copie y pegue:\n' + authUrl.toString());
      const t = setTimeout(() => reject(new Error('timeout esperando el callback (5 min)')), 300_000);
      server.on('close', () => clearTimeout(t));
    });
  }).catch((e) => {
    console.error('❌ flujo OAuth:', e.message);
    process.exit(1);
  });
  paso('1) Callback OAuth recibido (PKCE + loopback)', !!code, code.slice(0, 8) + '…');

  // ---------- 2) canje de código + refresco ----------
  const tok = await apiJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  if (!tok.refresh_token) paso('2) canje de código', false, 'Google devolvió access token pero NO refresh token (¿prompt=consent?); el spike continúa igual');
  else paso('2a) canje de código', true, `scope concedido: ${tok.scope}`);

  const fresh = await apiJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' }),
  });
  paso('2b) renovación con refresh token (offline access)', !!fresh.access_token, `nuevo access en ${fresh.expires_in}s`);
  access = fresh.access_token;

  // ---------- 3) GNOME Keyring ----------
  const kr = spawnSync('python3', ['-c', KEYRING_PY], { input: tok.refresh_token ?? '', encoding: 'utf8' });
  paso('3) refresh token guardado en GNOME Keyring (round-trip verificado)',
    kr.status === 0 && kr.stdout.trim() === 'ok',
    kr.status !== 0 ? `python: ${kr.stderr.slice(0, 200)}` : `resultado: ${kr.stdout.trim()}`);
}

// ---------- 4) Drive appDataFolder ----------
if (!NO_DRIVE) {
  const payload = (v) => JSON.stringify({
    schema: 1,
    actualizado: new Date().toISOString(),
    dispositivo: 'spike-linux',
    version_app: '0.1.14-spike',
    datos: {
      config: { ubicacion: { lat: -38.7, lng: -62.2 }, metodo: 'MuslimWorldLeague' },
      registro: [{ dia: '2026-10-22', rezo: 'Fajr', marcado: true }],
      v,
    },
  });

  const multipart = (metadata, contents, contentType = 'application/json') => {
    const b = `spike-boundary-${Date.now()}`;
    const body = Buffer.from(
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${b}\r\nContent-Type: ${contentType}\r\n\r\n${contents}\r\n--${b}--\r\n`
    );
    return { headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body };
  };

  // limpieza de restos de corridas anteriores
  const pre = await apiJson(`${DRIVE_FILES}?spaces=appDataFolder&fields=files(id,name)`, {}, access);
  for (const f of pre.files.filter((f) => f.name === REMOTE_NAME)) {
    await api(`${DRIVE_FILES}/${f.id}`, { method: 'DELETE' }, access);
    console.log(`ℹ️  eliminado resto anterior ${f.id.slice(0, 12)}…`);
  }

  const file1 = await apiJson(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,size`,
    { ...multipart({ name: REMOTE_NAME, parents: ['appDataFolder'] }, payload(1)), method: 'POST' }, access);
  paso('4a) subida a appDataFolder', file1.name === REMOTE_NAME, `id ${file1.id?.slice(0, 12)}…, ${file1.size} bytes`);

  const listing = await apiJson(`${DRIVE_FILES}?spaces=appDataFolder&fields=files(id,name,size,modifiedTime)`, {}, access);
  paso('4b) listado del espacio appData', listing.files.some((f) => f.id === file1.id), `${listing.files.length} archivo(s)`);

  const down = await api(`${DRIVE_FILES}/${file1.id}?alt=media`, {}, access);
  paso('4c) descarga verificada', down.includes('"v":1'), `${down.length} bytes, sha256 ${sha256hex(down).slice(0, 12)}…`);

  // la actualización de un archivo existente es PATCH al endpoint /upload (POST sólo sirve para crear)
  const file2 = await apiJson(`${DRIVE_UPLOAD}/${file1.id}?uploadType=multipart&fields=id,size`,
    { ...multipart({}, payload(2)), method: 'PATCH' }, access);
  const down2 = await api(`${DRIVE_FILES}/${file1.id}?alt=media`, {}, access);
  paso('4d) sobrescritura del mismo archivo (sync de actualización)', down2.includes('"v":2'), `${file2.size} bytes`);

  if (KEEP) console.log(`ℹ️  archivo de prueba conservado en Drive (id ${file1.id})`);
  else {
    await api(`${DRIVE_FILES}/${file1.id}`, { method: 'DELETE' }, access);
    const after = await apiJson(`${DRIVE_FILES}?spaces=appDataFolder&fields=files(id)`, {}, access);
    paso('4e) borrado (limpieza)', !after.files.some((f) => f.id === file1.id));
  }
}

console.log('\nRevocación opcional: https://myaccount.google.com/permissions (quitar Adhan Companion del spike)');
console.log('Limpieza del keyring: node spikes/gdrive-sync/spike.mjs --clear-keyring');
console.log('\nSpike completo ✔ — el diseño de docs/sincronizacion-google.md funciona sobre la cuenta real.');
