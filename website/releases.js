/**
 * Adhan Companion — Gestor de actualización dinámica de releases y UI interactiva.
 * Mantiene la web siempre actualizada con la última versión de GitHub sin intervención manual.
 */

(function () {
  'use strict';

  const CONFIG = {
    repo: 'MarcosRehtanz/adhan-companion',
    staticJsonUrl: 'latest-release.json',
    githubApiUrl: 'https://api.github.com/repos/MarcosRehtanz/adhan-companion/releases/latest',
    cacheKey: 'adhan_companion_latest_release_v2',
    cacheTtlMs: 15 * 60 * 1000 // 15 minutos de caché en navegador
  };

  /**
   * Intenta extraer la versión y enlaces de descarga de una respuesta de GitHub API o JSON local.
   */
  function parseReleaseData(raw) {
    if (!raw) return null;

    // Caso 1: JSON de GitHub Releases API
    if (raw.tag_name && Array.isArray(raw.assets)) {
      const tag = raw.tag_name;
      const version = tag.replace(/^v/, '');
      const assets = raw.assets;

      const findUrl = (predicate) => {
        const found = assets.find(predicate);
        return found ? found.browser_download_url : null;
      };

      return {
        tag: tag,
        version: version,
        publishedAt: raw.published_at || new Date().toISOString(),
        assets: {
          deb: findUrl(a => a.name.endsWith('.deb')),
          appimage: findUrl(a => a.name.endsWith('.AppImage')),
          windows: findUrl(a => a.name.endsWith('-setup.exe') || a.name.endsWith('.exe')),
          android_arm64: findUrl(a => a.name.includes('android-arm64') || a.name.includes('arm64.apk')),
          android_armv7: findUrl(a => a.name.includes('android-armv7') || a.name.includes('armv7.apk')),
          sha256: findUrl(a => a.name === 'SHA256SUMS')
        }
      };
    }

    // Caso 2: JSON estático pre-generado (latest-release.json)
    if (raw.tag_name && raw.assets && typeof raw.assets === 'object') {
      return {
        tag: raw.tag_name,
        version: raw.version || raw.tag_name.replace(/^v/, ''),
        publishedAt: raw.updated_at || new Date().toISOString(),
        assets: raw.assets
      };
    }

    return null;
  }

  /**
   * Aplica la información del release a los elementos del DOM.
   */
  function applyReleaseToDom(data) {
    if (!data || !data.version) return;

    const { tag, version, assets } = data;

    // 1. Badges y textos de versión
    document.querySelectorAll('[data-release-version]').forEach(el => {
      el.textContent = tag;
    });

    document.querySelectorAll('[data-release-pill]').forEach(el => {
      el.textContent = `Nueva versión ${tag} disponible`;
    });

    document.querySelectorAll('[data-release-tag]').forEach(el => {
      el.textContent = tag;
    });

    // 2. Enlaces de descarga específicos
    if (assets) {
      const mapping = {
        'deb': assets.deb,
        'appimage': assets.appimage,
        'windows': assets.windows,
        'android-arm64': assets.android_arm64,
        'android-armv7': assets.android_armv7,
        'sha256': assets.sha256
      };

      for (const [key, url] of Object.entries(mapping)) {
        if (!url) continue;
        document.querySelectorAll(`[data-release-link="${key}"]`).forEach(link => {
          link.href = url;
        });
      }
    }

    // 3. Comando de terminal para Linux
    document.querySelectorAll('[data-release-terminal="deb"]').forEach(cmd => {
      cmd.textContent = `sudo apt install "./Adhan.Companion_${version}_amd64.deb"`;
    });
  }

  /**
   * Carga la información desde caché o realiza fetch híbrido.
   */
  async function loadReleaseInfo() {
    // 1. Revisar caché local inmediata
    let cached = null;
    try {
      const stored = localStorage.getItem(CONFIG.cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < CONFIG.cacheTtlMs) {
          cached = parsed.data;
          applyReleaseToDom(cached);
        }
      }
    } catch (_) {
      // localStorage no disponible o bloqueado
    }

    // 2. Intentar primero con el archivo estático local (mismo origen, 0 rate limit)
    let freshData = null;
    try {
      const res = await fetch(CONFIG.staticJsonUrl, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        freshData = parseReleaseData(json);
      }
    } catch (_) {}

    // 3. Consultar la API de GitHub para verificar si hay una versión aún más nueva
    try {
      const apiRes = await fetch(CONFIG.githubApiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        const apiData = parseReleaseData(apiJson);
        if (apiData) {
          // Si la API tiene un tag más nuevo o válido, priorizarlo
          freshData = apiData;
        }
      }
    } catch (_) {}

    // 4. Si obtuvimos datos frescos, aplicarlos y actualizar la caché
    if (freshData) {
      applyReleaseToDom(freshData);
      try {
        localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: freshData
        }));
      } catch (_) {}
    }
  }

  function setButtonLabel(btn, text) {
    if (!btn) return;
    const span = btn.querySelector('span');
    if (span) {
      span.textContent = text;
    } else {
      btn.textContent = text;
    }
  }

  /**
   * Detección automática del sistema operativo del visitante
   * y adaptación del botón de llamada a la acción principal.
   */
  function setupOsDetection() {
    const ua = navigator.userAgent || '';
    let os = 'other';

    if (/android/i.test(ua)) {
      os = 'android';
    } else if (/windows|win32|win64/i.test(ua)) {
      os = 'windows';
    } else if (/linux|ubuntu|debian|fedora|arch/i.test(ua)) {
      os = 'linux';
    }

    const heroCta = document.getElementById('hero-download-btn');
    const heroCtaSub = document.getElementById('hero-download-sub');

    if (!heroCta) return;

    if (os === 'android') {
      setButtonLabel(heroCta, 'Descargar APK para Android');
      heroCta.setAttribute('data-release-link', 'android-arm64');
      if (heroCtaSub) heroCtaSub.textContent = 'Paquete APK oficial firmado • ARM64 y 32-bit';
      const card = document.getElementById('card-android');
      if (card) card.classList.add('is-recommended-os');
    } else if (os === 'windows') {
      setButtonLabel(heroCta, 'Descargar para Windows');
      heroCta.setAttribute('data-release-link', 'windows');
      if (heroCtaSub) heroCtaSub.textContent = 'Instalador NSIS para Windows 10 y 11 (64-bit)';
      const card = document.getElementById('card-windows');
      if (card) card.classList.add('is-recommended-os');
    } else if (os === 'linux') {
      setButtonLabel(heroCta, 'Descargar paquete .deb (Linux)');
      heroCta.setAttribute('data-release-link', 'deb');
      if (heroCtaSub) heroCtaSub.textContent = 'Para Ubuntu, Debian, Mint y derivados (64-bit)';
      const card = document.getElementById('card-linux');
      if (card) card.classList.add('is-recommended-os');
    }
  }

  /**
   * Pestañas interactivas del escaparate de producto (Showcase).
   */
  function setupShowcaseTabs() {
    const tabs = document.querySelectorAll('.showcase-tab');
    const panes = document.querySelectorAll('.showcase-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-target');

        tabs.forEach(t => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });

        panes.forEach(pane => {
          const isMatch = pane.id === targetId;
          pane.classList.toggle('active', isMatch);
          if (isMatch) {
            pane.removeAttribute('hidden');
          } else {
            pane.setAttribute('hidden', '');
          }
        });
      });
    });
  }

  /**
   * Copia rápida de comandos de terminal.
   */
  function setupCopyButtons() {
    document.querySelectorAll('[data-copy-target]').forEach(button => {
      button.addEventListener('click', async () => {
        const targetId = button.getAttribute('data-copy-target');
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        const textToCopy = targetEl.textContent.trim();
        try {
          await navigator.clipboard.writeText(textToCopy);
          const originalText = button.innerHTML;
          button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>¡Copiado!</span>
          `;
          button.classList.add('copied');
          setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('copied');
          }, 2000);
        } catch (_) {
          // Fallback silencioso
        }
      });
    });
  }

  // Inicialización cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    loadReleaseInfo();
    setupOsDetection();
    setupShowcaseTabs();
    setupCopyButtons();
  }
})();
