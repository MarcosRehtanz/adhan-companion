// Respaldo y sincronización con Google Drive (escritorio).
// Renderiza los ESTADOS del sync definidos en sync_google.rs:
//   sin sesión → conectando → activa, más las consultas pendientes de elección
//   del usuario (conflicto local vs respaldo y oferta de restauración).
// Reglas de producto aplicadas acá:
//   - el estado se reconstruye del backend real al entrar (sync_estado);
//   - cada acción muestra su estado de operación y deshabilita las demás;
//   - un fallo se muestra con su mensaje y queda la app funcionando local;
//   - la restauración y el conflicto se deciden en pantalla, nunca solos.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CloudUpload, CloudDownload, RefreshCw, LogOut, Copy, CheckCircle2,
  AlertCircle, ArrowLeftRight, HardDrive,
} from "lucide-react";

interface InfoRespaldo {
  fecha: string;
  dispositivo: string;
  version_app: string;
  bytes: number;
  rezos: number;
}
interface ConflictoSync {
  fecha: string;
  dispositivo: string;
  config_difiere: boolean;
  lector_difiere: boolean;
  config_detalles: string[];
}
interface RestaurarInfo { fecha: string; dispositivo: string; rezos: number }
interface EstadoSync {
  sesion: "sin_sesion" | "conectando" | "activa";
  respaldo: InfoRespaldo | null;
  conflicto: ConflictoSync | null;
  restaurar: RestaurarInfo | null;
  url_autorizacion: string | null;
  ultimo_error: string | null;
  ultima_sync: string | null;
}

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "long", timeStyle: "short" });
const kb = (n: number) =>
  n < 10_000 ? `${n} B` : `${Math.round(n / 102.4) / 10} KB`;

export function GoogleSync({ recargado }: { recargado: () => void }) {
  const [estado, setEstado] = useState<EstadoSync | null>(null);
  // operación en curso: "login" | "sync" | "logout" | "resolver" | "restaurar"
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const traer = useCallback(async () => {
    try { setEstado(await invoke<EstadoSync>("sync_estado")); }
    catch { setEstado(null); }
  }, []);

  useEffect(() => { void traer(); }, [traer]);
  // mientras conecta, el backend va dejando la URL para copiar y luego la sesión
  useEffect(() => {
    if (estado?.sesion !== "conectando") return;
    const t = window.setInterval(() => { void traer(); }, 2000);
    return () => window.clearInterval(t);
  }, [estado?.sesion, traer]);

  const conInforme = async (clave: string, accion: (...a: unknown[]) => Promise<unknown>) => {
    if (enCurso) return;
    setEnCurso(clave);
    try { await accion(); } catch { /* el error queda visible en el estado del backend */ }
    await traer();
    setEnCurso(null);
    recargado(); // el registro/config pueden haber cambiado (stats, horarios)
  };

  if (!estado) return <p role="status">Consultando el estado del respaldo…</p>;

  const { sesion, respaldo, conflicto, restaurar, url_autorizacion, ultimo_error, ultima_sync } = estado;

  return <section className="panel setting-panel">
    <div className="panel-heading">
      <div><h2>Respaldo con Google Drive</h2><p>Tu cuenta, tu Drive privado. Local-first: la app funciona igual sin conexión.</p></div>
    </div>

    {ultimo_error && <p className="nota" role="alert" style={{ color: "var(--error, #b3552d)" }}>
      <AlertCircle size={14} className="icono-inline" /> {ultimo_error} — la app sigue funcionando normal; reintentá cuando quieras.
    </p>}

    {restaurar && <div>
      <p><HardDrive size={15} className="icono-inline" /> Hay un respaldo de <b>{fechaLarga(restaurar.fecha)}</b> hecho desde <b>{restaurar.dispositivo}</b>, con {restaurar.rezos} rezo(s) marcado(s).</p>
      <p className="nota">Elegir "Restaurar" trae la configuración, el registro y el punto de lectura guardados en tu cuenta. Los rezos marcados no se pierden y nada se aplica sin tu confirmación.</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("restaurar", () => invoke("sync_restaurar", { acepta: true }))}>
          <CloudDownload size={14} />{enCurso === "restaurar" ? "Restaurando…" : "Restaurar respaldo"}
        </button>
        <button className="secondary-button" disabled={!!enCurso} onClick={() => void conInforme("restaurar", () => invoke("sync_restaurar", { acepta: false }))}>
          Descartar
        </button>
      </div>
    </div>}

    {conflicto && <div>
      <p><ArrowLeftRight size={15} className="icono-inline" /> Difiere con el respaldo de Drive (de {fechaLarga(conflicto.fecha)}, equipo {conflicto.dispositivo}):</p>
      {conflicto.config_difiere && <ul style={{ margin: "6px 0 6px 20px" }}>
        {conflicto.config_detalles.map((d) => <li key={d}>{d}</li>)}
      </ul>}
      {conflicto.lector_difiere && <p className="nota">El estado del lector del Qur'an (última lectura y marcadores) también difiere.</p>}
      <p className="nota">Los rezos ya se unieron por diseño: no se pierde ninguna marca. Elegí qué versión queda para configuración y lectura.</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("resolver", () => invoke("sync_resolver", { eleccion: "local" }))}>
          <HardDrive size={14} />{enCurso === "resolver" ? "Aplicando…" : "Usar lo de esta computadora"}
        </button>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("resolver", () => invoke("sync_resolver", { eleccion: "remota" }))}>
          <CloudDownload size={14} />{enCurso === "resolver" ? "Aplicando…" : "Usar el respaldo de Drive"}
        </button>
      </div>
    </div>}

    {sesion === "sin_sesion" || sesion === "conectando" ? <>
      {sesion === "sin_sesion" ? <>
        <p>Respalda la configuración, el registro de rezos y el punto de lectura del Qur'an en tu cuenta de Google Drive: una computadora nueva se deja configurar al conectar. Los datos van solo al espacio privado de TU cuenta — no hay servidores de por medio.</p>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("login", () => invoke("sync_login"))}>
          <CloudUpload size={14} />{enCurso === "login" ? "Conectando…" : "Conectar con Google"}
        </button>
        <p className="nota">Se pide únicamente el permiso de datos privados de la app (drive.appdata); sin correo ni perfil.</p>
      </> : <>
        <p role="status" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RefreshCw size={15} className="icono-inline" /> Esperando la autorización en el navegador (máx. 5 min).
        </p>
        <p className="nota">Si cambiás de opinión, rechazá la autorización en la pantalla de Google; esta sección se actualiza al terminar.</p>
      </>}
      {url_autorizacion && <>
        <p className="nota" style={{ marginTop: 12 }}>¿No se abrió el navegador? Copiá y pegá esta dirección:</p>
        <p style={{ wordBreak: "break-all", margin: "6px 0", fontSize: 11.5 }}><code>{url_autorizacion}</code></p>
        <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(url_autorizacion).catch(() => {}); setCopiada(true); }}>
          <Copy size={14} />{copiada ? "Copiada" : "Copiar dirección"}
        </button>
      </>}
    </> : <>
      <div className="read-grid">
        <div><span>Cuenta de Google</span><b>conectada</b></div>
        <div><span>Última sincronización</span><b>{ultima_sync ? fechaLarga(ultima_sync) : "sin sincronizar aún"}</b></div>
        {respaldo && <>
          <div><span>Respaldo en Drive</span><b>{fechaLarga(respaldo.fecha)}</b></div>
          <div><span>Equipo del respaldo</span><b>{respaldo.dispositivo}</b></div>
          <div><span>Rezos en el respaldo</span><b>{respaldo.rezos}</b></div>
          <div><span>Tamaño</span><b>{kb(respaldo.bytes)}</b></div>
        </>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("sync", () => invoke("sync_ahora"))}>
          <RefreshCw size={14} />{enCurso === "sync" ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        <button className="secondary-button" disabled={!!enCurso} onClick={() => void conInforme("logout", () => invoke("sync_logout"))}>
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
      <p className="nota">Al arrancar (con sesión activa) se compara con el respaldo: los rezos se unen; configuración y lectura se consultan si difieren.</p>
      {!conflicto && !restaurar && !ultimo_error && !enCurso && (
        <p className="nota"><CheckCircle2 size={13} className="icono-inline" /> Sin consultas pendientes.</p>
      )}
    </>}
  </section>;
}
