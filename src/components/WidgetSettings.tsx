export type WidgetConfig = {
  interval_minutes: number;
  show_clock?: boolean;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  interval_minutes: 1,
  show_clock: true,
};

export const WIDGET_INTERVAL_OPTIONS: { value: number; label: string; desc: string }[] = [
  { value: 1, label: "Cada 1 minuto", desc: "Tiempo real (recomendado) — la cuenta regresiva baja minuto a minuto." },
  { value: 5, label: "Cada 5 minutos", desc: "Balanceado — actualización frecuente con menor actividad." },
  { value: 15, label: "Cada 15 minutos", desc: "Ahorro de batería — refresco espaciado." },
  { value: 0, label: "Inteligente", desc: "Adaptativo — cada 15 min de lejos, cada 5 min a menos de 1h, y cada 1 min cerca del rezo." },
];

export function widgetIntervalLabel(minutes: number): string {
  const opt = WIDGET_INTERVAL_OPTIONS.find(o => o.value === minutes);
  return opt ? opt.label : `Cada ${minutes} min`;
}

interface WidgetSettingsProps {
  value: WidgetConfig;
  disabled?: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (value: WidgetConfig) => void;
}

export function WidgetSettings({
  value,
  disabled = false,
  editing,
  onEdit,
  onCancel,
  onChange,
}: WidgetSettingsProps) {
  const currentInterval = value.interval_minutes ?? 1;
  const showClock = value.show_clock ?? true;
  const currentOption = WIDGET_INTERVAL_OPTIONS.find(o => o.value === currentInterval) ?? WIDGET_INTERVAL_OPTIONS[0];

  return (
    <section className="panel setting-panel">
      <div className="panel-heading">
        <div>
          <h2>Widgets de inicio</h2>
          <p>Configuración de actualización, cuenta regresiva y reloj en la pantalla de inicio.</p>
        </div>
        {!editing && (
          <button className="edit-button" disabled={disabled} onClick={onEdit}>
            Editar widgets
          </button>
        )}
      </div>

      {editing ? (
        <div className="editor">
          <label>
            Frecuencia de actualización
            <select
              value={currentInterval}
              onChange={e => onChange({ ...value, interval_minutes: Number(e.target.value) })}
            >
              {WIDGET_INTERVAL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 14 }}>
            <label className="fila-check">
              <input
                type="checkbox"
                checked={showClock}
                onChange={e => onChange({ ...value, show_clock: e.target.checked })}
              />
              Mostrar hora del teléfono en la cabecera (ej. Cali • 09:04)
            </label>
            <p className="nota" style={{ marginTop: 4 }}>
              Utiliza el reloj nativo del sistema, sincronizado en vivo al segundo sin consumo adicional de batería.
            </p>
          </div>

          <p className="nota" style={{ marginTop: 12 }}>
            En reposo profundo con la pantalla apagada, Android suspende los refrescos para cuidar la batería y se sincroniza al instante al desbloquear la pantalla. Guardar confirma el cambio; Cancelar restaura la configuración anterior.
          </p>

          <div className="editor-actions">
            <button
              className="secondary-button"
              disabled={
                currentInterval === DEFAULT_WIDGET_CONFIG.interval_minutes &&
                showClock === DEFAULT_WIDGET_CONFIG.show_clock
              }
              onClick={() => onChange(DEFAULT_WIDGET_CONFIG)}
            >
              Restablecer predeterminado
            </button>
            <button className="secondary-button" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="read-grid">
          <div>
            <span>Frecuencia configurada</span>
            <b>{currentOption.label}</b>
          </div>
          <div>
            <span>Reloj del teléfono</span>
            <b>{showClock ? "Visible en la cabecera" : "Oculto"}</b>
          </div>
          <div>
            <span>Modo de funcionamiento</span>
            <b>{currentOption.desc}</b>
          </div>
          <p className="nota read-note">
            El widget en la pantalla de inicio mostrará la hora local y la cuenta regresiva sincronizadas según estas preferencias sin necesidad de abrir la aplicación.
          </p>
        </div>
      )}
    </section>
  );
}
