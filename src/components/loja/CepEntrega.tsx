"use client";

// CEP de entrega na barra do topo (20/11/2026): fica entre a busca e os favoritos.
// Guarda o CEP e a forma (casa/loja) so no navegador; o frete real continua sendo
// cotado no servidor, no checkout.
import { useEffect, useRef, useState } from "react";

const CHAVE = "np-cep-entrega";
type Salvo = { cep: string; cidade: string; modo: "casa" | "loja" };

export function CepEntrega() {
  const [aberto, setAberto] = useState(false);
  const [salvo, setSalvo] = useState<Salvo | null>(null);
  const [cep, setCep] = useState("");
  const [modo, setModo] = useState<"casa" | "loja">("casa");
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Salvo | null;
      if (s) { setSalvo(s); setCep(s.cep); setModo(s.modo); }
    } catch { /* sem storage */ }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);

  async function confirmar() {
    setErro("");
    let cidade = "Retirada na loja";
    if (modo === "casa") {
      const d = cep.replace(/\D/g, "");
      if (d.length !== 8) return setErro("Digite os 8 números do CEP.");
      cidade = "";
      try {
        const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
        if (j.erro) return setErro("CEP não encontrado.");
        cidade = `${j.localidade}/${j.uf}`;
      } catch { /* sem rede: guarda so o CEP */ }
    }
    const s: Salvo = { cep: cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2"), cidade, modo };
    setSalvo(s);
    try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* ok */ }
    setAberto(false);
  }

  const rotulo = !salvo ? "Informe seu CEP" : salvo.modo === "loja" ? "Retirar na loja" : salvo.cep;

  return (
    <div ref={ref} className="cep-entrega">
      <button type="button" className="cep-entrega-botao" aria-label="Entregar em CEP" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="cep-entrega-texto">
          <small>{salvo?.modo === "loja" ? "Retire em" : "Entregar em"}</small>
          <strong>{rotulo}</strong>
        </span>
      </button>
      {aberto && (
        <div className="cep-entrega-pop" role="dialog" aria-label="Entrega">
          <div className="cep-entrega-modos">
            <button type="button" className={modo === "casa" ? "ativo" : ""} onClick={() => setModo("casa")}>Receba em casa</button>
            <button type="button" className={modo === "loja" ? "ativo" : ""} onClick={() => setModo("loja")}>Retire na loja</button>
          </div>
          {modo === "casa" ? (
            <>
              <label htmlFor="cep-entrega-input">Entregar em CEP</label>
              <div className="cep-entrega-linha">
                <input
                  id="cep-entrega-input"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
                />
                <button type="button" onClick={confirmar}>OK</button>
              </div>
              <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">
                Não sei meu CEP
              </a>
            </>
          ) : (
            <>
              <p>Retire sem custo de frete na loja. Escolha a retirada no checkout.</p>
              <button type="button" className="cep-entrega-ok" onClick={confirmar}>OK</button>
            </>
          )}
          {erro && <p role="alert" className="cep-entrega-erro">{erro}</p>}
          {salvo?.cidade && <p className="cep-entrega-cidade">{salvo.cidade}</p>}
        </div>
      )}
    </div>
  );
}
