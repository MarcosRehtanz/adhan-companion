import type { Schedule } from "../types";

export const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const ARABIC_NAMES: Record<string, string> = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };

/** Horas decimales locales de un instante. */
export const hoursOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

/**
 * Misma regla que el core (`scheduler::check_mark_time`): un rezo de hoy se marca
 * desde su horario. Otras fechas, horarios no calculables o Isha pasada la
 * medianoche no se limitan.
 */
export function prayerReached(schedule: Schedule | null, date: string, name: string, now = new Date()): boolean {
  if (!schedule || date !== schedule.date) return true;
  const slot = schedule.prayers.find(s => s.name === name);
  const dhuhr = schedule.prayers.find(s => s.name === "Dhuhr")?.dec ?? 12;
  if (!slot || !Number.isFinite(slot.dec) || (name !== "Fajr" && slot.dec < dhuhr)) return true;
  return hoursOf(now) >= slot.dec;
}

/** «1 h 29 min», «12 min» o «menos de 1 min». */
export function remaining(seconds: number): string {
  if (seconds < 60) return "menos de 1 min";
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const POINTS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
/** Punto cardinal de un rumbo en grados desde el norte. */
export function cardinal(degrees: number): string {
  return POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
