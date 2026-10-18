/** Calendario tabular civil (islamic-civil), época gregoriana 622-07-19.
 * Ciclo de 30 años y años intercalares según Unicode ICU.
 * https://unicode-org.github.io/icu-docs/apidoc/released/icu4j/com/ibm/icu/util/IslamicCalendar.CalculationType.html
 * Los instantes UTC aquí solo representan fechas; la fecha de hoy viene del scheduler local.
 */
const DAY = 86_400_000;
const EPOCH = Date.UTC(622, 6, 19) / DAY;
export const HIJRI_MONTHS = ["Muharram", "Safar", "Rabi al-awwal", "Rabi al-thani", "Jumada al-awwal", "Jumada al-thani", "Rajab", "Shaban", "Ramadán", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"];
export interface HijriDate { year: number; month: number; day: number }
const yearStart = (year: number) => EPOCH + 354 * (year - 1) + Math.floor((3 + 11 * year) / 30);
export function monthLength(year: number, month: number): number {
  return month === 12 ? (((11 * year + 14) % 30 < 11) ? 30 : 29) : month % 2 === 1 ? 30 : 29;
}
export function hijriDay(date: HijriDate): number {
  return yearStart(date.year) + Math.ceil(29.5 * (date.month - 1)) + date.day - 1;
}
export function civilDay(iso: string): number { return Date.parse(`${iso}T00:00:00Z`) / DAY; }
export function fromCivil(iso: string, adjustment = 0): HijriDate {
  const day = civilDay(iso) + adjustment;
  let year = Math.max(1, Math.floor((day - EPOCH) / 355) + 1);
  while (yearStart(year + 1) <= day) year++;
  let month = 1;
  while (month < 12 && hijriDay({ year, month: month + 1, day: 1 }) <= day) month++;
  return { year, month, day: day - hijriDay({ year, month, day: 1 }) + 1 };
}
export function toCivil(date: HijriDate, adjustment = 0): string {
  return new Date((hijriDay(date) - adjustment) * DAY).toISOString().slice(0, 10);
}
export function hijriLabel(iso: string, adjustment = 0): string {
  const h = fromCivil(iso, adjustment);
  return `${h.day} de ${HIJRI_MONTHS[h.month - 1]} de ${h.year} H`;
}
export function civilLabel(iso: string): string {
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
