"use client";

// Console Exportar/Importar Dados (Configurações).
//   * Exportar: baixa um CSV dos produtos cadastrados (via server action).
//   * Importar: recebe um arquivo (CSV/XML) de fornecedor e mostra o resumo do
//     que foi lido. A rotina de importação de XML será implementada por etapas
//     (cada tipo de arquivo = uma rotina nova), por isso o painel já abre com
//     o seletor de arquivo e a área de resumo prontos.
// O importador por LINK do Reval continua oculto no cadastro de produto —
// este painel é pra arquivos em lote, não pra link de produto avulso.

import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { exportarProdutosCsv } from "@/app/configuracoes/importar/actions";

type Resumo = {
  nomeArquivo: string;
  tamanhoKb: string;
  tipo: string;
  linhas: number;
  aviso: string;
};

function cardStyle(): React.CSSProperties {
  return {
    background: "var(--bg-cloud)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-card)",
    padding: 24,
    boxShadow: "var(--shadow-card)",
    marginBottom: 20,
  };
}

function tituloCard(t: string, d: string): React.ReactNode {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{t}</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 16px" }}>{d}</p>
    </>
  );
}

const btnPrimario: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "var(--green-600, #2C9C48)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export function ConsoleImportar() {
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  async function baixarCsv() {
    setExportando(true);
    setErroExport(null);
    try {
      const r = await exportarProdutosCsv();
      if (!r.ok || !r.csv) {
        setErroExport(r.erro ?? "Falha ao gerar o CSV.");
        return;
      }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.arquivo ?? "produtos.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  function aoEscolherArquivo(f: File | undefined) {
    if (!f) {
      setResumo(null);
      return;
    }
    const linhasEstimadas = Math.max(1, Math.round(f.size / 120));
    setResumo({
      nomeArquivo: f.name,
      tamanhoKb: (f.size / 1024).toFixed(1),
      tipo: f.type || "desconhecido",
      linhas: linhasEstimadas,
      aviso:
        "Arquivo lido. A rotina de importação para este formato ainda será implementada — por enquanto nada foi gravado no banco.",
    });
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 32px 72px" }}>
      <PageHeader
        titulo="Exportar/Importar Dados"
        subtitulo="Exporte os dados em CSV e importe arquivos de fornecedores (XML/CSV) em lote."
        voltarPara="/configuracoes/cadastro"
      />

      <div style={cardStyle()}>
        {tituloCard("Exportar dados", "Baixa um arquivo CSV com os produtos cadastrados (SKU, nome, GTIN, NCM, preço).")}
        <button type="button" style={btnPrimario} onClick={baixarCsv} disabled={exportando}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v10" /><path d="m8 9 4 4 4-4" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
          {exportando ? "Gerando…" : "Exportar produtos (CSV)"}
        </button>
        {erroExport && (
          <p style={{ color: "var(--red-600, #E01F27)", fontSize: 13, marginTop: 12 }}>{erroExport}</p>
        )}
      </div>

      <div style={cardStyle()}>
        {tituloCard("Importar arquivo de fornecedor", "Escolha um XML ou CSV. Cada formato terá sua rotina de importação.")}
        <input
          type="file"
          accept=".xml,.csv,text/xml,text/csv"
          onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
          style={{ fontSize: 14, fontFamily: "'Open Sans', sans-serif" }}
        />

        {resumo && (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg-cotton)",
            }}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{resumo.nomeArquivo}</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
              {resumo.tamanhoKb} KB · {resumo.tipo} · ~{resumo.linhas} linhas
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{resumo.aviso}</p>
          </div>
        )}
      </div>
    </main>
  );
}
