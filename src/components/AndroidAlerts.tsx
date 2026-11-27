import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = {
  enabled: boolean;
  exact: boolean;
  notifications: boolean;
  battery: boolean;
  next: number;
  next_pre: number;
  next_reminder?: number;
  error: string;
  playing?: boolean;
};

export function AndroidAlerts() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const mounted = useRef(false);

  async function action(act = "status") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    if (act === "test") {
      setFeedback("Iniciando prueba: el teléfono debe sonar, vibrar y notificar…");
    }
    try {
      const value = await invoke<Status>("android_alert_status", { action: act });
      if (mounted.current) {
        setStatus(value);
        setError("");
        if (act === "test") {
          setFeedback("Prueba emitida. Comprobá el sonido y que la notificación quede fija en tu barra.");
          setTimeout(() => { if (mounted.current) setFeedback(""); }, 8000);
        }
      }
    } catch (e) {
      if (mounted.current) {
        setError(String(e));
        if (act === "test") setFeedback("");
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (!document.hidden) void action(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const known = !!status && !error;
  const permissions = !!status?.exact && !!status?.notifications;

  return (
    <section className="panel setting-panel">
      <div className="panel-heading">
        <div>
          <h2>Avisos en este teléfono</h2>
          <p>Verificá los permisos del sistema para que las alarmas suenen con la pantalla bloqueada.</p>
        </div>
      </div>

      {!status && !error && <p role="status">Consultando permisos y programación…</p>}

      {known && status && (
        <div className="android-alerts-box">
          {/* Lista de verificación de permisos */}
          <div className="android-check-list">
            <div className="android-check-item">
              <div className="android-check-info">
                <span className={`android-check-icon ${status.notifications ? "ok" : "err"}`}>
                  {status.notifications ? "✓" : "✕"}
                </span>
                <span>Notificaciones del sistema</span>
              </div>
              {status.notifications ? (
                <span className="android-badge ok">Permitido</span>
              ) : (
                <button className="secondary-button" disabled={busy} onClick={() => void action("notifications")}>
                  Permitir
                </button>
              )}
            </div>

            <div className="android-check-item">
              <div className="android-check-info">
                <span className={`android-check-icon ${status.exact ? "ok" : "warn"}`}>
                  {status.exact ? "✓" : "!"}
                </span>
                <span>Alarmas exactas (Android)</span>
              </div>
              {status.exact ? (
                <span className="android-badge ok">Permitido</span>
              ) : (
                <button className="secondary-button" disabled={busy} onClick={() => void action("exact")}>
                  Permitir
                </button>
              )}
            </div>

            <div className="android-check-item">
              <div className="android-check-info">
                <span className={`android-check-icon ${status.battery ? "ok" : "warn"}`}>
                  {status.battery ? "✓" : "⚙"}
                </span>
                <span>Ahorro de batería (Xiaomi / Samsung)</span>
              </div>
              {status.battery ? (
                <span className="android-badge ok">Sin optimización</span>
              ) : (
                <button className="secondary-button" disabled={busy} onClick={() => void action("battery")}>
                  Ajustes
                </button>
              )}
            </div>
          </div>

          {/* Banner de estado */}
          {status.error ? (
            <div className="android-banner-status warn" role="alert">
              <div className="android-banner-tit">⚠️ Requiere atención</div>
              <div className="android-banner-sub">Último inconveniente: {status.error}</div>
            </div>
          ) : !permissions ? (
            <div className="android-banner-status warn" role="alert">
              <div className="android-banner-tit">⚠️ Faltan permisos del sistema</div>
              <div className="android-banner-sub">
                Concedé las notificaciones y alarmas exactas para que el teléfono despierte y suene al momento del rezo.
              </div>
            </div>
          ) : !status.enabled ? (
            <div className="android-banner-status warn" role="status">
              <div className="android-banner-tit">○ Avisos desactivados</div>
              <div className="android-banner-sub">
                Los permisos están listos. Tocá «Activar avisos» para programar las alarmas en este teléfono.
              </div>
            </div>
          ) : (
            <div className="android-banner-status ok" role="status">
              <div className="android-banner-tit">
                <span style={{ color: "var(--acento)" }}>●</span> Avisos activos y programados
              </div>
              <div className="android-banner-sub">
                Próximo aviso: <b>{status.next ? new Date(status.next).toLocaleString() : "Calculando próximo horario…"}</b>
              </div>
            </div>
          )}

          {/* Botón de prueba instantánea */}
          <button
            className="android-btn-test"
            disabled={busy || !status.notifications}
            onClick={() => void action("test")}
          >
            🔔 {busy ? "Enviando…" : "Probar aviso y sonido ahora"}
          </button>
          {feedback && <p role="status" className="nota" style={{ fontWeight: 600, color: "var(--acento)" }}>{feedback}</p>}
          <p className="nota">
            Prueba de 5 segundos con sonido, vibración y notificación persistente en la barra. Verificala con el volumen de alarmas de tu teléfono.
          </p>

          {/* Acciones principales */}
          <div className="editor-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            {!status.enabled && (
              <button className="guardar" disabled={busy} onClick={() => void action("enable")}>
                {busy ? "Aplicando…" : "Activar avisos"}
              </button>
            )}
            {status.enabled && (
              <button className="secondary-button" disabled={busy} onClick={() => void action("disable")}>
                {busy ? "Aplicando…" : "Desactivar avisos"}
              </button>
            )}
            {status.enabled && permissions && (!status.next || !!status.error) && (
              <button className="secondary-button" disabled={busy} onClick={() => void action("reschedule")}>
                Reintentar programación
              </button>
            )}
            <button className="secondary-button" disabled={busy} onClick={() => void action("status")}>
              Actualizar estado
            </button>
          </div>

          {!status.battery && (
            <p className="nota">
              <b>En Xiaomi / Redmi / POCO y Samsung:</b> entrá a «Ajustes» de la app y activá <b>«Inicio automático»</b> y <b>«Sin restricciones de batería»</b> para evitar que el sistema silencie los avisos con la pantalla apagada.
            </p>
          )}
          <p className="nota">
            <b>Notificación permanente:</b> al terminar de sonar, la notificación no se borra. Permanece en tu bandeja hasta que la toques o descartes, para que nunca te pierdas un rezo si no escuchaste el tono.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginTop: 12 }}>
          <p>No se pudo confirmar el estado de los avisos: {error}</p>
          <button className="secondary-button" disabled={busy} onClick={() => void action("status")}>
            Reintentar consulta
          </button>
        </div>
      )}
    </section>
  );
}
