"""Preparar APK oficiales firmados e índices compatibles con la actualización instalada."""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

VERSION = json.loads(Path('package.json').read_text())['version']
PACKAGE = 'io.github.marcosrehtanz.adhancompanion.experimental'  # Identidad existente: conservar datos.


def version_code():
    major, minor, patch = map(int, VERSION.split('.'))
    if not (0 <= major < 1000 and 0 <= minor < 100 and 0 <= patch < 100):
        raise SystemExit('Versión fuera del esquema Android')
    return 1_000_000 + major * 1_000_000 + minor * 10_000 + patch * 100


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def prepare():
    arch, abi = os.environ['APK_ARCH'], os.environ['APK_ABI']
    assert (arch, abi) in [('arm64', 'arm64-v8a'), ('armv7', 'armeabi-v7a')]
    apks = list(Path('src-tauri/gen/android/app/build/outputs/apk').rglob('*.apk'))
    assert len(apks) == 1, f'Expected one release APK, found {apks}'
    original = apks[0]
    tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(original)], text=True)
    for field in (f"name='{PACKAGE}'", f"versionCode='{version_code()}'", f"versionName='{VERSION}'", "sdkVersion:'24'"):
        assert field in badging, f'APK metadata mismatch: {field}'
    assert 'application-debuggable' not in badging, 'Official APK must not be debuggable'
    with zipfile.ZipFile(original) as archive:
        native = {name.split('/')[1] for name in archive.namelist() if name.startswith('lib/') and name.endswith('.so')}
        assert native == {abi} and f'lib/{abi}/libadhan_companion_lib.so' in archive.namelist(), 'Incorrect ABI'
    for name in ('ANDROID_KEY_BASE64', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'):
        if not os.environ.get(name):
            raise SystemExit(f'Missing required secret: {name}')
    destination = Path('android-official')
    destination.mkdir(exist_ok=True)
    apk = destination / f'Adhan-Companion_{VERSION}_android-{arch}.apk'
    with tempfile.TemporaryDirectory(prefix='adhan-signing-', dir=os.environ['RUNNER_TEMP']) as directory:
        key = Path(directory) / 'android.p12'
        key.write_bytes(base64.b64decode(''.join(os.environ['ANDROID_KEY_BASE64'].split()), validate=True))
        key.chmod(0o600)
        subprocess.run([str(tools / 'apksigner'), 'sign', '--ks', str(key), '--ks-type', 'PKCS12',
                        '--ks-key-alias', os.environ['ANDROID_KEY_ALIAS'], '--ks-pass', 'env:ANDROID_KEY_PASSWORD',
                        '--key-pass', 'env:ANDROID_KEY_PASSWORD', '--out', str(apk), str(original)], check=True)
        certificate = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)], text=True)
        print(certificate)
    metadata = dict(schema=1, package_id=PACKAGE, tag=f'v{VERSION}', version_code=version_code(),
                    version_name=VERSION, min_sdk=24,
                    packages={abi: dict(name=apk.name, size=apk.stat().st_size, sha256=digest(apk))})
    (destination / f'android-update-{arch}.json').write_text(json.dumps(metadata, indent=2) + '\n')
    (destination / f'ANDROID-SIGNING-{arch}.txt').write_text(certificate)
    # apksigner genera un archivo auxiliar v4; la distribución APK usa la firma integrada.
    for idsig in destination.glob('*.idsig'):
        idsig.unlink()


def merge():
    root = Path('release-assets')
    indices = sorted(root.rglob('android-update-*.json'))
    assert len(indices) == 2, 'Expected two Android indices'
    merged = json.loads(indices[0].read_text())
    merged['packages'] = {}
    for path in indices:
        index = json.loads(path.read_text())
        for key in ('schema', 'package_id', 'tag', 'version_code', 'version_name', 'min_sdk'):
            assert index[key] == merged[key], f'Metadata differs: {key}'
        for abi, package in index['packages'].items():
            files = list(root.rglob(package['name']))
            assert len(files) == 1 and digest(files[0]) == package['sha256'] and files[0].stat().st_size == package['size']
            assert abi not in merged['packages'], 'Duplicate ABI'
            merged['packages'][abi] = package
        path.unlink()
    assert set(merged['packages']) == {'armeabi-v7a', 'arm64-v8a'}
    assert merged['tag'] == f'v{VERSION}' and merged['version_code'] == version_code()
    (root / 'android-update.json').write_text(json.dumps(merged, indent=2) + '\n')


def bridge():
    root = Path('release-assets')
    out = Path('android-bridge')
    out.mkdir(exist_ok=True)
    short = os.environ['GITHUB_SHA'][:7]
    index = json.loads((root / 'android-update.json').read_text())
    index['tag'] = f'android-experimental-{short}'
    for abi, package in index['packages'].items():
        arch = {'armeabi-v7a': 'armv7', 'arm64-v8a': 'arm64'}[abi]
        name = f'Adhan-Companion-android-experimental-{arch}-{short}.apk'
        source = next(root.rglob(package['name']))
        assert digest(source) == package['sha256']
        shutil.copyfile(source, out / name)
        package['name'] = name
    (out / 'android-update.json').write_text(json.dumps(index, indent=2) + '\n')
    (out / 'SHA256SUMS').write_text(''.join(f'{digest(p)}  {p.name}\n' for p in sorted(out.glob('*.apk'))))
    (out / 'notes.md').write_text(f'Puente de actualización a la versión oficial v{VERSION}.\n\n'
        f'Los APK son idénticos a los del [release oficial](https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v{VERSION}), '
        'con nombres compatibles con la compilación 10018. Conservan identidad y firma persistente. '
        'Actualizar sobre la app existente; no desinstalar ni borrar datos.\n')


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'version-code':
        print(version_code())
    elif action == 'prepare':
        prepare()
    elif action == 'merge':
        merge()
    elif action == 'bridge':
        bridge()
    else:
        raise SystemExit('Unknown action')
