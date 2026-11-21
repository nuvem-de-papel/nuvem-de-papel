"use client";

import { useId, useState } from "react";

// Campo de senha com botao Mostrar/Ocultar (pedido do Joaquim, 20/11/2026).
// O botao fica FORA do <label> e o nome dele nao contem "senha": assim
// getByLabel("Senha") continua achando so o input.
export function CampoSenha({
  rotulo = "Senha",
  value,
  onChange,
  autoComplete = "current-password",
  minLength,
  disabled,
  placeholder,
  className = "conta-campo",
  inputStyle,
  required = true,
}: {
  rotulo?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputStyle?: React.CSSProperties;
  required?: boolean;
}) {
  const id = useId();
  const [ver, setVer] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha">
        <input
          id={id}
          type={ver ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          style={inputStyle}
        />
        <button
          type="button"
          className="campo-senha-ver"
          aria-pressed={ver}
          aria-controls={id}
          onClick={() => setVer((v) => !v)}
        >
          {ver ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </div>
  );
}
