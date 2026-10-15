"use client";

// Monta o PDF dos relatórios do cadastro de produtos (botão Relatório).
// jsPDF + autoTable entram POR IMPORT DINÂMICO — só pesam no bundle quando o
// usuário clica, não no carregamento da tela de cadastro.

import type { RelatorioDados } from "@/app/configuracoes/importar/actions";

type AutoTableOpts = Record<string, unknown>;

// larguras por relatório (A4 paisagem = 842pt − margens 2×28 = 786 úteis).
// Sem isto o autoTable estica coluna estreita e encolhe "Produto" até ilegível.
const LARGURAS: Record<string, (number | "auto")[]> = {
  // data, sku, produto, tipo, qtd, ref, obs
  entradas: [92, 78, 210, 62, 44, 70, 230],
  saidas: [92, 78, 210, 62, 44, 70, 230],
  // sku, produto, setor, ativo, disponível, físico, atualizado
  estoque: [80, 220, 110, 44, 74, 60, 198],
  // sku, produto, qtd física, custo, valor
  patrimonio: [90, 330, 100, 120, 146],
  // sku, produto, setor, qtd sistema, contagem, diferença (colunas em branco)
  inventario: [90, 250, 130, 100, 110, 106],
};

export async function gerarRelatorioPdf(
  dados: RelatorioDados,
  tipo: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!dados.ok || !dados.colunas || !dados.arquivo) {
    return { ok: false, erro: dados.erro ?? "Relatório sem dados." };
  }

  try {
    const [{ jsPDF }, { autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    // paisagem: 7 colunas (entradas/saídas/estoque) cabem sem apertar Produto
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const largura = doc.internal.pageSize.getWidth();
    const margem = 28;

    // ---- cabeçalho ---------------------------------------------------------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(26, 26, 26);
    doc.text(dados.titulo ?? "Relatório", margem, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    if (dados.subtitulo) doc.text(dados.subtitulo, margem, 56);
    doc.text(`Nuvem de Papel · emitido em ${new Date().toLocaleString("pt-BR")}`, margem, 68);

    // linha de separação
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.7);
    doc.line(margem, 76, largura - margem, 76);

    // ---- tabela ------------------------------------------------------------
    const opts: AutoTableOpts = {
      startY: 88,
      margin: { top: 88, right: margem, bottom: 42, left: margem },
      head: [dados.colunas],
      body: dados.linhas ?? [],
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 4,
        textColor: [40, 40, 40],
        lineColor: [224, 224, 224],
        lineWidth: 0.3,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [42, 62, 84],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [246, 246, 246] },
      columnStyles: Object.fromEntries(
        (LARGURAS[tipo] ?? []).map((w, i) => [i, { cellWidth: w }])
      ),
    };

    // linha de resumo (TOTAL) em negrito, se o relatório trouxe
    if (dados.resumo) {
      opts.foot = [dados.resumo];
      opts.footStyles = { fillColor: [232, 236, 240], textColor: [26, 26, 26], fontStyle: "bold" };
    }

    autoTable(doc, opts);

    // o rodapé precisa ser reescrito depois (só então sabemos o total de páginas)
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Página ${p} de ${total}`,
        largura - margem,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" }
      );
    }

    doc.save(`${dados.arquivo}.pdf`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: `Falha ao montar o PDF: ${e instanceof Error ? e.message : String(e)}` };
  }
}
