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
}
