"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarCadastro, type DadosCliente } from "@/app/conta/actions";

export function CadastroForm({ inicial }: { inicial: DadosCliente }) {
  const [d, setD] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();
  const campo = (k: keyof DadosCliente, rotulo: string, tipo = "text") => (
    <label className="conta-campo">
      <span>{rotulo}</span>
      <input type={tipo} aria-label={rotulo} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  return (
    <form
      className="conta-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await atualizarCadastro(d);
          setMsg(r.ok ? { ok: true, t: "Dados salvos." } : { ok: false, t: r.erro ?? "Erro" });
          if (r.ok) router.refresh();
        });
      }}
    >
      {campo("nome", "Nome")}
      {campo("email", "E-mail", "email")}
      {campo("telefone", "Telefone")}
      {campo("whatsapp", "WhatsApp")}
      {campo("nascimento", "Nascimento", "date")}
      <div className="conta-form-acoes">
        <button type="submit" className="conta-botao" disabled={pend}>
          {pend ? "Salvando..." : "Salvar alterações"}
        </button>
        {msg && <p role="status" className={msg.ok ? "conta-ok" : "conta-erro"}>{msg.t}</p>}
      </div>
    </form>
  );
}
