export interface RamadanConfig {
  enabled: boolean;
  imsak_minutes: number;
  imsak_alert: boolean;
  iftar_alert: boolean;
}

export const DEFAULT_RAMADAN: RamadanConfig = {
  enabled: false,
  imsak_minutes: 10,
  imsak_alert: true,
  iftar_alert: true,
};

export function RamadanSettings({
  value,
  disabled = false,
  editing,
  onEdit,
  onCancel,
  onChange,
}: {
  value?: RamadanConfig;
  disabled?: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (value: RamadanConfig) => void;
}) {
  const current = value ?? DEFAULT_RAMADAN;

  return (
    <section className="panel setting-panel">
      <div className="panel-heading">
        <div>
          <h2>Modo Ramadán</h2>
          <p>Horarios y avisos de ayuno: fin del suhur (imsak) y ruptura del ayuno (iftar).</p>
        </div>
        {!editing && (
          <button className="edit-button" disabled={disabled} onClick={onEdit}>
            Editar Ramadán
          </button>
        )}
      </div>

      {editing ? (
        <div className="editor">
          <label className="fila-check">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => onChange({ ...current, enabled: e.target.checked })}
            />
            Activar modo Ramadán
          </label>

          {current.enabled && (
            <>
              <div className="campo-imsak" style={{ marginTop: 12 }}>
                <label>
                  Adelanto de Imsak (fin del suhur)
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      step={1}
                      value={current.imsak_minutes}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) {
                          onChange({ ...current, imsak_minutes: Math.max(5, Math.min(60, v)) });
                        }
                      }}
                      style={{ width: 80 }}
                    />
                    <span className="min">minutos antes de Fajr</span>
                  </div>
                </label>
                <p className="nota" style={{ marginTop: 4 }}>
                  El adelanto es una precaución prudencial para concluir la comida previa (suhur). El ayuno formal comienza al despuntar el alba (Fajr, Corán 2:187).
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <label className="fila-check">
                  <input
                    type="checkbox"
                    checked={current.imsak_alert}
                    onChange={(e) => onChange({ ...current, imsak_alert: e.target.checked })}
                  />
                  Avisar con notificación en el horario de Imsak
                </label>

                <label className="fila-check">
                  <input
                    type="checkbox"
                    checked={current.iftar_alert}
                    onChange={(e) => onChange({ ...current, iftar_alert: e.target.checked })}
                  />
                  Mencionar el Iftar en la notificación de Maghrib
                </label>
              </div>
            </>
          )}

          <div className="editor-actions" style={{ marginTop: 16 }}>
            <button className="secondary-button" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="read-grid read-grid-four">
          <div>
            <span>Estado</span>
            <b>{current.enabled ? "Activo" : "Desactivado"}</b>
          </div>
          <div>
            <span>Adelanto de Imsak</span>
            <b>{current.enabled ? `${current.imsak_minutes} min antes de Fajr` : "—"}</b>
          </div>
          <div>
            <span>Aviso de Imsak</span>
            <b>{current.enabled ? (current.imsak_alert ? "Activado" : "Silenciado") : "—"}</b>
          </div>
          <div>
            <span>Aviso de Iftar</span>
            <b>{current.enabled ? (current.iftar_alert ? "Al Maghrib" : "Silenciado") : "—"}</b>
          </div>
        </div>
      )}

      <div className="ramadan-referencia" style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "var(--acento-claro)", fontSize: 13, color: "var(--texto)" }}>
        <p style={{ margin: "0 0 6px 0", fontWeight: 600 }}>
          Sobre los horarios del ayuno:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5, color: "var(--texto-suave)" }}>
          <li><b>Inicio del ayuno:</b> Corresponde exactamente a la oración de Fajr calculada según tu método.</li>
          <li><b>Imsak:</b> Recordatorio previo opcional para concluir el suhur con tranquilidad. No es una sexta oración ni modifica la hora de Fajr.</li>
          <li><b>Iftar (ruptura):</b> Coincide con la oración de Maghrib calculada para tu método activo.</li>
        </ul>
      </div>
    </section>
  );
}
