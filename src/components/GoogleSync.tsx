// Respaldo y sincronización con Google Drive (escritorio).
// Renderiza los ESTADOS del sync definidos en sync_google.rs:
//   sin sesión → conectando (cancelable) → activa, más las consultas pendientes
//   de elección del usuario (conflicto y oferta de restauración).
// Reglas de producto aplicadas acá:
//   - el estado se reconstruye del backend real al entrar (sync_estado);
//   - cada acción muestra su estado de operación y deshabilita las demás;
//   - un fallo se muestra con su mensaje y la app sigue funcionando local;
//   - la restauración y el conflicto se deciden en pantalla, nunca solos.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CloudUpload, CloudDownload, RefreshCw, LogOut, Copy, CheckCircle2, AlertCircle, ArrowLeftRight, HardDrive, X } from "lucide-react";

interface InfoRespaldo { fecha: string; dispositivo: string; version_app: string; bytes: number; rezos: number }
interface ConflictoSync {
  fecha: string;
  dispositivo: string;
  config_difiere: boolean;
  lector_difiere: boolean;
  config_detalles: string[];
  lector_detalles: string[];
}
interface RestaurarInfo { fecha: string; dispositivo: string; rezos: number }
interface EstadoSync {
  sesion: "sin_sesion" | "conectando" | "activa";
  respaldo: InfoRespaldo | null;
  conflicto: ConflictoSync | null;
  restaurar: RestaurarInfo | null;
  url_autorizacion: string | null;
  ultimo_error: string | null;
  aviso: string | null;
  ultima_sync: string | null;
}

const fechaLarga = (iso: string) => new Date(iso).toLocaleString("es", { dateStyle: "long", timeStyle: "short" });
const kb = (n: number) => n < 10_000 ? `${n} B` : `${Math.round(n / 102.4) / 10} KB`;

export function GoogleSync({ recargado }: { recargado: () => void }) {
  const [estado, setEstado] = useState<EstadoSync | null>(null);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  // operación en curso: "login" | "cancelar" | "sync" | "logout" | "resolver" | "restaurar"
  const [enCurso, setEnCurso] = useState<string | null>(null);
  // error de una acción que el backend no llegó a registrar (por ejemplo, el IPC)
  const [fallo, setFallo] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const traer = useCallback(async () => {
    try {
      setEstado(await invoke<EstadoSync>("sync_estado"));
      setErrorEstado(null);
    } catch (e) {
      setEstado(null);
      setErrorEstado(String(e));
    }
  }, []);

  useEffect(() => { void traer(); }, [traer]);
  // mientras conecta, el backend va dejando la URL para copiar y luego la sesión
  useEffect(() => {
    if (estado?.sesion !== "conectando") return;
    const t = window.setInterval(() => { void traer(); }, 2000);
    return () => window.clearInterval(t);
  }, [estado?.sesion, traer]);

  const conInforme = async (clave: string, accion: () => Promise<unknown>) => {
    if (enCurso) return;
    setEnCurso(clave); setFallo(null);
    try { await accion(); } catch (e) { setFallo(String(e)); }
    await traer();
    setEnCurso(null);
    recargado(); // el registro o el config pueden haber cambiado (estadísticas, horarios)
  };
  // El login espera la autorización (hasta 5 min): el panel se refresca enseguida
  // para mostrar «Esperando…», la dirección para copiar y Cancelar.
  const conectar = async () => {
    if (enCurso) return;
    setEnCurso("login"); setFallo(null);
    const espera = invoke("sync_login").catch(e => setFallo(String(e)));
    window.setTimeout(() => { void traer(); }, 300);
    await espera;
    await traer();
    setEnCurso(null);
  };
  // «Cancelar» no espera a que termine la conexión en curso: la corta.
  const cancelar = async () => {
    try { await invoke("sync_cancelar"); } catch (e) { setFallo(String(e)); }
    await traer();
  };

  if (!estado) return <section className="panel setting-panel">
    {errorEstado
      ? <div role="alert"><p>No se pudo leer el estado del respaldo: {errorEstado}</p></div>
      : <p role="status">Consultando el estado del respaldo…</p>}
    <div className="editor-actions"><button className="secondary-button" onClick={() => void traer()}><RefreshCw size={14} />Reintentar</button></div>
  </section>;

  const { sesion, respaldo, conflicto, restaurar, url_autorizacion, ultimo_error, aviso, ultima_sync } = estado;
  const error = ultimo_error ?? fallo;

  return <section className="panel setting-panel">
    <div className="panel-heading">
      <div><h2>Respaldo con Google Drive</h2><p>En el espacio privado de tu cuenta. La app funciona igual sin conexión.</p></div>
    </div>

    {error && <div role="alert"><p><AlertCircle size={14} className="icono-inline" />{error}</p><p className="nota">La app sigue funcionando normal. Podés reintentar cuando quieras.</p></div>}
    {aviso && !error && <p className="nota" role="status"><CheckCircle2 size={13} className="icono-inline" />{aviso}</p>}

    {restaurar && <div>
      <p><HardDrive size={15} className="icono-inline" />Hay un respaldo del <b>{fechaLarga(restaurar.fecha)}</b> hecho desde <b>{restaurar.dispositivo}</b>, con {restaurar.rezos} rezo(s) marcado(s).</p>
      <p className="nota">«Restaurar respaldo» trae la configuración, el registro y el punto de lectura guardados en tu cuenta. Nada se aplica sin tu confirmación.</p>
      <div className="editor-actions">
        <button className="secondary-button" disabled={!!enCurso} onClick={() => void conInforme("restaurar", () => invoke("sync_restaurar", { acepta: false }))}>Descartar</button>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("restaurar", () => invoke("sync_restaurar", { acepta: true }))}>
          <CloudDownload size={14} />{enCurso === "restaurar" ? "Restaurando…" : "Restaurar respaldo"}
        </button>
      </div>
    </div>}

    {conflicto && <div>
      <p><ArrowLeftRight size={15} className="icono-inline" />Esto cambió acá y también en <b>{conflicto.dispositivo}</b> (respaldo del {fechaLarga(conflicto.fecha)}):</p>
      <ul className="lista-conflicto">
        {[...conflicto.config_detalles, ...conflicto.lector_detalles].map(d => <li key={d}>{d}</li>)}
      </ul>
      <p className="nota">Lo que cambió en una sola computadora ya se mezcló, y los rezos ya se unieron. Elegí con qué versión quedarte en esto.</p>
      <div className="editor-actions">
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("resolver", () => invoke("sync_resolver", { eleccion: "local" }))}>
          <HardDrive size={14} />{enCurso === "resolver" ? "Aplicando…" : "Usar lo de esta computadora"}
        </button>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("resolver", () => invoke("sync_resolver", { eleccion: "remota" }))}>
          <CloudDownload size={14} />{enCurso === "resolver" ? "Aplicando…" : "Usar el respaldo de Drive"}
        </button>
      </div>
    </div>}

    {sesion === "sin_sesion" && <>
      <p>Respaldá la configuración, el registro de rezos y el punto de lectura del Qur’an en tu cuenta de Google. Una computadora nueva queda configurada al conectarla. Los datos van solo al espacio privado de tu cuenta, sin servidores de por medio.</p>
      <div className="editor-actions">
        <button className="test" disabled={!!enCurso} onClick={() => void conectar()}>
          <CloudUpload size={14} />{enCurso === "login" ? "Conectando…" : "Conectar con Google"}
        </button>
      </div>
      <p className="nota">Solo se pide el permiso para los datos privados de la app (drive.appdata), sin correo ni perfil.</p>
    </>}

    {sesion === "conectando" && <>
      <p role="status"><RefreshCw size={15} className="icono-inline" />Esperando la autorización en el navegador (hasta 5 minutos).</p>
      <div className="editor-actions">
        <button className="secondary-button" onClick={() => void cancelar()}><X size={14} />Cancelar</button>
      </div>
      {url_autorizacion && <>
        <p className="nota">¿No se abrió el navegador? Copiá esta dirección y pegala en el navegador:</p>
        <p className="url-autorizacion"><code>{url_autorizacion}</code></p>
        <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(url_autorizacion).catch(() => {}); setCopiada(true); }}>
          <Copy size={14} />{copiada ? "Copiada" : "Copiar dirección"}
        </button>
      </>}
    </>}

    {sesion === "activa" && <>
      <div className="read-grid">
        <div><span>Cuenta de Google</span><b>Conectada</b></div>
        <div><span>Última sincronización</span><b>{ultima_sync ? fechaLarga(ultima_sync) : "Todavía no en esta sesión"}</b></div>
        {respaldo && <>
          <div><span>Respaldo en Drive</span><b>{fechaLarga(respaldo.fecha)}</b></div>
          <div><span>Equipo del respaldo</span><b>{respaldo.dispositivo}</b></div>
          <div><span>Rezos en el respaldo</span><b>{respaldo.rezos}</b></div>
          <div><span>Tamaño</span><b>{kb(respaldo.bytes)}</b></div>
        </>}
      </div>
      <div className="editor-actions">
        <button className="secondary-button" disabled={!!enCurso} onClick={() => void conInforme("logout", () => invoke("sync_logout"))}>
          <LogOut size={14} />Cerrar sesión
        </button>
        <button className="test" disabled={!!enCurso} onClick={() => void conInforme("sync", () => invoke("sync_ahora"))}>
          <RefreshCw size={14} />{enCurso === "sync" ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>
      <p className="nota">Al abrir la app se compara con el respaldo: los rezos se unen y lo que cambió en una sola computadora se toma solo. Solo se consulta si algo cambió en las dos.</p>
    </>}
  </section>;
}
