// Tipos spec-tecs del contrato IPC en Tauri

export interface PrayerSlot {
  name: string;
  dec: number;
  hhmm: string;
  enabled: boolean;
}

export interface NextPrayer {
  name: string;
  date: string;
  hhmm: string;
  /** Instante del rezo en segundos Unix. */
  timestamp: number;
}

export interface Schedule {
  date: string;
  prayers: PrayerSlot[];
  next: NextPrayer | null;
  /** Incluye el próximo rezo aunque corresponda al día siguiente. */
  countdown_secs: number | null;
  /** rezos ya marcados como rezados hoy */
  marked: string[];
}

export interface MarkedDay {
  date: string;
  prayers: string[];
}

export interface Stats {
  /** días consecutivos completos hasta hoy (o ayer si hoy no cerró) */
  racha_actual: number;
  /** true si hoy ya completa los 5 */
  activa_hoy: boolean;
  mejor_racha: number;
  dias_completos: number;
  rezos_marcados: number;
}

export interface UpdateDisponible {
  version: string;
  url: string;
  appimage: string | null;
  windows_installer: string | null;
  notas: string;
}
