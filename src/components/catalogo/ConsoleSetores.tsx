"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { IconeGrupo } from "@/components/catalogo/IconeGrupo";
import { alternarNaBarra, definirGrupoDoSetor, moverGrupo } from "@/app/configuracoes/setores/actions";

export type GrupoTela = {
  id: string;
  slug: string;
  titulo: string;
  icone: string;
  naBarra: boolean;
  ativo: boolean;
  ativos: number;
};
export type SetorTela = { nome: string; grupoId: string | null; total: number; ativos: number };

const card: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 14,
  padding: "18px 20px",
  marginBottom: 18,
  boxShadow: "0 1px 3px rgba(0,0,0,.08)",
};

export function ConsoleSetores({ grupos, setores }: { grupos: GrupoTela[]; setores: SetorTela[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const semGrupo = setores.filter((s) => !s.grupoId);
  const comGrupo = setores.filter((s) => s.grupoId);
  const naBarra = grupos.filter((g) => g.naBarra);

  function rodar(fn: () => Promise<{ ok: boolean; erro?: string }>, ok: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, texto: ok } : { ok: false, texto: r.erro ?? "Erro." });
      if (r.ok) router.refresh();
    });
  }

  function seletor(s: SetorTela) {
    return (
      <select
        aria-label={`Grupo do setor ${s.nome}`}
        value={s.grupoId ?? ""}
        disabled={pend}
        onChange={(e) =>
          rodar(() => definirGrupoDoSetor(s.nome, e.target.value || null), `Setor ${s.nome} atualizado.`)
        }
        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #C9C9C9", minWidth: 220 }}
      >
        <option value="">— Sem grupo (não aparece no menu) —</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.titulo}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div style={{ padding: "0 24px 40px" }}>
      <PageHeader titulo="Setores e menu" subtitulo="o que aparece na barra da loja" voltarPara="/crm" />

      {msg && (
        <div role="alert" style={{ ...card, padding: "10px 16px", background: msg.ok ? "#E8F6EE" : "#FDECEC", color: msg.ok ? "#1C6B3C" : "#9B1C1C" }}>
          {msg.texto}
        </div>
      )}

      <section style={card} aria-label="Prévia da barra">
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Como a barra está agora</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: "linear-gradient(90deg,#F4C7D8,#D9C8F2)", fontWeight: 600, fontSize: 14 }}>
          <span style={{ background: "#1F1F1F", color: "#fff", padding: "6px 14px", borderRadius: 999, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <IconeGrupo icone="menu" tamanho={16} /> Todos os setores ▾
          </span>
          {naBarra.map((g) => (
            <span key={g.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <IconeGrupo icone={g.icone} tamanho={16} /> {g.titulo}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: "#B5507F", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <IconeGrupo icone="estrela" tamanho={16} /> Lançamentos
          </span>
        </div>
      </section>

      {semGrupo.length > 0 && (
        <section style={{ ...card, border: "2px solid #E084AC" }} aria-label="Setores sem grupo">
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>⚠ Setores novos sem grupo ({semGrupo.length})</h2>
          <p style={{ margin: "0 0 12px", color: "#555", fontSize: 14 }}>
            Apareceram no cadastro de produto. Escolha o grupo para eles entrarem no menu da loja.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {semGrupo.map((s) => (
                <tr key={s.nome} style={{ borderTop: "1px solid #EEE" }}>
                  <td style={{ padding: "8px 4px", fontWeight: 600 }}>{s.nome}</td>
                  <td style={{ padding: "8px 4px", color: "#666" }}>{s.ativos} ativos / {s.total}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }}>{seletor(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={card} aria-label="Grupos">
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Grupos (ordem do menu)</h2>
        <p style={{ margin: "0 0 12px", color: "#555", fontSize: 14 }}>
          Marque “Na barra” para virar atalho ao lado de “Todos os setores” (máximo 6). As setas mudam a ordem.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: 6 }}>Ordem</th>
              <th style={{ padding: 6 }}>Grupo</th>
              <th style={{ padding: 6 }}>Produtos ativos</th>
              <th style={{ padding: 6 }}>Na barra</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, i) => (
              <tr key={g.id} style={{ borderTop: "1px solid #EEE" }}>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                  <button type="button" aria-label={`Subir ${g.titulo}`} disabled={pend || i === 0} onClick={() => rodar(() => moverGrupo(g.id, -1), "Ordem salva.")}>▲</button>{" "}
                  <button type="button" aria-label={`Descer ${g.titulo}`} disabled={pend || i === grupos.length - 1} onClick={() => rodar(() => moverGrupo(g.id, 1), "Ordem salva.")}>▼</button>
                </td>
                <td style={{ padding: 6 }}>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <IconeGrupo icone={g.icone} tamanho={18} /> {g.titulo}
                  </span>
                </td>
                <td style={{ padding: 6, color: g.ativos ? "#222" : "#B5507F" }}>
                  {g.ativos}{g.ativos === 0 ? " (abre vazio na loja)" : ""}
                </td>
                <td style={{ padding: 6 }}>
                  <input
                    type="checkbox"
                    aria-label={`Na barra: ${g.titulo}`}
                    checked={g.naBarra}
                    disabled={pend}
                    onChange={(e) => rodar(() => alternarNaBarra(g.id, e.target.checked), `${g.titulo}: barra atualizada.`)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={card} aria-label="Setores por grupo">
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Setores ({comGrupo.length})</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {comGrupo.map((s) => (
              <tr key={s.nome} style={{ borderTop: "1px solid #EEE" }}>
                <td style={{ padding: "6px 4px", fontWeight: 600 }}>{s.nome}</td>
                <td style={{ padding: "6px 4px", color: "#666" }}>{s.ativos} ativos / {s.total}</td>
                <td style={{ padding: "6px 4px", textAlign: "right" }}>{seletor(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
