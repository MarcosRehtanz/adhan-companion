//! Estado del lector, separado de los horarios y del corpus de solo lectura.
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

static READER_LOCK: Mutex<()> = Mutex::new(());
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Position { pub sura: u16, pub aya: u16 }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderState {
    pub last: Option<Position>,
    pub bookmarks: Vec<Position>,
    pub arabic_size: u8,
    pub translation_size: u8,
    pub show_translation: bool,
}
impl Default for ReaderState {
    fn default() -> Self { Self { last: None, bookmarks: vec![], arabic_size: 30, translation_size: 16, show_translation: true } }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReaderAction {
    Position { sura: u16, aya: u16 },
    Bookmark { sura: u16, aya: u16 },
    Preferences { arabic_size: u8, translation_size: u8, show_translation: bool },
}
#[derive(Deserialize)]
struct Metadata { suras: Vec<Sura> }
#[derive(Deserialize)]
struct Sura { count: u16 }
fn valid(position: Position) -> bool {
    static COUNTS: OnceLock<Metadata> = OnceLock::new();
    let metadata = COUNTS.get_or_init(|| serde_json::from_str(include_str!("../../public/quran/suras.json")).expect("metadatos incluidos inválidos"));
    position.sura > 0 && metadata.suras.get(position.sura as usize - 1)
        .is_some_and(|s| position.aya > 0 && position.aya <= s.count)
}
fn validate(state: &ReaderState) -> Result<(), String> {
    if !state.last.is_none_or(valid) || state.bookmarks.iter().any(|p| !valid(*p)) {
        return Err("El punto de lectura o un marcador no corresponde a una aleya válida.".into());
    }
    if !(22..=48).contains(&state.arabic_size) || !(12..=24).contains(&state.translation_size) {
        return Err("El tamaño de lectura está fuera del rango permitido.".into());
    }
    if state.bookmarks.len() > 1000 { return Err("Se alcanzó el máximo de 1000 marcadores.".into()); }
    Ok(())
}
fn load() -> Result<ReaderState, String> {
    let path = crate::config::config_dir().join("quran-reader.json");
    let state = match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("No se pudo leer el estado del lector; el archivo se conservó: {e}"))?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => ReaderState::default(),
        Err(e) => return Err(format!("No se pudo abrir el estado del lector: {e}")),
    };
    validate(&state)?;
    Ok(state)
}
/// Adopción de un estado remoto (sync con Google): parse + validate + write
/// atómico con el mismo candado del lector. Si no valida, Err sin tocar el archivo.
pub fn reemplazar_state(texto: &str) -> Result<(), String> {
    let _guard = READER_LOCK.lock().map_err(|_| "No se pudo acceder al lector.")?;
    let estado: ReaderState = serde_json::from_str(texto).map_err(|e| format!("Estado del lector ilegible: {e}"))?;
    validate(&estado)?;
    let dir = crate::config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta del lector: {e}"))?;
    let path = dir.join("quran-reader.json");
    let tmp = dir.join("quran-reader.json.tmp");
    let data = serde_json::to_vec_pretty(&estado).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, data).map_err(|e| format!("No se pudo guardar el lector: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("No se pudo reemplazar el estado del lector: {e}")
    })
}

#[tauri::command]
pub fn get_quran_reader() -> Result<ReaderState, String> {
    let _guard = READER_LOCK.lock().map_err(|_| "No se pudo acceder al lector.")?;
    load()
}
#[tauri::command]
pub fn update_quran_reader(action: ReaderAction) -> Result<ReaderState, String> {
    let _guard = READER_LOCK.lock().map_err(|_| "No se pudo acceder al lector.")?;
    let mut state = load()?;
    match action {
        ReaderAction::Position { sura, aya } => state.last = Some(Position { sura, aya }),
        ReaderAction::Bookmark { sura, aya } => {
            let p = Position { sura, aya };
            if let Some(index) = state.bookmarks.iter().position(|b| *b == p) { state.bookmarks.remove(index); }
            else { state.bookmarks.push(p); state.bookmarks.sort_by_key(|b| (b.sura, b.aya)); }
        }
        ReaderAction::Preferences { arabic_size, translation_size, show_translation } => {
            state.arabic_size = arabic_size;
            state.translation_size = translation_size;
            state.show_translation = show_translation;
        }
    }
    validate(&state)?;
    let dir = crate::config::config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta del lector: {e}"))?;
    let path = dir.join("quran-reader.json");
    let tmp = dir.join("quran-reader.json.tmp");
    let data = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, data).map_err(|e| format!("No se pudo guardar el lector: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("No se pudo reemplazar el estado del lector: {e}")
    })?;
    // El estado del lector viaja en el respaldo: agenda la subida diferida.
    #[cfg(desktop)]
    crate::sync_google::avisar_cambio();
    Ok(state)
}
