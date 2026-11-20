"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removerEndereco, salvarEndereco, type Endereco } from "@/app/conta/actions";

const VAZIO: Endereco = { recipient_name: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

export function EnderecosEditor({ enderecos }: { enderecos: Endereco[] }) {
  const [edit, setEdit] = useState<Endereco | null>(null);
  const [msg, setMsg] = useState("");
  const [pend, start] = useTransition();
  const router = useRouter();

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8 || !edit) return;
    try {
      const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
      if (!j.erro) setEdit((e) => e && { ...e, logradouro: j.logradouro || e.logradouro, bairro: j.bairro || e.bairro, cidade: j.localidade || e.cidade, uf: j.uf || e.uf });
    } catch {
      /* digita a mao */
    }
  }

  function rodar(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setMsg("");
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg(r.erro ?? "Erro");
      setEdit(null);
      router.refresh();
    });
  }

  const campo = (k: keyof Endereco, rotulo: string) => (
    <label className="conta-campo">
      <span>{rotulo}</span>
      <input
        aria-label={rotulo}
        value={edit?.[k] ?? ""}
        onChange={(e) => setEdit((x) => x && { ...x, [k]: e.target.value })}
        onBlur={k === "cep" ? (e) => buscarCep(e.target.value) : undefined}
      />
    </label>
  );

  return (
    <>
      {enderecos.length === 0 && !edit && <p className="conta-vazio">Nenhum endereço salvo.</p>}
      <ul className="conta-lista">
        {enderecos.map((e) => (
          <li key={e.id}>
            <strong>{e.recipient_name}</strong>
            <span>
              {e.logradouro}, {e.numero}
              {e.complemento ? ` - ${e.complemento}` : ""} · {e.bairro}
            </span>
            <span>
              {e.cidade}/{e.uf} · CEP {e.cep}
            </span>
            <span className="conta-lista-acoes">
              <button type="button" onClick={() => setEdit({ ...e, complemento: e.complemento ?? "" })}>Editar</button>
              <button type="button" disabled={pend} onClick={() => rodar(() => removerEndereco(e.id!))}>Remover</button>
            </span>
          </li>
        ))}
      </ul>
      {edit ? (
        <form className="conta-form" onSubmit={(ev) => { ev.preventDefault(); rodar(() => salvarEndereco(edit)); }}>
          {campo("recipient_name", "Quem recebe")}
          {campo("cep", "CEP")}
          {campo("logradouro", "Rua")}
          {campo("numero", "Número")}
          {campo("complemento", "Complemento")}
          {campo("bairro", "Bairro")}
          {campo("cidade", "Cidade")}
          {campo("uf", "UF")}
          <div className="conta-form-acoes">
            <button type="submit" className="conta-botao" disabled={pend}>{pend ? "Salvando..." : "Salvar endereço"}</button>
            <button type="button" className="conta-botao-sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="conta-botao" style={{ marginTop: 14 }} onClick={() => setEdit({ ...VAZIO })}>
          Novo endereço
        </button>
      )}
      {msg && <p role="status" className="conta-erro">{msg}</p>}
    </>
  );
}
