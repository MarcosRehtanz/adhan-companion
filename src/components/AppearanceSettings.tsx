import { useEffect } from "react";
export type Appearance = { theme: "light" | "dark" | "system"; accent: "teal" | "blue" | "violet" | "rose" | "amber" };
export const DEFAULT_APPEARANCE: Appearance = { theme: "light", accent: "teal" };
export const themes = { light: "Claro", dark: "Oscuro", system: "Seguir al sistema" };
export const palettes = {
  teal: { name: "Verde", solid: "#0e6f63", bright: "#6ed6bd", wash: "#e8f4f0", darkWash: "#203d36", sidebar: "#124f48" },
  blue: { name: "Azul", solid: "#245cac", bright: "#90bcff", wash: "#edf3fc", darkWash: "#21334e", sidebar: "#203c65" },
  violet: { name: "Violeta", solid: "#7043a5", bright: "#ccb0ff", wash: "#f3edfa", darkWash: "#362b48", sidebar: "#493263" },
  rose: { name: "Rosa", solid: "#a53660", bright: "#ffa5c4", wash: "#fceef3", darkWash: "#492c38", sidebar: "#622a42" },
  amber: { name: "Ámbar", solid: "#805600", bright: "#f1cb75", wash: "#fbf3df", darkWash: "#403823", sidebar: "#53401b" },
};
export function useAppearance(appearance: Appearance) {
  const { theme, accent } = appearance;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      const p = palettes[accent];
      const root = document.documentElement;
      root.dataset.theme = dark ? "dark" : "light";
      root.style.colorScheme = dark ? "dark" : "light";
      for (const [key, value] of Object.entries({ "--acento": dark ? p.bright : p.solid, "--acento-solido": p.solid, "--acento-claro": dark ? p.darkWash : p.wash, "--sidebar": p.sidebar })) root.style.setProperty(key, value);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, accent]);
}
export function AppearanceSettings({ value, disabled = false, editing, onEdit, onCancel, onChange }: { value: Appearance; disabled?: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onChange: (value: Appearance) => void }) {
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Apariencia</h2><p>Tema y color de acento de la aplicación.</p></div>{!editing && <button className="edit-button" disabled={disabled} onClick={onEdit}>Editar apariencia</button>}</div>
    {editing ? <div className="editor">
      <label>Tema<select value={value.theme} onChange={e => onChange({ ...value, theme: e.target.value as Appearance["theme"] })}>{Object.entries(themes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <fieldset className="appearance-colors"><legend>Color de acento</legend>{Object.entries(palettes).map(([key, p]) => <button key={key} type="button" aria-pressed={value.accent === key} onClick={() => onChange({ ...value, accent: key as Appearance["accent"] })}><span className="color-swatch" style={{ background: p.solid }} />{p.name}{value.accent === key && <span aria-hidden="true"> ✓</span>}</button>)}</fieldset>
      <p className="nota">Vista previa en toda la ventana. Guardar conserva la elección; Cancelar restaura la apariencia anterior.</p>
      <div className="editor-actions"><button className="secondary-button" disabled={value.theme === DEFAULT_APPEARANCE.theme && value.accent === DEFAULT_APPEARANCE.accent} onClick={() => onChange(DEFAULT_APPEARANCE)}>Restablecer predeterminados</button><button className="secondary-button" onClick={onCancel}>Cancelar</button></div>
    </div> : <div className="read-grid"><div><span>Tema</span><b>{themes[value.theme]}</b></div><div><span>Color de acento</span><b className="appearance-summary"><span className="color-swatch" style={{ background: palettes[value.accent].solid }} />{palettes[value.accent].name}</b></div></div>}
  </section>;
}
