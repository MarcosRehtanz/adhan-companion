// Tipos spec-tecs del contrato IPC en Tauri

export interface PrayerSlot {
  name: string;
  dec: number;
  hhmm: string;
  enabled: boolean;
}

export interface Schedule {
  date: string;
  prayers: PrayerSlot[];
  next: string | null;
  /** null cuando no queda ninguno, o el adhan ya sonó */
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
