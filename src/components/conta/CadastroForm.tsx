"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarCadastro, trocarSenha, type DadosCliente } from "@/app/conta/actions";
import { CampoSenha } from "@/components/forms/CampoSenha";

// Layout (21/11/2026, pedido do Joaquim): linha 1 = nome + e-mail;
// linha 2 = nascimento, telefone, WhatsApp; linha 3 = senha, repetir senha e
// o botao Salvar. A senha e opcional: em branco, so os dados sao salvos.
export function CadastroForm({ inicial }: { inicial: DadosCliente }) {
  const [d, setD] = useState(inicial);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
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
      className="conta-form conta-form-cadastro"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        if ((senha || senha2) && senha !== senha2) {
          setMsg({ ok: false, t: "As duas senhas não são iguais." });
          return;
        }
        start(async () => {
          const r = await atualizarCadastro(d);
          if (!r.ok) {
            setMsg({ ok: false, t: r.erro ?? "Erro" });
            return;
          }
          if (senha) {
            const s = await trocarSenha(senha, senha2);
            if (!s.ok) {
              setMsg({ ok: false, t: s.erro ?? "Erro" });
              return;
            }
            setSenha("");
            setSenha2("");
            setMsg({ ok: true, t: "Dados e senha salvos." });
          } else {
            setMsg({ ok: true, t: "Dados salvos." });
          }
          router.refresh();
        });
      }}
    >
      <div className="conta-form-l1">
        {campo("nome", "Nome completo")}
        {campo("email", "E-mail", "email")}
      </div>
      <div className="conta-form-l2">
        {campo("nascimento", "Data de nascimento", "date")}
        {campo("telefone", "Telefone")}
        {campo("whatsapp", "WhatsApp")}
      </div>
      <div className="conta-form-l3">
        <CampoSenha rotulo="Senha" value={senha} onChange={setSenha} autoComplete="new-password" required={false} />
        <CampoSenha rotulo="Repetir senha" value={senha2} onChange={setSenha2} autoComplete="new-password" required={false} />
        <button type="submit" className="conta-botao" disabled={pend}>
          {pend ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
      <p className="conta-form-dica">
        Deixe a senha em branco para manter a atual. Entrou com o Google? Crie aqui uma senha para entrar também com o
        e-mail.
      </p>
      {msg && <p role="status" className={msg.ok ? "conta-ok" : "conta-erro"}>{msg.t}</p>}
    </form>
  );
}
