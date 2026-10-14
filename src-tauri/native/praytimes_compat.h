/*
 * praytimes_compat — la API `pt_*` del spec (firmas de la ficha
 * [[11 Hardware/Perifericos/Componentes/PrayTimes C]], vault) sobre el port C
 * oficial de PrayTimes 1.1 (Igor Pylypiv → Mohammad Ebrahim, LGPL v3).
 *
 * El port usa estado global (calc_method, latitude, ...). El wrapper es
 * thread-hostile como el original: las llamadas al cálculo se serializan
 * con un Mutex desde el lado Rust (prayer.rs).
 */

#ifndef PRAYTIMES_COMPAT_H
#define PRAYTIMES_COMPAT_H

typedef struct PrayTimes PrayTimes;

/* Métodos según el orden del spec del vault */
enum {
	PT_METHOD_MWL = 0,
	PT_METHOD_ISNA,
	PT_METHOD_EGYPT,
	PT_METHOD_MAKKAH,
	PT_METHOD_KARACHI,
	PT_METHOD_TEHRAN,
	PT_METHOD_JAFARI,
	PT_METHOD_CUSTOM,
};

enum {
	PT_MADHAB_SHAFI = 0,
	PT_MADHAB_HANAFI,
};

/* El spec declaraba 7 reglas; el port real implementa 4 (ver vault):
 * NONE, MIDDLE_OF_NIGHT, AQRAB_* ≈ ONE_SEVENTH, ANGLE_BASED/FIXED_ANGLE */
enum {
	PT_HL_NONE = 0,
	PT_HL_MIDDLE_OF_NIGHT,
	PT_HL_ANGLE_BASED,
	PT_HL_AQRAB_AL_AYYAM,
	PT_HL_AQRAB_AL_BILAD,
	PT_HL_ONE_SEVENTH,
	PT_HL_FIXED_ANGLE,
};

#define PT_COUNT 7
/* Índices: 0=Fajr, 1=Sunrise, 2=Dhuhr, 3=Asr, 4=Sunset, 5=Maghrib, 6=Isha */

PrayTimes* pt_create(void);
void pt_destroy(PrayTimes* pt);
void pt_init(PrayTimes* pt, int method);
void pt_set_madhab(PrayTimes* pt, int madhab);
void pt_set_high_lat_method(PrayTimes* pt, int rule);
void pt_tune(PrayTimes* pt, const char* name, int minutes); /* "fajr", "isha", etc. */
void pt_set_fajr_angle(PrayTimes* pt, double angle);
void pt_set_isha_angle(PrayTimes* pt, double angle);

/* times_out[PT_COUNT] en horas decimales (5.5 = 05:30) */
void pt_get_times(PrayTimes* pt,
                  int year, int month, int day,
                  double lat, double lon, double tz_offset,
                  double times_out[PT_COUNT]);

#endif /* PRAYTIMES_COMPAT_H */
