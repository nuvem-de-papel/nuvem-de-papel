/* eslint-disable @next/next/no-img-element */
"use client";

import { Fragment, useRef, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/admin/PageHeader";

// Catálogo administrativo (painel). Mesma estrutura da Logística: busca e
// filtros no topo, tabela de largura total, Tabela/Grade, "Novo produto",
// "Ver imagem". Cores neutras; cor só para indicadores (sob consulta = verde,
// oferta = amarelo). Menu lateral fica no AdminShell (não mexer aqui).

export type ItemCatalogoAdmin = {
  id: string;
  sku: string;
  nome: string;
  categoria: string | null;
  ativo: boolean;
  grupoPai: string | null;
  emOferta: boolean;
  emDestaque: boolean;
  foto: string | null;
  minimo: number;
  fisico: number | null;
  disponivel: number | null;
  venda: number | null;
};

type Situacao = "todas" | "consulta" | "saldo" | "oferta" | "destaque" | "inativos";
type Grade = "todos" | "grade" | "unico";
type Visao = "tabela" | "grade";

const CADASTRO_NOVO = "/configuracoes/cadastro?tela=produto";

function cadastroDe(sku: string) {
  return `/configuracoes/cadastro?tela=produto&sku=${encodeURIComponent(sku)}`;
}

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function qtd(v: number | null) {
  return v === null ? "—" : new Intl.NumberFormat("pt-BR").format(v);
}

// Disponível <= 0 com controle de estoque = sob consulta (mesma regra da vitrine).
function sobConsulta(i: ItemCatalogoAdmin) {
  return i.disponivel !== null && i.disponivel <= 0;
}

// Grade: principal tem grupoPai = próprio SKU; variantes apontam para o principal.
function ehVariante(i: ItemCatalogoAdmin, porSku: Map<string, ItemCatalogoAdmin>) {
  return !!i.grupoPai && i.grupoPai !== i.sku && porSku.has(i.grupoPai);
}

const CORES_INDICADOR = {
  consulta: { bg: "#E3F2EA", fg: "#1E7B4B", borda: "transparent" },
  oferta: { bg: "#FFF1BF", fg: "#8A6400", borda: "transparent" },
  neutra: { bg: "#FFFFFF", fg: "#111111", borda: "#BDBDBD" },
};

function Etiqueta({ children, tipo = "neutra" }: { children: string; tipo?: "consulta" | "oferta" | "neutra" }) {
  const cor = CORES_INDICADOR[tipo];
  return (
    <span
      style={{
        display: "inline-block",
        marginRight: 4,
        padding: "1px 7px",
        borderRadius: 3,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        background: cor.bg,
        color: cor.fg,
        border: `1px solid ${cor.borda}`,
      }}
    >
      {children}
    </span>
  );
}

const botao: CSSProperties = {
  height: 32,
  padding: "0 14px",
  border: "1px solid #8C8C8C",
  borderRadius: 4,
  background: "#FFFFFF",
  color: "#111111",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
};

const botaoPreto: CSSProperties = { ...botao, background: "#111111", borderColor: "#111111", color: "#FFFFFF", fontWeight: 700 };

const botaoLinha: CSSProperties = { ...botao, height: 26, padding: "0 10px", fontSize: 12 };

const campo: CSSProperties = {
  height: 32,
  border: "1px solid #8C8C8C",
  borderRadius: 4,
  background: "#FFFFFF",
  color: "#111111",
  padding: "0 8px",
  fontSize: 13,
  minWidth: 0,
};

const rotulo: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "#555555" };

const celula: CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #E5E5E5", verticalAlign: "middle", color: "#111111" };
const celulaNum: CSSProperties = { ...celula, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const cabeca: CSSProperties = {
  background: "#F3F3F3",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "#111111",
  padding: "8px 10px",
  borderBottom: "1px solid #A8A8A8",
  whiteSpace: "nowrap",
};
const cabecaNum: CSSProperties = { ...cabeca, textAlign: "right" };

function LinhaProduto({
  item,
  filha = false,
  qtdFilhas = 0,
  aberta = false,
  onAlternar,
  onImagem,
}: {
  item: ItemCatalogoAdmin;
  filha?: boolean;
  qtdFilhas?: number;
  aberta?: boolean;
  onAlternar?: () => void;
  onImagem: (i: ItemCatalogoAdmin) => void;
}) {
  return (
    <tr style={filha ? { background: "#FAFAFA" } : undefined}>
      <td style={{ ...celula, fontWeight: 700, whiteSpace: "nowrap" }}>
        {qtdFilhas > 0 && onAlternar ? (
          <button
            type="button"
            aria-expanded={aberta}
            aria-label={`Expandir grade ${item.sku}`}
            onClick={onAlternar}
            style={{ border: 0, background: "none", cursor: "pointer", padding: "0 6px 0 0", fontSize: 13, color: "#111111" }}
          >
            {aberta ? "▾" : "▸"}
          </button>
        ) : null}
        {item.sku}
      </td>
      <td style={{ ...celula, paddingLeft: filha ? 28 : 10, color: filha ? "#6B6B6B" : "#111111" }}>
        {item.nome}
        {qtdFilhas > 0 ? <Etiqueta>{`grade · ${qtdFilhas + 1}`}</Etiqueta> : null}
      </td>
      <td style={celula}>{item.categoria ?? "—"}</td>
      <td style={celulaNum}>{qtd(item.minimo)}</td>
      <td style={celulaNum}>{qtd(item.fisico)}</td>
      <td style={celulaNum}>{qtd(item.disponivel)}</td>
      <td style={celulaNum}>{item.venda === null ? "—" : brl(item.venda)}</td>
      <td style={{ ...celula, whiteSpace: "nowrap" }}>
        {sobConsulta(item) ? <Etiqueta tipo="consulta">Sob consulta</Etiqueta> : null}
        {item.emOferta ? <Etiqueta tipo="oferta">Oferta</Etiqueta> : null}
        {item.emDestaque ? <Etiqueta>Destaque</Etiqueta> : null}
        {!item.ativo ? <Etiqueta>Inativo</Etiqueta> : null}
      </td>
      <td style={celula}>
        <div style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
          <button type="button" style={botaoLinha} onClick={() => onImagem(item)}>
            Ver imagem
          </button>
          <a href={cadastroDe(item.sku)} style={botaoLinha}>
            Cadastro
          </a>
        </div>
      </td>
    </tr>
  );
}

export function CatalogoAdmin({ itens }: { itens: ItemCatalogoAdmin[] }) {
  const [visao, setVisao] = useState<Visao>("tabela");
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("todos");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [grade, setGrade] = useState<Grade>("todos");
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const [imagem, setImagem] = useState<ItemCatalogoAdmin | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  const porSku = new Map(itens.map((i) => [i.sku, i] as const));
  const filhasDe = new Map<string, ItemCatalogoAdmin[]>();
  for (const i of itens) {
    if (!ehVariante(i, porSku)) continue;
    const pai = i.grupoPai as string;
    const lista = filhasDe.get(pai) ?? [];
    lista.push(i);
    filhasDe.set(pai, lista);
  }

  const setores = [...new Set(itens.map((i) => i.categoria ?? "Sem setor"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const ativos = itens.filter((i) => i.ativo).length;

  const termo = semAcento(busca.trim());
  const filtrando = termo !== "" || setor !== "todos" || situacao !== "todas" || grade !== "todos";

  function passa(i: ItemCatalogoAdmin): boolean {
    if (termo && !(semAcento(i.sku).includes(termo) || semAcento(i.nome).includes(termo))) return false;
    if (setor !== "todos" && (i.categoria ?? "Sem setor") !== setor) return false;
    if (situacao === "consulta" && !sobConsulta(i)) return false;
    if (situacao === "saldo" && sobConsulta(i)) return false;
    if (situacao === "oferta" && !i.emOferta) return false;
    if (situacao === "destaque" && !i.emDestaque) return false;
    if (situacao === "inativos" && i.ativo) return false;
    const emGrade = filhasDe.has(i.sku) || ehVariante(i, porSku);
    if (grade === "grade" && !emGrade) return false;
    if (grade === "unico" && emGrade) return false;
    return true;
  }

  // Linhas de topo (principais e produtos únicos). Variantes aparecem sob o principal.
  const linhas = itens
    .filter((pai) => !ehVariante(pai, porSku))
    .map((pai) => {
      const todas = filhasDe.get(pai.sku) ?? [];
      const visiveis = filtrando ? todas.filter(passa) : todas;
      return { pai, todas, visiveis, mostra: passa(pai) || visiveis.length > 0 };
    })
    .filter((l) => l.mostra);

  const estaAberta = (sku: string) => filtrando || abertas.has(sku);

  function alternar(sku: string) {
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(sku)) nova.delete(sku);
      else nova.add(sku);
      return nova;
    });
  }

  function abrirImagem(i: ItemCatalogoAdmin) {
    setImagem(i);
    dialogo.current?.showModal();
  }

  function limpar() {
    setBusca("");
    setSetor("todos");
    setSituacao("todas");
    setGrade("todos");
  }

  return (
    <div style={{ width: "100%", boxSizing: "border-box", padding: "26px 24px 60px" }}>
      <PageHeader
        titulo="Catálogo"
        subtitulo={`${qtd(ativos)} ativos · ${qtd(itens.length)} cadastrados`}
        voltarPara="/crm"
      />

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <div role="group" aria-label="Visualização" style={{ display: "inline-flex", border: "1px solid #8C8C8C", borderRadius: 4, overflow: "hidden" }}>
          {(["tabela", "grade"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visao === v}
              onClick={() => setVisao(v)}
              style={{
                height: 32,
                padding: "0 14px",
                border: 0,
                background: visao === v ? "#111111" : "#FFFFFF",
                color: visao === v ? "#FFFFFF" : "#111111",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {v === "tabela" ? "Tabela" : "Grade"}
            </button>
          ))}
        </div>
        <a href={CADASTRO_NOVO} style={botaoPreto}>
          Novo produto
        </a>
      </div>

      <div
        role="search"
        style={{
          marginTop: 12,
          background: "#F3F3F3",
          border: "1px solid #D9D9D9",
          borderRadius: 4,
          padding: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <label style={{ ...rotulo, flex: "1 1 260px" }}>
          Buscar (SKU ou nome)
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: BLT38 ou post-it"
            aria-label="Buscar por SKU ou nome"
            style={{ ...campo, width: "100%" }}
          />
        </label>
        <label style={{ ...rotulo, flex: "0 1 200px" }}>
          Setor
          <select value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Setor" style={campo}>
            <option value="todos">Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...rotulo, flex: "0 1 200px" }}>
          Situação
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} aria-label="Situação" style={campo}>
            <option value="todas">Todas</option>
            <option value="consulta">Sob consulta (sem saldo)</option>
            <option value="saldo">Com saldo</option>
            <option value="oferta">Oferta</option>
            <option value="destaque">Destaque</option>
            <option value="inativos">Inativos</option>
          </select>
        </label>
        <label style={{ ...rotulo, flex: "0 1 160px" }}>
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)} aria-label="Grade" style={campo}>
            <option value="todos">Todos</option>
            <option value="grade">Só grades</option>
            <option value="unico">Só produtos únicos</option>
          </select>
        </label>
        <button type="button" onClick={limpar} style={botao}>
          Limpar
        </button>
      </div>

      {visao === "tabela" ? (
        <div style={{ marginTop: 12, background: "#FFFFFF", border: "1px solid #D9D9D9", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={cabeca}>SKU</th>
                <th style={cabeca}>Produto</th>
                <th style={cabeca}>Setor</th>
                <th style={cabecaNum}>Mínimo</th>
                <th style={cabecaNum}>Físico</th>
                <th style={cabecaNum}>Disponível</th>
                <th style={cabecaNum}>Venda</th>
                <th style={cabeca}>Situação</th>
                <th style={cabeca}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...celula, textAlign: "center", color: "#6B6B6B", padding: 24 }}>
                    Nenhum produto com esses filtros.
                  </td>
                </tr>
              ) : null}
              {linhas.map(({ pai, todas, visiveis }) => (
                <Fragment key={pai.id}>
                  <LinhaProduto
                    item={pai}
                    qtdFilhas={todas.length}
                    aberta={estaAberta(pai.sku)}
                    onAlternar={() => alternar(pai.sku)}
                    onImagem={abrirImagem}
                  />
                  {estaAberta(pai.sku)
                    ? visiveis.map((f) => <LinhaProduto key={f.id} item={f} filha onImagem={abrirImagem} />)
                    : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {linhas.length === 0 ? <div style={{ color: "#6B6B6B", fontSize: 13 }}>Nenhum produto com esses filtros.</div> : null}
          {linhas.map(({ pai, todas }) => (
            <div key={pai.id} style={{ background: "#FFFFFF", border: "1px solid #D9D9D9", padding: 10, display: "grid", gap: 6 }}>
              <div style={{ aspectRatio: "1 / 1", background: "#F3F3F3", border: "1px dashed #A8A8A8", display: "grid", placeItems: "center", color: "#6B6B6B", fontSize: 12 }}>
                {pai.foto ? <img src={pai.foto} alt={pai.nome} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : "Sem foto"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{pai.nome}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{pai.sku}</span>
                <span>{pai.venda === null ? "—" : brl(pai.venda)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555555" }}>
                <span>Físico {qtd(pai.fisico)}</span>
                <span>Disp. {qtd(pai.disponivel)}</span>
              </div>
              <div>
                {sobConsulta(pai) ? <Etiqueta tipo="consulta">Sob consulta</Etiqueta> : null}
                {pai.emOferta ? <Etiqueta tipo="oferta">Oferta</Etiqueta> : null}
                {todas.length > 0 ? <Etiqueta>{`grade · ${todas.length + 1}`}</Etiqueta> : null}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" style={botaoLinha} onClick={() => abrirImagem(pai)}>
                  Ver imagem
                </button>
                <a href={cadastroDe(pai.sku)} style={botaoLinha}>
                  Cadastro
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <dialog
        ref={dialogo}
        onClose={() => setImagem(null)}
        aria-labelledby="catalogo-imagem-titulo"
        style={{ border: "1px solid #8C8C8C", borderRadius: 4, padding: 0, width: "min(560px, calc(100% - 32px))", background: "#FFFFFF", color: "#111111" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #D9D9D9" }}>
          <strong id="catalogo-imagem-titulo" style={{ fontSize: 14 }}>
            {imagem ? `${imagem.sku} — ${imagem.nome}` : ""}
          </strong>
          <button type="button" onClick={() => dialogo.current?.close()} style={botao}>
            Fechar
          </button>
        </div>
        <div style={{ padding: 14, display: "grid", placeItems: "center", minHeight: 280, background: "#F3F3F3" }}>
          {imagem?.foto ? (
            <img src={imagem.foto} alt={imagem.nome} style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "#6B6B6B", fontSize: 13 }}>Sem foto cadastrada.</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px", borderTop: "1px solid #D9D9D9" }}>
          {imagem ? (
            <a href={cadastroDe(imagem.sku)} style={botaoPreto}>
              Abrir cadastro
            </a>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
