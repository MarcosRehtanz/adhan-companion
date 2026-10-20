/** Las acciones de descarga se derivan de los archivos actuales y de la operación activa. */
export interface AudioState {
  phase: string; position: { sura: number; aya: number } | null;
  last: { sura: number; aya: number } | null; volume: number; error: string; interrupted: boolean; storage_error: string;
  offline: { sura: number; completed: number; total: number; bytes: number };
  download: { sura: number | null; phase: string; completed: number; total: number; bytes: number; error: string };
}
export interface PendingAudioAction { action: string; sura: number }
export type DownloadKind = "loading" | "unavailable" | "missing" | "partial" | "downloading" | "cancelling" | "cancelled" | "error" | "damaged" | "complete" | "deleting";
export interface DownloadView {
  kind: DownloadKind;
  label: string;
  primary: string | null;
  removable: boolean;
  blockedByOther: boolean;
}
export function downloadView(state: AudioState | null, sura: number, pending: PendingAudioAction | null, statusError: string): DownloadView {
  const view = (kind: DownloadKind, label: string, primary: string | null = null, removable = false, blockedByOther = false): DownloadView => ({ kind, label, primary, removable, blockedByOther });
  if (statusError) return view("unavailable", "No se pudo consultar la descarga");
  if (!state || state.offline.sura !== sura) return view("loading", "Consultando archivos…");
  const { offline, download } = state;
  const other = download.phase === "downloading" && download.sura !== sura;
  if (pending?.action === "delete" && pending.sura === sura) return view("deleting", "Eliminando audio…");
  if (download.phase === "downloading" && download.sura === sura) {
    return pending?.action === "cancel" ? view("cancelling", "Cancelando descarga…") : view("downloading", "Descargando…");
  }
  // Los archivos actuales prevalecen sobre un resultado histórico de descarga.
  if (state.storage_error) return view("damaged", "Audio dañado o incompleto", null, !other, other);
  if (offline.total > 0 && offline.completed === offline.total) return view("complete", "Disponible sin conexión", null, !other, other);
  if (pending?.action === "download" && pending.sura === sura) return view("downloading", "Iniciando descarga…");
  if (download.sura === sura && download.phase === "error") return view("error", "La descarga no se completó", other ? null : "Reintentar descarga", offline.completed > 0 && !other, other);
  if (download.sura === sura && download.phase === "cancelled") return view("cancelled", "Descarga cancelada", other ? null : offline.completed > 0 ? "Completar descarga" : "Descargar sura", offline.completed > 0 && !other, other);
  if (offline.completed > 0) return view("partial", "Descarga incompleta", other ? null : "Completar descarga", !other, other);
  return view("missing", "Sin descargar", other ? null : "Descargar sura", false, other);
}
