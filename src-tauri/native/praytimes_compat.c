/*
 * praytimes_compat — implementación de la API pt_* sobre el port C de
 * PrayTimes 1.1. Ver praytimes_compat.h para el contexto.
 */

#include "praytimes_compat.h"
#include "prayertimes.h"

#include <math.h>

struct PrayTimes
{
	int unused_marker;
};

static struct PrayTimes pt_singleton;

/* Mapa del orden del spec → enums del port */
static void pt_apply_method(int method)
{
	switch (method) {
	case PT_METHOD_MWL:     set_calc_method(MWL);     break;
	case PT_METHOD_ISNA:    set_calc_method(ISNA);    break;
	case PT_METHOD_EGYPT:   set_calc_method(Egypt);   break;
	case PT_METHOD_MAKKAH:  set_calc_method(Makkah);  break;
	case PT_METHOD_KARACHI: set_calc_method(Karachi); break;
	case PT_METHOD_TEHRAN:
		/* Tehran = params OFICIALES de la Universidad de Tehran:
		 * fajr 17.7°, maghrib 4.5°, isha 14.1° (validados por el fixer de
		 * alAdhan en tests/validate_official.rs). El "Jafari" del port usa
		 * 16/4/14 — es la variante Ithna-Ashari del linaje PrayTimes 1.1. */
		set_calc_method(Jafari);
		method_params[Jafari].fajr_angle = 17.7;
		method_params[Jafari].maghrib_is_minutes = false;
		method_params[Jafari].maghrib_value = 4.5;
		method_params[Jafari].isha_is_minutes = false;
		method_params[Jafari].isha_value = 14.1;
		break;
	case PT_METHOD_JAFARI:  set_calc_method(Jafari);  break;
	case PT_METHOD_CUSTOM:  set_calc_method(Custom);  break;
	default:                set_calc_method(MWL);     break;
	}
}

static void pt_apply_high_lat(int rule)
{
	/* El port real od 4 reglas: None / MidNight / AngleBased / OneSeventh.
	 * AqrabAlAyyam ≈ OneSeventh y AqrabAlBilad / FixedAngle ≈ AngleBased
	 * (aprox documentada — el spec del vault las nombraba pero el port
	 * original JS/C nunca las implementó: corregir la ficha fuente). */
	switch (rule) {
	case PT_HL_NONE:            set_high_lats_adjust_method(None);      break;
	case PT_HL_MIDDLE_OF_NIGHT: set_high_lats_adjust_method(MidNight);  break;
	case PT_HL_ONE_SEVENTH:
	case PT_HL_AQRAB_AL_AYYAM:
	case PT_HL_AQRAB_AL_BILAD:  set_high_lats_adjust_method(OneSeventh); break;
	case PT_HL_ANGLE_BASED:
	case PT_HL_FIXED_ANGLE:     set_high_lats_adjust_method(AngleBased); break;
	default:                    set_high_lats_adjust_method(MidNight);  break;
	}
}

PrayTimes* pt_create(void)
{
	pt_singleton.unused_marker = 1;
	return &pt_singleton;
}

void pt_destroy(PrayTimes* pt)
{
	(void)pt; /* singleton no dinamico — nada que liberar */
}

void pt_init(PrayTimes* pt, int method)
{
	(void)pt;
	pt_apply_method(method);
}

void pt_set_madhab(PrayTimes* pt, int madhab)
{
	(void)pt;
	asr_juristic = (madhab == PT_MADHAB_HANAFI) ? Hanafi : Shafii;
}

void pt_set_high_lat_method(PrayTimes* pt, int rule)
{
	(void)pt;
	pt_apply_high_lat(rule);
}

void pt_tune(PrayTimes* pt, const char* name, int minutes)
{
	(void)pt;
	/* El port solo incluye dhuhr_minutes. Los offsets del resto de los
	 * rezos los aplica el lado Rust después del cálculo (post-proceso)
	 * para no divergir del comportamiento del JS original. */
	if (name && strcmp(name, "dhuhr") == 0)
		set_dhuhr_minutes((double)minutes);
}

void pt_set_fajr_angle(PrayTimes* pt, double angle)
{
	(void)pt;
	/* El setter del port altera calc_method→Custom, lo que PISA el método
	 * activo (ej: Makkah pierde su isha 90-min). Para seguir el contrato del
	 * spec (override manteniendo el método), parcheamos el campo directo. */
	method_params[calc_method].fajr_angle = angle;
}

void pt_set_isha_angle(PrayTimes* pt, double angle)
{
	(void)pt;
	method_params[calc_method].isha_is_minutes = false;
	method_params[calc_method].isha_value = angle;
}

/* maghrib como ángulo, preservando el método activo (el setter del port
 * también clobber a Custom — misma trampa que set_fajr_angle) */
void pt_set_maghrib_angle(PrayTimes* pt, double angle)
{
	(void)pt;
	method_params[calc_method].maghrib_is_minutes = false;
	method_params[calc_method].maghrib_value = angle;
}

void pt_get_times(PrayTimes* pt,
                  int year, int month, int day,
                  double lat, double lon, double tz_offset,
                  double times_out[PT_COUNT])
{
	(void)pt;
	get_prayer_times_(year, month, day, lat, lon, tz_offset, times_out);
}
