"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PAPEIS, PAPEIS_QUE_GERENCIA, podeGerenciar } from "@/lib/rbac";
import {
  alterarPapel,
  alternarStatus,
  criarUsuario,
} from "@/app/configuracoes/usuarios/actions";

type Usuario = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

type Feedback = { tipo: "erro" | "aviso"; texto: string } | null;

const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
};

const BTN: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--pink-600)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
};

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ConsoleUsuarios({
  usuarios,
  euId,
  meuPapel,
}: {
  usuarios: Usuario[];
  euId: string;
  meuPapel: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("");
  const [senha, setSenha] = useState("");

  const papeisCriaveis = PAPEIS_QUE_GERENCIA[meuPapel] ?? [];

  function executar(
    acao: () => Promise<{ ok: boolean; erro?: string; aviso?: string }>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await acao();
        if (r.ok) {
          setFeedback(r.aviso ? { tipo: "aviso", texto: r.aviso } : null);
          router.refresh();
        } else {
          setFeedback({ tipo: "erro", texto: r.erro ?? "Falha na ação." });
        }
        resolve(r.ok);
      });
    });
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const ok = await executar(() => criarUsuario({ email, fullName: nome, role: papel, senha }));
    if (ok) {
      setEmail("");
      setNome("");
      setPapel("");
      setSenha("");
    }
  }

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        Usuários
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Gestão da equipe e papéis (RBAC). Toda alteração fica registrada na trilha de auditoria.
      </p>

      {feedback && (
        <p
          style={{
            background: feedback.tipo === "erro" ? "#FDECEC" : "var(--blue-100)",
            color: feedback.tipo === "erro" ? "#C62828" : "var(--blue-600)",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          {feedback.texto}
        </p>
      )}

      <div
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          boxShadow: "var(--shadow-card)",
          marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Novo usuário</h2>
        <form onSubmit={handleCriar} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...INPUT, flex: "1 1 220px" }}
          />
          <input
            type="text"
            placeholder="Nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ ...INPUT, flex: "1 1 200px" }}
          />
          <select
            required
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            style={{ ...INPUT, flex: "0 1 160px" }}
          >
            <option value="">Papel…</option>
            {papeisCriaveis.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Senha (mín. 8)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{ ...INPUT, flex: "0 1 180px" }}
          />
          <button type="submit" disabled={pendente} style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}>
            {pendente ? "Criando…" : "Criar usuário"}
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 12 }}>
          Master cria todos os papéis; gerente cria operador/vendedor/fornecedor/revenda.
          Ninguém edita o próprio papel — e você não edita o seu.
        </p>
      </div>

      <div
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
          Equipe ({usuarios.length})
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12, textTransform: "uppercase" }}>
              <th style={{ paddingBottom: 12 }}>Usuário</th>
              <th style={{ paddingBottom: 12 }}>Papel</th>
              <th style={{ paddingBottom: 12 }}>Status</th>
              <th style={{ paddingBottom: 12 }}>Criado em</th>
              <th style={{ paddingBottom: 12, textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const souEu = u.id === euId;
              const editavel = !souEu && podeGerenciar(meuPapel, u.role);
              const opcoes = [...new Set([u.role, ...PAPEIS.filter((p) => podeGerenciar(meuPapel, p))])];
              return (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 0" }}>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{u.full_name || u.email}</span>
                    {u.full_name && (
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>
                        {u.email}
                        {souEu ? " · você" : ""}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <select
                      value={u.role}
                      disabled={!editavel || pendente}
                      onChange={(e) =>
                        executar(() => alterarPapel({ userId: u.id, novoRole: e.target.value }))
                      }
                      style={{ ...INPUT, padding: "7px 10px", background: editavel ? "#FFFFFF" : "var(--bg-cotton)" }}
                    >
                      {opcoes.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <span
                      style={{
                        background:
                          u.status === "ativo"
                            ? "var(--blue-100)"
                            : u.status === "pendente"
                              ? "#FEF3C7"
                              : "var(--bg-cotton)",
                        color:
                          u.status === "ativo"
                            ? "var(--blue-600)"
                            : u.status === "pendente"
                              ? "#B45309"
                              : "var(--ink-soft)",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "var(--radius-chip)",
                      }}
                    >
                      {u.status === "ativo" ? "Ativo" : u.status === "pendente" ? "Pendente" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                    {dataCurta(u.created_at)}
                  </td>
                  <td style={{ padding: "12px 0", textAlign: "right" }}>
                    {u.status === "pendente" ? (
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          disabled={!editavel || pendente}
                          onClick={() =>
                            executar(() =>
                              alternarStatus({ userId: u.id, novoStatus: "ativo" })
                            )
                          }
                          style={{
                            ...BTN,
                            background: "var(--blue-600)",
                            opacity: !editavel || pendente ? 0.5 : 1,
                          }}
                        >
                          Aprovar
                        </button>
                        <button
                          disabled={!editavel || pendente}
                          onClick={() =>
                            executar(() =>
                              alternarStatus({ userId: u.id, novoStatus: "inativo" })
                            )
                          }
                          style={{
                            ...BTN,
                            background: "var(--ink-soft)",
                            opacity: !editavel || pendente ? 0.5 : 1,
                          }}
                        >
                          Rejeitar
                        </button>
                      </span>
                    ) : (
                      <button
                        disabled={!editavel || pendente}
                        onClick={() =>
                          executar(() =>
                            alternarStatus({
                              userId: u.id,
                              novoStatus: u.status === "ativo" ? "inativo" : "ativo",
                            })
                          )
                        }
                        style={{
                          ...BTN,
                          background: u.status === "ativo" ? "var(--ink-soft)" : "var(--blue-600)",
                          opacity: !editavel || pendente ? 0.5 : 1,
                        }}
                      >
                        {u.status === "ativo" ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
