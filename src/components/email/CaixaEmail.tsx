"use client";

import { useState } from "react";
import {
  baixarAnexo,
  enviarManual,
  marcarLido,
  responder,
  type ResultadoAcao,
} from "@/app/email/actions";

export type Anexo = {
  filename?: string;
  content_type?: string | null;
  size?: number | null;
  storage_path?: string;
};

export type Mensagem = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  source: string;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  html: string | null;
  text: string | null;
  created_at: string;
  read_at: string | null;
  error: string | null;
  attachments: Anexo[];
};

const ROTULOS: Record<string, { rotulo: string; cor: string }> = {
  queued: { rotulo: "Na fila", cor: "var(--ink-soft)" },
  sent: { rotulo: "Enviado", cor: "var(--navy)" },
  delivered: { rotulo: "Entregue", cor: "#1f9d55" },
  opened: { rotulo: "Aberto", cor: "#1f9d55" },
  clicked: { rotulo: "Clicado", cor: "#1f9d55" },
  bounced: { rotulo: "Rejeitado", cor: "#d64545" },
  complained: { rotulo: "Spam", cor: "#d64545" },
  failed: { rotulo: "Falhou", cor: "#d64545" },
  canceled: { rotulo: "Cancelado", cor: "var(--ink-soft)" },
  received: { rotulo: "Recebido", cor: "var(--navy)" },
};

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badge(status: string) {
  const info = ROTULOS[status] ?? { rotulo: status, cor: "var(--ink-soft)" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: info.cor,
        border: `1px solid ${info.cor}`,
        borderRadius: 999,
        padding: "1px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {info.rotulo}
    </span>
  );
}

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "var(--bg-cloud)",
  outline: "none",
  boxSizing: "border-box",
};

const BOTAO: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  background: "var(--pink-600)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "'Open Sans', sans-serif",
  cursor: "pointer",
};

function Feedback({ msg, ok }: { msg: string | null; ok: boolean }) {
  if (!msg) return null;
  return (
    <p
      role="status"
      style={{
        fontSize: 13.5,
        fontWeight: 600,
        color: ok ? "#1f9d55" : "#d64545",
        margin: "8px 0 0",
      }}
    >
      {msg}
    </p>
  );
}

export function CaixaEmail({
  entrada,
  enviados,
}: {
  entrada: Mensagem[];
  enviados: Mensagem[];
}) {
  const [aba, setAba] = useState<"entrada" | "enviados" | "compor">("entrada");
  const [selEntrada, setSelEntrada] = useState<Mensagem | null>(null);
  const [selEnviado, setSelEnviado] = useState<Mensagem | null>(null);
  const [resposta, setResposta] = useState("");
  const [respondendo, setRespondendo] = useState(false);
  const [form, setForm] = useState({ destinatario: "", assunto: "", html: "" });
  const [fb, setFb] = useState<{ msg: string; ok: boolean } | null>(null);

  const naoLidas = entrada.filter((m) => !m.read_at).length;

  function abrirEntrada(m: Mensagem) {
    setSelEntrada(m);
    setRespondendo(false);
    setResposta("");
    if (!m.read_at) {
      setSelEntrada({ ...m, read_at: new Date().toISOString() });
      void marcarLido(m.id);
    }
  }

  async function acao(fn: () => Promise<ResultadoAcao>) {
    const r = await fn();
    setFb({ msg: r.ok ? "Feito." : r.erro, ok: r.ok });
  }

  function abrirAnexo(m: Mensagem, a: Anexo) {
    if (!a.storage_path) return;
    void baixarAnexo(m.id, a.storage_path).then((r) => {
      if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
      else setFb({ msg: r.erro ?? "Falha ao abrir anexo.", ok: false });
    });
  }

  const leitor = (m: Mensagem | null) => {
    if (!m) {
      return (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          Selecione uma mensagem para ler.
        </p>
      );
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <strong style={{ fontSize: 15 }}>{m.subject || "(sem assunto)"}</strong>
          {badge(m.status)}
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 4px" }}>
          {m.direction === "inbound"
            ? `De: ${m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email}`
            : `Para: ${m.to_emails.join(", ")}`}{" "}
          · {quando(m.created_at)}
        </p>
        {m.error ? (
          <p style={{ fontSize: 13, color: "#d64545", margin: "0 0 8px" }}>{m.error}</p>
        ) : null}
        {m.attachments.length > 0 ? (
          <p style={{ fontSize: 13, margin: "0 0 8px" }}>
            Anexos:{" "}
            {m.attachments.map((a, i) => (
              <button
                key={i}
                onClick={() => abrirAnexo(m, a)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--pink-600)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 0,
                  marginRight: 10,
                  textDecoration: "underline",
                  fontFamily: "'Open Sans', sans-serif",
                }}
              >
                {a.filename ?? `anexo-${i + 1}`}
              </button>
            ))}
          </p>
        ) : null}
        {m.html ? (
          <iframe
            title="Mensagem"
            sandbox=""
            srcDoc={m.html}
            style={{
              width: "100%",
              height: 420,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "#fff",
            }}
          />
        ) : (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "'Open Sans', sans-serif",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 16,
              background: "#fff",
              margin: 0,
            }}
          >
            {m.text ?? "(sem corpo)"}
          </pre>
        )}
        {m.direction === "inbound" ? (
          <div style={{ marginTop: 12 }}>
            {!respondendo ? (
              <button
                onClick={() => setRespondendo(true)}
                style={{ ...BOTAO, background: "var(--navy)" }}
              >
                Responder
              </button>
            ) : (
              <div>
                <textarea
                  aria-label="Texto da resposta"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={5}
                  placeholder="Escreva a resposta…"
                  style={{ ...INPUT, resize: "vertical", marginBottom: 8 }}
                />
                <button
                  onClick={() => void acao(() => responder({ originalId: m.id, html: resposta }))}
                  style={BOTAO}
                >
                  Enviar resposta
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const lista = (
    itens: Mensagem[],
    sel: Mensagem | null,
    escolher: (m: Mensagem) => void,
    rotulo: (m: Mensagem) => string,
    sub: (m: Mensagem) => string
  ) => (
    <div
      style={{
        background: "var(--bg-cloud)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: 8,
        boxShadow: "var(--shadow-card)",
        maxHeight: 640,
        overflowY: "auto",
      }}
    >
      {itens.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 12, margin: 0 }}>
          Nenhuma mensagem.
        </p>
      ) : (
        itens.map((m) => (
          <button
            key={m.id}
            onClick={() => escolher(m)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: sel?.id === m.id ? "#fff" : "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              cursor: "pointer",
              fontFamily: "'Open Sans', sans-serif",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              {!m.read_at ? (
                <span
                  aria-label="Não lida"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--pink-600)",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: m.read_at ? 600 : 800,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {rotulo(m)}
              </span>
              <span style={{ marginLeft: "auto" }}>{badge(m.status)}</span>
            </span>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink-soft)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sub(m)}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{quando(m.created_at)}</span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        E-mail
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
        Caixa da empresa — {naoLidas > 0 ? `${naoLidas} não lida(s) · ` : ""}envio e recebimento via
        Resend.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["entrada", "enviados", "compor"] as const).map((nome) => (
          <button
            key={nome}
            aria-label={`Aba ${nome}`}
            onClick={() => {
              setAba(nome);
              setFb(null);
            }}
            style={{
              padding: "8px 18px",
              borderRadius: 10,
              border: `1.5px solid ${aba === nome ? "var(--pink-600)" : "var(--border)"}`,
              background: aba === nome ? "var(--pink-600)" : "var(--bg-cloud)",
              color: aba === nome ? "#fff" : "var(--ink-soft)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Open Sans', sans-serif",
              textTransform: "capitalize",
            }}
          >
            {nome}
          </button>
        ))}
      </div>

      <Feedback msg={fb?.msg ?? null} ok={fb?.ok ?? false} />

      {aba === "entrada" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 20 }}>
          {lista(
            entrada,
            selEntrada,
            abrirEntrada,
            (m) => m.from_name || m.from_email,
            (m) => m.subject || "(sem assunto)"
          )}
          <div
            style={{
              background: "var(--bg-cloud)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              padding: 24,
              boxShadow: "var(--shadow-card)",
            }}
          >
            {leitor(selEntrada)}
          </div>
        </div>
      ) : null}

      {aba === "enviados" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 20 }}>
          {lista(
            enviados,
            selEnviado,
            setSelEnviado,
            (m) => m.to_emails.join(", "),
            (m) => m.subject || "(sem assunto)"
          )}
          <div
            style={{
              background: "var(--bg-cloud)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              padding: 24,
              boxShadow: "var(--shadow-card)",
            }}
          >
            {leitor(selEnviado)}
          </div>
        </div>
      ) : null}

      {aba === "compor" ? (
        <div
          style={{
            background: "var(--bg-cloud)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: 24,
            boxShadow: "var(--shadow-card)",
            maxWidth: 720,
          }}
        >
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Para
            <input
              aria-label="Destinatário"
              type="email"
              value={form.destinatario}
              onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
              style={INPUT}
            />
          </label>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, margin: "14px 0 6px" }}>
            Assunto
            <input
              aria-label="Assunto"
              value={form.assunto}
              onChange={(e) => setForm({ ...form, assunto: e.target.value })}
              style={INPUT}
            />
          </label>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, margin: "14px 0 6px" }}>
            Mensagem (HTML)
            <textarea
              aria-label="Mensagem"
              value={form.html}
              onChange={(e) => setForm({ ...form, html: e.target.value })}
              rows={10}
              style={{ ...INPUT, resize: "vertical" }}
            />
          </label>
          <button
            style={{ ...BOTAO, marginTop: 14 }}
            onClick={() => {
              void (async () => {
                const r = await enviarManual({
                  destinatario: form.destinatario,
                  assunto: form.assunto,
                  html: form.html,
                });
                setFb({ msg: r.ok ? "Mensagem enviada." : r.erro, ok: r.ok });
                if (r.ok) setForm({ destinatario: "", assunto: "", html: "" });
              })();
            }}
          >
            Enviar
          </button>
        </div>
      ) : null}
    </main>
  );
}
