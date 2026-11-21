import React, { useState, useEffect } from "react";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | "";
  onChange: (value: number | "") => void;
  min?: number;
  max?: number;
  step?: number | string;
  fallback?: number;
}

/**
 * Entrada numérica controlada con búfer de texto local.
 *
 * Regla de entradas numéricas:
 * - Durante la edición (onChange): permite al usuario vaciar el campo por completo ("")
 *   o escribir caracteres intermedios (signo "-", ".") sin que la interfaz fuerce de
 *   inmediato un valor por defecto (como 0 o 1) ni aplique recortes (clamping) en cada tecla.
 * - Al perder el foco (onBlur) o presionar Enter: valida y sanea el valor final, aplicando
 *   el valor por defecto (fallback) si quedó vacío o inválido, y ajustando a los límites [min, max].
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  fallback,
  onBlur,
  onFocus,
  onKeyDown,
  disabled,
  ...props
}: NumberInputProps) {
  const [text, setText] = useState<string>(value === "" ? "" : String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value === "" ? "" : String(value));
    }
  }, [value, isFocused]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    if (raw === "") {
      onChange("");
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    let n: number;
    if (text === "" || Number.isNaN(Number(text))) {
      n = fallback !== undefined ? fallback : (min !== undefined ? min : 0);
    } else {
      n = Number(text);
      if (step === 1 || step === "1") {
        n = Math.round(n);
      }
      if (min !== undefined && n < min) n = min;
      if (max !== undefined && n > max) n = max;
    }
    setText(String(n));
    onChange(n);
    onBlur?.(e);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    onKeyDown?.(e);
  }

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={text}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
