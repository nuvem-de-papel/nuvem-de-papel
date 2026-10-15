"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarFornecedor } from "@/app/compras/actions";
import { alternarStatus } from "@/app/configuracoes/usuarios/actions";
import {
  importarProdutoFornecedor,
  removerCliente,
  salvarCliente,
  salvarEmpresa,
  salvarProduto,
  type ClienteInput,
  type EmpresaInput,
  type ProdutoInput,
} from "@/app/configuracoes/cadastro/actions";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const SETORES_INICIAIS = ["Cadernos", "Canetas", "Adesivos", "Papelaria", "Escrita"];
const FORNECEDORES_INICIAIS = ["Papelaria Central Ltda", "Distribuidora Papel & Arte", "Gráfica São José"];

const GTIN_DB: Record<string, Record<string, string>> = {
  "7898943477996": {
    descricao: "CADERNO ESPIRAL 96 FOLHAS COLUNA FINA",
    ncm: "48201000", csosn: "102", cest: "", icms: "18,00%", base: "100,00%",
    ipi: "0,00%", cstpis: "49", cstcofins: "49", pesobruto: "0,320", pesoliquido: "0,300",
  },
  "7891000100103": {
    descricao: "CANETA ESFEROGRÁFICA AZUL 0,7mm",
    ncm: "96081000", csosn: "102", cest: "", icms: "18,00%", base: "100,00%",
    ipi: "0,00%", cstpis: "49", cstcofins: "49", pesobruto: "0,020", pesoliquido: "0,018",
  },
};

const somenteDigitos = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

function mascaraTelefone(v: string) {
  const d = somenteDigitos(v, 11);
  if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
  if (d.length > 5) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
  if (d.length > 2) return d.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  return d;
}

function mascaraCep(v: string) {
  const d = somenteDigitos(v, 8);
  return d.length > 5 ? d.replace(/(\d{5})(\d{0,3})/, "$1-$2") : d;
}

function mascaraDoc(v: string) {
  const d = somenteDigitos(v, 14);
  if (d.length > 11) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})(\d{0,2})/, "$1.$2.$3/$4-$5").replace(/[./-]+$/, "");
  return d.replace(/(\d{3})(\d{3})(\d{0,3})(\d{0,2})/, "$1.$2.$3-$4").replace(/[.-]+$/, "");
}

function cpfValido(d: string) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10]);
}

function cnpjValido(d: string) {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let w = len - 7, s = 0;
    for (let i = 0; i < len; i++) {
      s += parseInt(d[i]) * w;
      w--;
      if (w < 2) w = 9;
    }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
}

function verificarDoc(el: HTMLElement) {
  const field = el.closest(".ct-field");
  if (!field) return;
  const msg = field.querySelector(".ct-doc-msg");
  const input = field.querySelector("input") as HTMLInputElement | null;
  if (!input) return;
  const digitos = input.value.replace(/\D/g, "");
  field.classList.remove("ct-doc-ok", "ct-doc-bad");
  if (msg) msg.textContent = "";
  if (!digitos) return;
  const ok = digitos.length === 11 ? cpfValido(digitos) : digitos.length === 14 ? cnpjValido(digitos) : false;
  field.classList.add(ok ? "ct-doc-ok" : "ct-doc-bad");
  if (msg) msg.textContent = ok ? "Documento válido" : "Dígito verificador não confere";
}

async function buscarCep(cep: string) {
  const limpo = cep.replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

const css = String.raw`
.ct-screen{max-width:1240px;margin:20px auto 60px;padding:0 24px}
.ct-window{background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-soft);overflow:hidden}
.ct-header{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;padding:10px 22px;border-bottom:1px solid var(--border);background:var(--bg-cotton);overflow-x:auto}
.ct-h-title{display:flex;flex-direction:column;flex-shrink:0;padding-right:12px;border-right:1px solid var(--border);margin-right:2px}
.ct-h-title .eyebrow{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--pink-600);font-weight:700}
.ct-h-title h1{font-size:.98rem;margin:0;white-space:nowrap;color:var(--ink)}
.ct-menu{display:flex;gap:2px;flex-shrink:0;padding-right:10px;border-right:1px solid var(--border);margin-right:2px}
.ct-menu-btn{padding:7px 10px;border-radius:6px;border:none;background:transparent;color:var(--ink-soft);font-size:.78rem;font-weight:600;cursor:pointer;white-space:nowrap}
.ct-menu-btn:hover{background:var(--ink-faint)}
.ct-act{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
.ct-act:hover{border-color:var(--pink-600);color:var(--pink-600)}
.ct-act svg{flex-shrink:0}
.ct-act.primary{background:var(--pink-600);color:#fff;border-color:var(--pink-600)}
.ct-act.primary:hover{background:var(--pink-600-dark);border-color:var(--pink-600-dark);color:#fff}
.ct-act.danger{color:#E01F27;border-color:transparent}
.ct-act.danger:hover{background:rgba(224,31,39,.08);border-color:#E01F27;color:#E01F27}
.ct-spacer{flex:1;min-width:12px}
.ct-nav-prod{display:inline-flex;gap:3px;flex-shrink:0}
.ct-nav-prod .ct-act{padding:7px 8px}
.ct-pill{font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;font-weight:700;padding:3px 10px;border-radius:999px;background:#fff;color:var(--ink-soft);border:1px solid var(--border);white-space:nowrap;flex-shrink:0}
.ct-pill.ok{background:rgba(44,156,72,.12);color:#2C9C48;border-color:transparent}
.ct-pill.strong{background:var(--navy);color:#fff;border-color:var(--navy)}
.ct-counters{display:flex;margin-bottom:14px;border:1px solid var(--border);border-radius:6px;overflow:hidden;width:fit-content;max-width:100%}
.ct-counters>div{padding:7px 16px;font-size:.78rem;border-right:1px solid var(--border);white-space:nowrap}
.ct-counters>div:last-child{border-right:none}
.ct-counters .k{color:var(--ink-soft);margin-right:5px}
.ct-counters .code{background:var(--bg-cotton);font-weight:700}
.ct-counters .ativ b{color:#2C9C48}
.ct-counters .inat b{color:#E01F27}
.ct-grid{display:grid;grid-template-columns:1.6fr 1fr}
.ct-grid.ct-eq{grid-template-columns:1fr 1fr}
.ct-main{padding:18px 22px;border-right:1px solid var(--border)}
.ct-side{padding:18px 22px;background:var(--bg-cotton);display:flex;flex-direction:column;gap:16px}
.ct-grp{margin-bottom:16px}
.ct-grp-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);font-weight:700;margin:0 0 10px}
.ct-row{display:grid;gap:12px;margin-bottom:10px}
.ct-r1{grid-template-columns:1fr}
.ct-r2{grid-template-columns:1fr 1fr}
.ct-r3{grid-template-columns:1fr 1fr 1fr}
.ct-r4{grid-template-columns:1fr 1fr 1fr 1fr}
/* linha de identificacao do produto: Fornecedor mais largo, Unidade pela metade */
.ct-r4-forn{grid-template-columns:1fr 1.5fr 1fr .5fr}
.ct-r-2-1{grid-template-columns:2fr 1fr}
.ct-r-1-2{grid-template-columns:1fr 2fr}
.ct-field label{display:block;font-size:.74rem;color:var(--ink-soft);margin-bottom:4px;font-weight:600}
.ct-field input,.ct-field select,.ct-field textarea{width:100%;padding:8px 10px;border-radius:6px;border:1.5px solid var(--navy);background:#fff;color:var(--ink);font-size:.86rem;font-family:inherit;box-sizing:border-box}
.ct-field input:focus,.ct-field select:focus,.ct-field textarea:focus{outline:2px solid var(--pink-600);outline-offset:1px;border-color:var(--pink-600)}
.ct-field textarea{resize:vertical;min-height:56px}
.ct-doc-msg{font-size:.68rem;margin-top:3px;min-height:12px}
.ct-field.ct-doc-ok input{border-color:#2C9C48}
.ct-field.ct-doc-ok .ct-doc-msg{color:#2C9C48}
.ct-field.ct-doc-bad input{border-color:#E01F27}
.ct-field.ct-doc-bad .ct-doc-msg{color:#E01F27}
.ct-field.ct-doc-warn input{border-color:#F6851F}
.ct-field.ct-doc-warn .ct-doc-msg{color:#a85d13}
.ct-radio-group{display:flex;align-items:center;gap:14px;padding:9px 12px;border:1.5px solid var(--border);border-radius:6px;background:#fff;flex-wrap:wrap}
.ct-radio-group .rg-label{font-size:.74rem;color:var(--ink-soft);font-weight:600;margin-right:4px}
.ct-radio-opt{display:flex;align-items:center;gap:5px;font-size:.82rem;color:var(--ink)}
.ct-checkline{display:flex;align-items:center;gap:7px;font-size:.82rem;color:var(--ink)}
.ct-ac{position:relative}
.ct-ac-list{position:absolute;top:100%;left:0;right:0;margin:2px 0 0;padding:4px;list-style:none;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-soft);max-height:170px;overflow-y:auto;display:none;z-index:30}
.ct-ac-list.on{display:block}
.ct-ac-list li{padding:7px 10px;font-size:.82rem;border-radius:5px;cursor:pointer;color:var(--ink)}
.ct-ac-list li:hover{background:var(--bg-cotton)}
.ct-ac-list li.ct-ac-new{border-top:1px solid var(--border);margin-top:3px;padding-top:9px;cursor:default}
.ct-ac-list li.ct-ac-new:hover{background:transparent}
.ct-ac-new-btn{width:100%;padding:8px 10px;border-radius:6px;border:1.5px solid var(--pink-600);background:#fff;color:var(--pink-600);font-weight:700;font-size:.82rem;cursor:pointer}
.ct-ac-new-btn:hover{background:var(--pink-600);color:#fff}
.ct-ac-list li.ct-ac-empty{color:var(--ink-soft);cursor:default}
.ct-ac-list li.ct-ac-empty:hover{background:transparent}
.ct-fiscal{border:1.5px dashed rgba(246,133,31,.55);border-radius:6px;padding:14px 16px;background:rgba(246,133,31,.05)}
.ct-fiscal .ct-grp-label{color:#a85d13}
.ct-photo{width:100%;aspect-ratio:4/3;border:1.5px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--ink-soft);background:#fff;flex-direction:column;gap:8px;font-size:.78rem}
.ct-side-tabs{border:1px solid var(--border);border-radius:6px;background:#fff;overflow:hidden}
.ct-extra-tabs{display:flex;gap:2px;padding:6px 8px 0;background:var(--bg-cotton);flex-wrap:wrap}
.ct-extra-tab{padding:7px 10px;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--ink-soft);font-size:.74rem;font-weight:700;cursor:pointer;border-radius:5px 5px 0 0;white-space:nowrap}
.ct-extra-tab.on{color:var(--navy);border-bottom-color:var(--cta);background:#fff}
.ct-extra-panel{display:none;padding:12px}
.ct-extra-panel.on{display:block}
.ct-side-tabs .ct-row{gap:8px}
.ct-side-tabs .ct-field label{font-size:.7rem}
.ct-status{display:flex;align-items:center;justify-content:flex-end;padding:9px 22px;background:var(--navy);color:#c7d2e0;font-size:.76rem}
.ct-req{color:#E01F27;margin-left:2px}
.ct-hint{font-size:.7rem;color:var(--ink-soft);font-weight:400}
.ct-overlay{position:fixed;inset:0;background:rgba(10,20,30,.5);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.ct-modal{width:420px;max-width:92vw;background:#fff;border-radius:12px;box-shadow:0 24px 60px rgba(10,31,51,.28);overflow:hidden;max-height:92vh;overflow-y:auto}
.ct-modal-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.ct-modal-head h2{font-size:1rem;margin:0;color:var(--ink)}
.ct-modal-close{border:none;background:transparent;color:var(--ink-soft);font-size:1.1rem;cursor:pointer;line-height:1}
.ct-modal-body{padding:18px 20px}
.ct-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--border);background:var(--bg-cotton)}
.ct-modal .ct-checkline{margin:10px 0}
.ct-lookup-note{font-size:.72rem;color:var(--ink-soft);margin:6px 0 0}
.ct-addr-box{display:none}
.ct-addr-box.on{display:block}
@media (max-width:920px){
  .ct-grid,.ct-grid.ct-eq{grid-template-columns:1fr}
  .ct-main{border-right:none;border-bottom:1px solid var(--border)}
  .ct-r3,.ct-r4,.ct-r4-forn{grid-template-columns:1fr 1fr}
  .ct-r-2-1,.ct-r-1-2{grid-template-columns:1fr}
}
@media (max-width:560px){
  .ct-r2,.ct-r3,.ct-r4,.ct-r4-forn{grid-template-columns:1fr}
  .ct-screen{padding:0 12px}
}
/* telas de fornecedor e revenda (sub-itens do menu lateral) */
.ct-act{text-decoration:none}
.ct-sec{padding:18px 22px}
.ct-sec+.ct-sec{border-top:1px solid var(--border)}
.ct-sec-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}
.ct-sec-title h2{font-size:.95rem;margin:0;color:var(--ink)}
.ct-tbl{width:100%;border-collapse:collapse;font-size:.84rem}
.ct-tbl th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);padding:8px 10px;border-bottom:1px solid var(--border);font-weight:700}
.ct-tbl td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--ink);vertical-align:middle}
.ct-tbl tr:last-child td{border-bottom:none}
.ct-empty{color:var(--ink-soft);font-size:.84rem;padding:14px 10px;margin:0}
.ct-actions{display:flex;gap:8px;justify-content:flex-end}
.ct-feed{font-size:.8rem;margin:12px 0 0;padding:8px 12px;border-radius:8px}
.ct-feed.ok{background:rgba(44,156,72,.1);color:#2C9C48}
.ct-feed.err{background:rgba(224,31,39,.08);color:#E01F27}
.ct-feed-topo{margin:12px 22px 0}
.ct-pill.bad{background:rgba(224,31,39,.1);color:#E01F27;border-color:transparent}
.ct-pill.wait{background:rgba(246,133,31,.12);color:#a85d13;border-color:transparent}
`;

export type FornecedorCad = {
  id: string;
  nome: string;
  contato: string | null;
  cnpj: string | null;
  ativo: boolean;
};

export type RevendaCad = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
};

// F8.1: empresa emitente e produto passaram a persistir (antes eram
// formulários de exemplo); a page de /configuracoes/cadastro busca no
// banco e entrega por props.
export type EmpresaCad = {
  razaoSocial: string;
  fantasia: string;
  cnpj: string;
  ie: string;
  im: string;
  regime: string;
  email: string;
  telefone: string;
  cep: string;
  uf: string;
  cidade: string;
  logradouro: string;
  numero: string;
  bairro: string;
  complemento: string;
  site: string;
  ambiente: string;
  serieNfe: string;
  serieNfce: string;
  cfopPadrao: string;
  pedirDocumento: boolean;
};

export type ProdutoCad = {
  id: string;
  sku: string;
  nome: string;
  categoria: string;
  ativo: boolean;
  gtin: string;
  ncm: string;
  csosn: string;
  cest: string;
  origem: string;
  unit: string;
  icmsPct: number;
  ipiPct: number;
  pesoLiquido: number;
  pesoBruto: number;
  precoCusto: number;
  precoVenda: number;
  minStock: number;
  margemPct: number;
  // Bloco 2 (0031): campos que antes eram "fantasma" no form - agora gravam.
  fabricante: string;
  observacoes: string;
  cstPis: string;
  cstCofins: string;
  icmsBasePct: number;
  cstIbsCbs: string;
  cclassTrib: string;
  gtinTributavel: string;
  // Bloco 2 (0031): ficha do fornecedor + embalagem (item_supplier_data).
  fornecedorNome: string;
  supplierSku: string;
  refFabricante: string;
  packQty: number;
  masterQty: number;
  gtinInner: string;
  gtinMaster: string;
  embComprimento: number;
  embAltura: number;
  embLargura: number;
  embPeso: number;
  masterComprimento: number;
  masterAltura: number;
  masterLargura: number;
  masterPeso: number;
  sourceUrl: string;
  hidePriceTable: boolean;
  lastAdjustedAt: string;
  // 0032: foto do produto (URL servida pelo fornecedor, ex. Reval /imagem/...)
  fotoUrl: string;
};

// Bloco 5 passo 3: cliente vem do banco (customers) em vez de ficha fixa.
// 0029: ficha completa - contato, endereco e situacao comercial.
export type ClienteCad = {
  id: string;
  nome: string;
  email: string;
  documento: string;
  ie: string;
  uf: string;
  tier: string;
  pontos: number;
  criadoEm: string;
  pedidos: number;
  telefone: string;
  whatsapp: string;
  nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  observacoes: string;
  limiteCredito: number;
  ativo: boolean;
  fotoUrl: string;
};

type CliForm = {
  nome: string;
  email: string;
  documento: string;
  ie: string;
  uf: string;
  tier: string;
  pontos: string;
  telefone: string;
  whatsapp: string;
  nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  observacoes: string;
  limiteCredito: string;
  ativo: boolean;
};

const FORM_CLI_VAZIO: CliForm = {
  nome: "",
  email: "",
  documento: "",
  ie: "",
  uf: "SP",
  tier: "bronze",
  pontos: "0",
  telefone: "",
  whatsapp: "",
  nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  observacoes: "",
  limiteCredito: "0,00",
  ativo: true,
};

function cliDeRegistro(c: ClienteCad | null): CliForm {
  if (!c) return FORM_CLI_VAZIO;
  return {
    nome: c.nome,
    email: c.email,
    documento: c.documento,
    ie: c.ie,
    uf: c.uf || "SP",
    tier: c.tier,
    pontos: String(c.pontos),
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    nascimento: c.nascimento,
    cep: c.cep,
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cidade: c.cidade,
    observacoes: c.observacoes,
    limiteCredito: c.limiteCredito.toFixed(2).replace(".", ","),
    ativo: c.ativo,
  };
}

const TELAS = ["cliente", "produto", "empresa", "fornecedor", "revenda"] as const;
type Tela = (typeof TELAS)[number];

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// A tela é escolhida pela URL (?tela=...) — os sub-itens do menu lateral
// apontam para cá; a barra escura com os botões foi removida (pedido do
// cliente: as opções viraram sub-itens de "Cadastros" no menu).
export function CadastrosTelaUnica({
  fornecedoresReais = [],
  revendas = [],
  empresa = null,
  produtos = [],
  clientes = [],
}: {
  fornecedoresReais?: FornecedorCad[];
  revendas?: RevendaCad[];
  empresa?: EmpresaCad | null;
  produtos?: ProdutoCad[];
  clientes?: ClienteCad[];
}) {
  const params = useSearchParams();
  const telaUrl = params?.get("tela") ?? "cliente";
  const tela: Tela = (TELAS as readonly string[]).includes(telaUrl) ? (telaUrl as Tela) : "cliente";
  const router = useRouter();
  const [salvando, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const [fnNome, setFnNome] = useState("");
  const [fnCnpj, setFnCnpj] = useState("");
  const [fnContato, setFnContato] = useState("");
  const [fnUsuario, setFnUsuario] = useState("");

  useEffect(() => {
    setFeedback(null);
    if (tela === "produto") {
      carregarProduto(produtos.find((x) => x.id === prodId) ?? produtos[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela]);

  // Importador por link: atalho interno Ctrl+Shift+[ mostra/esconde o bloco.
  // Nada na tela menciona o recurso — é ferramenta de quem faz o cadastro.
  const [mostrarImport, setMostrarImport] = useState(false);
  useEffect(() => {
    const atalhoImport = (e: KeyboardEvent) => {
      // e.key: "[" com ctrl+shift (mais tolerante a layout/zoom do que e.code);
      // com Shift a tecla vira "{" em QWERTY, por isso aceitamos as duas.
      // e.code fica como fallback pra layouts onde e.key vem diferente (ex. ABNT).
      const teclaOk = e.key === "[" || e.key === "{" || e.code === "BracketLeft";
      if (e.ctrlKey && e.shiftKey && teclaOk) {
        e.preventDefault();
        setMostrarImport((v) => !v);
      }
    };
    window.addEventListener("keydown", atalhoImport);
    return () => window.removeEventListener("keydown", atalhoImport);
  }, []);
  // ao abrir o bloco escondido o cursor ja cai no campo do link (fluxo teclado)
  useEffect(() => {
    if (mostrarImport) document.getElementById("ct-prod-link")?.focus();
  }, [mostrarImport]);

  const [modal, setModal] = useState<null | "cliente" | "fornecedor">(null);
  const [tipoForn, setTipoForn] = useState<"pj" | "pf">("pj");
  const [fornAddr, setFornAddr] = useState(false);

  // ---- Bloco 5 passo 3: cadastro de cliente funcional --------------------
  const [cliId, setCliId] = useState<string | null>(clientes[0]?.id ?? null);
  const [cliBusca, setCliBusca] = useState("");
  const [cliPesquisaAberta, setCliPesquisaAberta] = useState(false);
  const [formCli, setFormCli] = useState<CliForm>(() => cliDeRegistro(clientes[0] ?? null));
  // "novos no mês" é calculado depois da hidratação: o relógio do servidor não
  // pode entrar no HTML inicial (senão o React reclama de mismatch de hydrate).
  const [cliNovos, setCliNovos] = useState(0);
  useEffect(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    setCliNovos(clientes.filter((c) => new Date(c.criadoEm) >= inicioMes).length);
  }, [clientes]);
  const [extra, setExtra] = useState<Record<string, string>>({
    cliente: "obs",
    produto: "obs",
    empresa: "danfe",
  });
  const [setores, setSetores] = useState(SETORES_INICIAIS);
  const [fornecedores, setFornecedores] = useState(FORNECEDORES_INICIAIS);
  const [setorQ, setSetorQ] = useState(SETORES_INICIAIS[0]);
  const [skuQ, setSkuQ] = useState(produtos[0]?.sku ?? "");
  const [prodId, setProdId] = useState<string | null>(produtos[0]?.id ?? null);
  const [fornQ, setFornQ] = useState(FORNECEDORES_INICIAIS[0]);
  const [acAberto, setAcAberto] = useState<null | "setor" | "fornecedor" | "sku">(null);

  const mostrarExtra = (tela_: string, chave: string) => setExtra((e) => ({ ...e, [tela_]: chave }));

  // ---- helpers de leitura/escrita dos formulários (F8.1) -------------------
  const g = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const val = (id: string) => g<HTMLInputElement>(id)?.value ?? "";
  const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
  const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;
  const kg = (n: number) => n.toFixed(3).replace(".", ",");

  // navegação por lista (◀◀ ◀ ▶ ▶▶): anda pela ordem alfabética da lista,
  // a mesma que o select do page.tsx devolve (.order("name")).
  function navegarProduto(passo: number) {
    if (produtos.length === 0) return;
    const idx = produtos.findIndex((x) => x.id === prodId);
    const base = idx < 0 ? 0 : idx;
    const novo = Math.min(Math.max(base + passo, 0), produtos.length - 1);
    carregarProduto(produtos[novo] ?? null);
  }

  function carregarProduto(p: ProdutoCad | null) {
    setProdId(p?.id ?? null);
    setSkuQ(p?.sku ?? "");
    const setVal = (id: string, v: string) => {
      const el = g<HTMLInputElement>(id);
      if (el) el.value = v;
    };
    const setSel = (id: string, v: string) => {
      const el = g<HTMLSelectElement>(id);
      if (el) el.value = v;
    };
    setVal("ct-prod-descricao", p?.nome ?? "");
    setSetorQ(p?.categoria ?? "");
    setVal("ct-prod-gtin", p?.gtin ?? "");
    setVal("ct-prod-ncm", p?.ncm ?? "");
    setVal("ct-prod-csosn", p?.csosn ?? "");
    setVal("ct-prod-cest", p?.cest ?? "");
    setSel("ct-prod-origem", p?.origem ?? "0");
    setSel("ct-prod-unit", p?.unit ?? "UN");
    setVal("ct-prod-icms", p ? pct(p.icmsPct) : "");
    setVal("ct-prod-ipi", p ? pct(p.ipiPct) : "");
    setVal("ct-prod-pesobruto", p ? kg(p.pesoBruto) : "");
    setVal("ct-prod-pesoliquido", p ? kg(p.pesoLiquido) : "");
    setVal("ct-prod-custo", p ? brl(p.precoCusto) : "");
    setVal("ct-prod-margem", p ? pct(p.margemPct) : "");
    setVal("ct-prod-venda", p ? brl(p.precoVenda) : "");
    setVal("ct-prod-min", p ? String(p.minStock) : "");
    const inativo = g<HTMLInputElement>("ct-prod-inativo");
    if (inativo) inativo.checked = p ? !p.ativo : false;
    // Bloco 2 (0031): campos novos que agora gravam de verdade.
    setVal("ct-prod-fabricante", p?.fabricante ?? "");
    setVal("ct-prod-observacoes", p?.observacoes ?? "");
    // 0032: foto do produto (URL do fornecedor)
    setVal("ct-prod-foto", p?.fotoUrl ?? "");
    setVal("ct-prod-cstpis", p?.cstPis ?? "");
    setVal("ct-prod-cstcofins", p?.cstCofins ?? "");
    setVal("ct-prod-icmsbase", p ? pct(p.icmsBasePct) : "100,00%");
    setVal("ct-prod-cstibscbs", p?.cstIbsCbs ?? "");
    setVal("ct-prod-cclasstrib", p?.cclassTrib ?? "");
    setVal("ct-prod-gtintrib", p?.gtinTributavel ?? "");
    // ficha do fornecedor + embalagem
    setVal("ct-prod-forn-nome", p?.fornecedorNome ?? "");
    setVal("ct-prod-forn-sku", p?.supplierSku ?? "");
    setVal("ct-prod-forn-ref", p?.refFabricante ?? "");
    setVal("ct-prod-pack-qty", p && p.packQty ? String(p.packQty) : "");
    setVal("ct-prod-master-qty", p && p.masterQty ? String(p.masterQty) : "");
    setVal("ct-prod-gtin-inner", p?.gtinInner ?? "");
    setVal("ct-prod-gtin-master", p?.gtinMaster ?? "");
    setVal("ct-prod-emb-comp", p && p.embComprimento ? String(p.embComprimento).replace(".", ",") : "");
    setVal("ct-prod-emb-alt", p && p.embAltura ? String(p.embAltura).replace(".", ",") : "");
    setVal("ct-prod-emb-larg", p && p.embLargura ? String(p.embLargura).replace(".", ",") : "");
    setVal("ct-prod-emb-peso", p && p.embPeso ? kg(p.embPeso) : "");
    setVal("ct-prod-mst-comp", p && p.masterComprimento ? String(p.masterComprimento).replace(".", ",") : "");
    setVal("ct-prod-mst-alt", p && p.masterAltura ? String(p.masterAltura).replace(".", ",") : "");
    setVal("ct-prod-mst-larg", p && p.masterLargura ? String(p.masterLargura).replace(".", ",") : "");
    setVal("ct-prod-mst-peso", p && p.masterPeso ? kg(p.masterPeso) : "");
    setVal("ct-prod-link", p?.sourceUrl ?? "");
    const chkOculta = g<HTMLInputElement>("ct-prod-oculta-preco");
    if (chkOculta) chkOculta.checked = p?.hidePriceTable ?? false;
    setVal("ct-prod-reajuste", p?.lastAdjustedAt ?? "");
  }

  function salvarProdutoUI() {
    const payload: ProdutoInput = {
      id: prodId ?? undefined,
      sku: skuQ.trim(),
      nome: val("ct-prod-descricao").trim(),
      categoria: setorQ.trim(),
      ativo: !(g<HTMLInputElement>("ct-prod-inativo")?.checked ?? false),
      gtin: val("ct-prod-gtin"),
      ncm: val("ct-prod-ncm"),
      csosn: val("ct-prod-csosn"),
      cest: val("ct-prod-cest"),
      origem: g<HTMLSelectElement>("ct-prod-origem")?.value ?? "0",
      unit: g<HTMLSelectElement>("ct-prod-unit")?.value ?? "UN",
      icmsPct: val("ct-prod-icms"),
      ipiPct: val("ct-prod-ipi"),
      pesoLiquido: val("ct-prod-pesoliquido"),
      pesoBruto: val("ct-prod-pesobruto"),
      precoCusto: val("ct-prod-custo"),
      precoVenda: val("ct-prod-venda"),
      minStock: val("ct-prod-min"),
      margemPct: val("ct-prod-margem"),
      // Bloco 2 (0031)
      fabricante: val("ct-prod-fabricante"),
      observacoes: val("ct-prod-observacoes"),
      cstPis: val("ct-prod-cstpis"),
      cstCofins: val("ct-prod-cstcofins"),
      icmsBasePct: val("ct-prod-icmsbase"),
      cstIbsCbs: val("ct-prod-cstibscbs"),
      cclassTrib: val("ct-prod-cclasstrib"),
      gtinTributavel: val("ct-prod-gtintrib"),
      fornecedorNome: val("ct-prod-forn-nome"),
      supplierSku: val("ct-prod-forn-sku"),
      refFabricante: val("ct-prod-forn-ref"),
      packQty: val("ct-prod-pack-qty"),
      masterQty: val("ct-prod-master-qty"),
      gtinInner: val("ct-prod-gtin-inner"),
      gtinMaster: val("ct-prod-gtin-master"),
      embComprimento: val("ct-prod-emb-comp"),
      embAltura: val("ct-prod-emb-alt"),
      embLargura: val("ct-prod-emb-larg"),
      embPeso: val("ct-prod-emb-peso"),
      masterComprimento: val("ct-prod-mst-comp"),
      masterAltura: val("ct-prod-mst-alt"),
      masterLargura: val("ct-prod-mst-larg"),
      masterPeso: val("ct-prod-mst-peso"),
      sourceUrl: val("ct-prod-link"),
      hidePriceTable: g<HTMLInputElement>("ct-prod-oculta-preco")?.checked ?? false,
      lastAdjustedAt: val("ct-prod-reajuste"),
      fotoUrl: val("ct-prod-foto"),
    };
    startTransition(async () => {
      const r = await salvarProduto(payload);
      if (r.ok) {
        setFeedback({ tipo: "ok", texto: "Produto salvo com sucesso." });
        if (r.id) setProdId(r.id);
        router.refresh();
      } else {
        setFeedback({ tipo: "err", texto: r.erro });
      }
    });
  }

  // Bloco 2 (0031): importar cadastro por link do fornecedor (Reval). Busca
  // no servidor, parseia e PREENCHE o form - nao grava nada (usuario revisa
  // e clica Salvar). Peso unitario ja vem calculado (peso emb / qtd emb).
  function importarProdutoUI() {
    const url = val("ct-prod-link").trim();
    if (!url) {
      setFeedback({ tipo: "err", texto: "Cole o link do produto no Reval para importar." });
      return;
    }
    startTransition(async () => {
      setFeedback({ tipo: "ok", texto: "Buscando dados no site do Reval..." });
      const r = await importarProdutoFornecedor(url);
      if (!r.ok || !r.produto) {
        setFeedback({ tipo: "err", texto: r.ok ? "Importação vazia." : r.erro });
        return;
      }
      const pr = r.produto;
      const setVal = (id: string, v: string) => {
        const el = g<HTMLInputElement>(id) ?? g<HTMLTextAreaElement>(id);
        if (el) (el as HTMLInputElement).value = v;
      };
      // ordem de preenchimento = ordem de revisao na linha 1 da tela:
      // GTIN -> Descricao -> Codigo interno, antes de qualquer outro campo.
      setVal("ct-prod-gtin", pr.gtin);
      setVal("ct-prod-descricao", pr.nome);
      if (pr.sku) setSkuQ(pr.sku);
      setSetorQ(pr.categoria);
      setVal("ct-prod-ncm", pr.ncm);
      setVal("ct-prod-cest", pr.cest);
      const origemSel = g<HTMLSelectElement>("ct-prod-origem");
      if (origemSel) origemSel.value = pr.origem;
      setVal("ct-prod-pesobruto", pr.pesoBruto ? pr.pesoBruto : "");
      setVal("ct-prod-fabricante", pr.fabricante);
      setVal("ct-prod-observacoes", pr.observacoes);
      setVal("ct-prod-foto", pr.fotoUrl);
      setVal("ct-prod-forn-nome", pr.fornecedorNome);
      setVal("ct-prod-forn-sku", pr.supplierSku);
      setVal("ct-prod-forn-ref", pr.refFabricante);
      setVal("ct-prod-pack-qty", pr.packQty);
      setVal("ct-prod-master-qty", pr.masterQty);
      setVal("ct-prod-gtin-inner", pr.gtinInner);
      setVal("ct-prod-gtin-master", pr.gtinMaster);
      setVal("ct-prod-emb-comp", pr.embComprimento);
      setVal("ct-prod-emb-alt", pr.embAltura);
      setVal("ct-prod-emb-larg", pr.embLargura);
      setVal("ct-prod-emb-peso", pr.embPeso);
      setVal("ct-prod-mst-comp", pr.masterComprimento);
      setVal("ct-prod-mst-alt", pr.masterAltura);
      setVal("ct-prod-mst-larg", pr.masterLargura);
      setVal("ct-prod-mst-peso", pr.masterPeso);
      // revisao comeca no GTIN: Tab ja le GTIN -> Descricao -> Codigo interno
      const gtinEl = g<HTMLInputElement>("ct-prod-gtin");
      if (gtinEl) {
        gtinEl.focus();
        gtinEl.select();
      }
      setFeedback({ tipo: "ok", texto: r.aviso ?? "Importado. Revise e clique Salvar." });
    });
  }

  function salvarEmpresaUI() {
    const payload: EmpresaInput = {
      razaoSocial: val("ct-emp-razao"),
      fantasia: val("ct-emp-fantasia"),
      cnpj: val("ct-emp-cnpj"),
      ie: val("ct-emp-ie"),
      im: val("ct-emp-im"),
      regime: g<HTMLSelectElement>("ct-emp-regime")?.value ?? "simples",
      email: val("ct-emp-email"),
      telefone: val("ct-emp-telefone"),
      cep: val("ct-emp-cep"),
      uf: g<HTMLSelectElement>("ct-emp-uf")?.value ?? "",
      cidade: val("ct-emp-cidade"),
      logradouro: val("ct-emp-logradouro"),
      numero: val("ct-emp-numero"),
      bairro: val("ct-emp-bairro"),
      complemento: val("ct-emp-complemento"),
      site: val("ct-emp-site"),
      ambiente:
        (document.querySelector('input[name="amb"]:checked') as HTMLInputElement | null)?.value ??
        "homologacao",
      serieNfe: val("ct-emp-serie-nfe"),
      serieNfce: val("ct-emp-serie-nfce"),
      cfopPadrao: g<HTMLSelectElement>("ct-emp-cfop")?.value ?? "5102",
      pedirDocumento: g<HTMLInputElement>("ct-emp-pedirdoc")?.checked ?? true,
    };
    startTransition(async () => {
      const r = await salvarEmpresa(payload);
      if (r.ok) setFeedback({ tipo: "ok", texto: "Empresa emitente salva com sucesso." });
      else setFeedback({ tipo: "err", texto: r.erro });
    });
  }

  const filtrar = (lista: string[], q: string) => {
    const limpo = q.trim().toLowerCase();
    return limpo ? lista.filter((v) => v.toLowerCase().includes(limpo)) : [...lista].sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  const onCepEmpresa = async (e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    if (!data) return;
    const logr = document.getElementById("ct-emp-logradouro") as HTMLInputElement | null;
    const bairro = document.getElementById("ct-emp-bairro") as HTMLInputElement | null;
    const cidade = document.getElementById("ct-emp-cidade") as HTMLInputElement | null;
    const uf = document.getElementById("ct-emp-uf") as HTMLSelectElement | null;
    if (logr && data.logradouro) logr.value = data.logradouro;
    if (bairro && data.bairro) bairro.value = data.bairro;
    if (cidade && data.localidade) cidade.value = data.localidade;
    if (uf && data.uf) uf.value = data.uf;
  };

  const onCepCliente = async (e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    if (!data) return;
    setFormCli((f) => ({
      ...f,
      cep: mascaraCep(data.cep || e.target.value),
      logradouro: data.logradouro || f.logradouro,
      bairro: data.bairro || f.bairro,
      cidade: data.localidade || f.cidade,
      uf: data.uf || f.uf,
    }));
  };

  const onCepModal = async (prefixo: "forn", e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    const logr = document.getElementById(`ct-${prefixo}-logradouro`) as HTMLInputElement | null;
    const bairro = document.getElementById(`ct-${prefixo}-bairro`) as HTMLInputElement | null;
    const cidade = document.getElementById(`ct-${prefixo}-cidade`) as HTMLInputElement | null;
    if (data) {
      if (logr) logr.value = data.logradouro || "";
      if (bairro) bairro.value = data.bairro || "";
      if (cidade) cidade.value = `${data.localidade || ""}${data.uf ? "/" + data.uf : ""}`;
    }
    setFornAddr(true);
    const numero = document.getElementById(`ct-${prefixo}-numero`);
    if (numero) setTimeout(() => numero.focus(), 50);
  };

  const onGtin = (e: React.FocusEvent<HTMLInputElement>) => {
    const field = e.target.closest(".ct-field") as HTMLElement | null;
    if (!field) return;
    const msg = field.querySelector(".ct-doc-msg");
    field.classList.remove("ct-doc-ok", "ct-doc-warn");
    const codigo = e.target.value;
    if (!codigo || (codigo.length !== 13 && codigo.length !== 14)) return;
    const achou = GTIN_DB[codigo];
    if (!achou) {
      field.classList.add("ct-doc-warn");
      if (msg) msg.textContent = "Não encontrado na base — preencha manualmente.";
      return;
    }
    const preencher = (id: string, valor: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = valor;
    };
    preencher("ct-prod-descricao", achou.descricao);
    preencher("ct-prod-ncm", achou.ncm);
    preencher("ct-prod-csosn", achou.csosn);
    preencher("ct-prod-cest", achou.cest);
    preencher("ct-prod-icms", achou.icms);
    preencher("ct-prod-base", achou.base);
    preencher("ct-prod-ipi", achou.ipi);
    preencher("ct-prod-cstpis", achou.cstpis);
    preencher("ct-prod-cstcofins", achou.cstcofins);
    preencher("ct-prod-pesobruto", achou.pesobruto);
    preencher("ct-prod-pesoliquido", achou.pesoliquido);
    field.classList.add("ct-doc-ok");
    if (msg) msg.textContent = "Descrição e dados fiscais preenchidos automaticamente.";
  };

  const salvarFornecedor = () => {
    const razao = (document.getElementById("ct-forn-razao") as HTMLInputElement | null)?.value.trim();
    if (!razao) {
      (document.getElementById("ct-forn-razao") as HTMLInputElement | null)?.focus();
      return;
    }
    setFornecedores((f) => (f.includes(razao) ? f : [...f, razao]));
    setFornQ(razao);
    setModal(null);
  };

  const iconePlus = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  );
  const iconeLixeira = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" /></svg>
  );
  const iconeLupa = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></svg>
  );
  const iconeImpressora = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z" /></svg>
  );
  const iconeCheck = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
  );
  const iconePrimeiro = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z" /></svg>
  );
  const iconeAnterior = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15 5v14l-9-7z" /></svg>
  );
  const iconeProximo = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5v14l9-7z" /></svg>
  );
  const iconeUltimo = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z" /></svg>
  );
  const iconeFoto = (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-4-4 3-3-2-6 5" /></svg>
  );

  const abasExtra = (chaveTela: string, abas: { id: string; label: string }[], conteudos: Record<string, React.ReactNode>) => (
    <div className="ct-side-tabs">
      <div className="ct-extra-tabs">
        {abas.map((a) => (
          <button
            key={a.id}
            className={`ct-extra-tab${extra[chaveTela] === a.id ? " on" : ""}`}
            onClick={() => mostrarExtra(chaveTela, a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div key={a.id} className={`ct-extra-panel${extra[chaveTela] === a.id ? " on" : ""}`}>
          {conteudos[a.id]}
        </div>
      ))}
    </div>
  );

  // ---- ficha de cliente: busca, contadores e ações ------------------------
  const cliQ = cliBusca.trim().toLowerCase();
  const cliAchados = cliPesquisaAberta
    ? clientes
        .filter(
          (c) =>
            !cliQ ||
            c.nome.toLowerCase().includes(cliQ) ||
            c.email.toLowerCase().includes(cliQ) ||
            c.documento.includes(cliQ)
        )
        .slice(0, 12)
    : [];
  const cliComPedido = clientes.filter((c) => c.pedidos > 0).length;
  const cliAtivos = clientes.filter((c) => c.ativo).length;
  const cliSelecionado = clientes.find((c) => c.id === cliId) ?? null;

  function selecionarCliente(c: ClienteCad | null) {
    setCliId(c?.id ?? null);
    setFormCli(cliDeRegistro(c));
    setCliBusca("");
    setCliPesquisaAberta(false);
    setFeedback(null);
  }

  function pesquisarCliente() {
    setCliPesquisaAberta(true);
    const el = document.getElementById("ct-cli-busca") as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  function salvarClienteUI() {
    if (formCli.nome.trim().length < 3) {
      setFeedback({ tipo: "err", texto: "Informe o nome do cliente." });
      return;
    }
    if (!formCli.email.trim()) {
      setFeedback({ tipo: "err", texto: "Informe o e-mail do cliente." });
      return;
    }
    setFeedback(null);
    // limite chega da tela como "1.234,56" (brl) - o servidor espera número.
    const paraServidor: ClienteInput = {
      ...formCli,
      id: cliId,
      limiteCredito: formCli.limiteCredito.replace(/\./g, "").replace(",", ".") || "0",
    };
    startTransition(async () => {
      const r = await salvarCliente(paraServidor);
      if (!r.ok) {
        setFeedback({ tipo: "err", texto: r.erro });
        return;
      }
      if (!cliId && r.id) setCliId(r.id);
      setFeedback({
        tipo: "ok",
        texto: cliId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.",
      });
      router.refresh();
    });
  }

  function apagarClienteUI() {
    if (!cliId) {
      setFeedback({ tipo: "err", texto: "Nenhum cliente selecionado para excluir." });
      return;
    }
    if (!window.confirm(`Excluir o cliente "${formCli.nome}"?`)) return;
    setFeedback(null);
    startTransition(async () => {
      const r = await removerCliente({ id: cliId });
      if (!r.ok) {
        setFeedback({ tipo: "err", texto: r.erro });
        return;
      }
      selecionarCliente(null);
      setFeedback({ tipo: "ok", texto: "Cliente removido com sucesso." });
      router.refresh();
    });
  }

  function salvarClienteNovo(e: React.FormEvent) {
    e.preventDefault();
    const nome =
      (document.getElementById("ct-cli-novo-nome") as HTMLInputElement | null)?.value ?? "";
    const email =
      (document.getElementById("ct-cli-novo-email") as HTMLInputElement | null)?.value ?? "";
    const documento =
      (document.getElementById("ct-cli-novo-doc") as HTMLInputElement | null)?.value ?? "";
    const tier =
      (document.getElementById("ct-cli-novo-tier") as HTMLSelectElement | null)?.value ??
      "bronze";
    if (nome.trim().length < 3) {
      setFeedback({ tipo: "err", texto: "Informe o nome do cliente." });
      return;
    }
    if (!email.trim()) {
      setFeedback({ tipo: "err", texto: "Informe o e-mail do cliente." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const r = await salvarCliente({ nome, email, documento, tier });
      if (!r.ok) {
        setFeedback({ tipo: "err", texto: r.erro });
        return;
      }
      setModal(null);
      setCliId(r.id ?? null);
      setFormCli({
        ...FORM_CLI_VAZIO,
        nome: nome.trim().replace(/\s+/g, " "),
        email: email.trim().toLowerCase(),
        documento,
        tier,
      });
      setFeedback({ tipo: "ok", texto: "Cliente cadastrado com sucesso." });
      router.refresh();
    });
  }

  // Aviso da tela (erro ou ok): sempre no TOPO da janela, como banner avulso.
  // A barra de status do rodapé fica só com a dica estática.
  const avisoTopo = feedback ? (
    <p className={`ct-feed ct-feed-topo ${feedback.tipo}`} role="alert">
      {feedback.texto}
    </p>
  ) : null;

  const telaCliente = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title"><span className="eyebrow">Nuvem de Papel · Cliente</span><h1>Cadastro de cliente</h1></div>
          <button className="ct-act primary" onClick={() => setModal("cliente")}>{iconePlus}Incluir</button>
          <button className="ct-act danger" aria-label="Apagar cliente" disabled={salvando || !cliId} onClick={apagarClienteUI}>{iconeLixeira}Apagar</button>
          <button className="ct-act" aria-label="Pesquisar cliente" onClick={pesquisarCliente}>{iconeLupa}Pesquisar</button>
          <button className="ct-act" onClick={() => window.print()}>{iconeImpressora}Imprimir</button>
          <span className="ct-spacer" />
          <button className="ct-act primary" aria-label="Salvar cliente" disabled={salvando} onClick={salvarClienteUI}>{iconeCheck}{salvando ? "Salvando..." : "Salvar"}</button>
          <span className="ct-pill">{cliId ? `Cód. ${cliId.slice(0, 6).toUpperCase()}` : "novo"}</span>
        </div>

        {avisoTopo}

        <div className="ct-grid">
          <div className="ct-main">
            <div className="ct-counters">
              <div className="code">{cliId ? `CÓD. ${cliId.slice(0, 6).toUpperCase()}` : "CÓD. NOVO"}</div>
              <div className="tot"><span className="k">Clientes total</span><b aria-label="Clientes total">{clientes.length}</b></div>
              <div className="ativ"><span className="k">Novos no mês</span><b aria-label="Novos no mes">{cliNovos}</b></div>
              <div className="inat"><span className="k">Com pedidos</span><b aria-label="Clientes com pedidos">{cliComPedido}</b></div>
              <div className="ativ"><span className="k">Ativos</span><b aria-label="Clientes ativos">{cliAtivos}</b></div>
              <div className="inat"><span className="k">Inativos</span><b aria-label="Clientes inativos">{clientes.length - cliAtivos}</b></div>
            </div>

            <div className="ct-grp">
              <div className="ct-field ct-ac">
                <label>Localizar cliente</label>
                <input
                  id="ct-cli-busca"
                  aria-label="Localizar cliente"
                  placeholder="nome, e-mail ou CPF/CNPJ"
                  value={cliBusca}
                  onChange={(e) => {
                    setCliBusca(e.target.value);
                    setCliPesquisaAberta(true);
                  }}
                  onFocus={() => setCliPesquisaAberta(true)}
                  onBlur={() => window.setTimeout(() => setCliPesquisaAberta(false), 160)}
                />
                <ul className={`ct-ac-list${cliAchados.length ? " on" : ""}`}>
                  {cliAchados.length === 0 ? (
                    <li className="ct-ac-empty">Nenhum cliente encontrado.</li>
                  ) : (
                    cliAchados.map((c) => (
                      <li key={c.id} onMouseDown={() => selecionarCliente(c)}>
                        {c.nome}
                        <span style={{ color: "var(--ink-soft)" }}> · {c.email}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="ct-grp">
              <div className="ct-row ct-r1">
                <div className="ct-field"><label>Nome / Razão social<span className="ct-req">*</span></label>
                  <input aria-label="Nome do cliente" maxLength={160} value={formCli.nome} onChange={(e) => setFormCli((f) => ({ ...f, nome: e.target.value }))} />
                </div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>E-mail<span className="ct-req">*</span></label>
                  <input aria-label="E-mail do cliente" type="email" value={formCli.email} onChange={(e) => setFormCli((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="ct-field"><label>CPF/CNPJ</label>
                  <input aria-label="CPF ou CNPJ do cliente" maxLength={18} value={formCli.documento} onChange={(e) => setFormCli((f) => ({ ...f, documento: mascaraDoc(e.target.value) }))} onBlur={(e) => verificarDoc(e.target)} />
                  <div className="ct-doc-msg" />
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Endereço</p>
              <div className="ct-row ct-r-2-1">
                <div className="ct-field"><label>Endereço (logradouro)</label>
                  <input aria-label="Logradouro do cliente" maxLength={120} value={formCli.logradouro} onChange={(e) => setFormCli((f) => ({ ...f, logradouro: e.target.value }))} />
                </div>
                <div className="ct-field"><label>Número</label>
                  <input aria-label="Numero do cliente" maxLength={20} value={formCli.numero} onChange={(e) => setFormCli((f) => ({ ...f, numero: e.target.value }))} />
                </div>
              </div>
              <div className="ct-row ct-r-1-2">
                <div className="ct-field"><label>Complemento</label>
                  <input aria-label="Complemento do cliente" maxLength={80} value={formCli.complemento} onChange={(e) => setFormCli((f) => ({ ...f, complemento: e.target.value }))} />
                </div>
                <div className="ct-field"><label>CEP <span className="ct-hint">busca automática</span></label>
                  <input aria-label="CEP do cliente" maxLength={9} value={formCli.cep} onChange={(e) => setFormCli((f) => ({ ...f, cep: mascaraCep(e.target.value) }))} onBlur={onCepCliente} />
                </div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Bairro</label>
                  <input aria-label="Bairro do cliente" maxLength={80} value={formCli.bairro} onChange={(e) => setFormCli((f) => ({ ...f, bairro: e.target.value }))} />
                </div>
                <div className="ct-field"><label>Cidade</label>
                  <input aria-label="Cidade do cliente" maxLength={80} value={formCli.cidade} onChange={(e) => setFormCli((f) => ({ ...f, cidade: e.target.value }))} />
                </div>
                <div className="ct-field"><label>Estado</label>
                  <select aria-label="Estado do cliente" value={formCli.uf} onChange={(e) => setFormCli((f) => ({ ...f, uf: e.target.value }))}>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Documentos</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Inscrição estadual</label>
                  <input aria-label="Inscricao estadual" maxLength={20} value={formCli.ie} onChange={(e) => setFormCli((f) => ({ ...f, ie: e.target.value }))} />
                </div>
                <div className="ct-field"><label>Nascimento</label>
                  <input aria-label="Nascimento do cliente" type="date" value={formCli.nascimento} onChange={(e) => setFormCli((f) => ({ ...f, nascimento: e.target.value }))} />
                </div>
              </div>
              <div className="ct-row ct-r1">
                <div className="ct-field"><label>Pontos de fidelidade</label>
                  <input aria-label="Pontos do cliente" type="number" min={0} value={formCli.pontos} onChange={(e) => setFormCli((f) => ({ ...f, pontos: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Contato</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Telefones</label>
                  <input aria-label="Telefone do cliente" maxLength={16} value={formCli.telefone} onChange={(e) => setFormCli((f) => ({ ...f, telefone: mascaraTelefone(e.target.value) }))} />
                </div>
                <div className="ct-field"><label>Celular / WhatsApp</label>
                  <input aria-label="WhatsApp do cliente" maxLength={16} value={formCli.whatsapp} onChange={(e) => setFormCli((f) => ({ ...f, whatsapp: mascaraTelefone(e.target.value) }))} />
                </div>
              </div>
            </div>

            <label className="ct-checkline">
              <input type="checkbox" aria-label="Cliente inativo" checked={!formCli.ativo} onChange={(e) => setFormCli((f) => ({ ...f, ativo: !e.target.checked }))} />
              Inativo — bloquear atendimento para este cliente
            </label>
          </div>

          <div className="ct-side">
            <div className="ct-grp" style={{ marginBottom: 0 }}>
              <p className="ct-grp-label">Situação comercial</p>
              <div className="ct-row ct-r1">
                <div className="ct-field"><label>Nível do cliente (tier)</label>
                  <select aria-label="Nivel do cliente" value={formCli.tier} onChange={(e) => setFormCli((f) => ({ ...f, tier: e.target.value }))}>
                    <option value="bronze">Bronze</option>
                    <option value="prata">Prata</option>
                    <option value="ouro">Ouro</option>
                    <option value="diamante">Diamante</option>
                  </select>
                </div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Limite de crédito</label>
                  <input aria-label="Limite de credito do cliente" value={formCli.limiteCredito} onChange={(e) => setFormCli((f) => ({ ...f, limiteCredito: e.target.value }))} />
                </div>
                <div className="ct-field"><label>Data do cadastro</label>
                  <input aria-label="Data de cadastro" type="date" disabled style={{ opacity: 0.7 }} value={cliSelecionado ? cliSelecionado.criadoEm.slice(0, 10) : ""} />
                </div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Pedidos</label>
                  <input aria-label="Pedidos do cliente" disabled style={{ opacity: 0.7 }} value={String(cliSelecionado?.pedidos ?? 0)} readOnly />
                </div>
                <div className="ct-field" style={{ display: "flex", alignItems: "flex-end" }}>
                  <span className={`ct-pill ${formCli.ativo ? "ok" : "bad"}`}>{formCli.ativo ? "ativo" : "inativo"}</span>
                </div>
              </div>
              <span className="ct-pill ok">{cliSelecionado ? `tier ${formCli.tier}` : "novo cadastro"}</span>
            </div>

            <a
              className="ct-act"
              style={{ width: "100%", justifyContent: "center", textDecoration: "none", opacity: formCli.whatsapp ? 1 : 0.5 }}
              href={formCli.whatsapp ? `https://wa.me/55${formCli.whatsapp.replace(/\D/g, "")}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="Mensagem WhatsApp"
            >
              Mensagem WhatsApp
            </a>

            <div className="ct-grp" style={{ marginBottom: 0 }}>
              <p className="ct-grp-label">Observações</p>
              <div className="ct-field">
                <textarea aria-label="Observacoes do cliente" maxLength={2000} placeholder="Observações internas sobre o cliente..." value={formCli.observacoes} onChange={(e) => setFormCli((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="ct-status">
          <span>Obrigatórios: nome e e-mail (o e-mail identifica o cliente e não se repete). Telefone, endereço e observações gravam a partir da migration 0029 — o CEP preenche o endereço sozinho.</span>
        </div>
      </div>
    </div>
  );

  const telaProduto = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title"><span className="eyebrow">Nuvem de Papel · Catálogo</span><h1>Cadastro de produto</h1></div>
          <div className="ct-menu">
            <button className="ct-menu-btn">Atualização</button>
            <button className="ct-menu-btn">Relatórios</button>
            <button className="ct-menu-btn">Listagem</button>
            <button className="ct-menu-btn">Configuração</button>
          </div>
          <button className="ct-act primary" onClick={salvarProdutoUI} disabled={salvando}>
            {iconeCheck}{salvando ? "Salvando..." : "Salvar"}
          </button>
          <button className="ct-act" onClick={() => carregarProduto(null)}>{iconePlus}Incluir</button>
          <span className="ct-spacer" />
          {/* navegação da lista: ◀◀ ◀ ▶ ▶▶ (anda pela ordem alfabética) */}
          <span className="ct-nav-prod">
            <button className="ct-act" title="Primeiro produto" aria-label="Primeiro produto" onClick={() => navegarProduto(-produtos.length)} disabled={produtos.length === 0}>{iconePrimeiro}</button>
            <button className="ct-act" title="Produto anterior" aria-label="Produto anterior" onClick={() => navegarProduto(-1)} disabled={produtos.length === 0}>{iconeAnterior}</button>
            <button className="ct-act" title="Próximo produto" aria-label="Próximo produto" onClick={() => navegarProduto(1)} disabled={produtos.length === 0}>{iconeProximo}</button>
            <button className="ct-act" title="Último produto" aria-label="Último produto" onClick={() => navegarProduto(produtos.length)} disabled={produtos.length === 0}>{iconeUltimo}</button>
          </span>
          <span className="ct-pill strong">{produtos.length} produtos</span>
        </div>

        {avisoTopo}

        <div className="ct-grid">
          <div className="ct-main">
            <div className="ct-grp">
              {/* importador: só aparece com o atalho Ctrl+Shift+[ */}
              {mostrarImport && (
                <div className="ct-row ct-r2">
                  <div className="ct-field" style={{ gridColumn: "span 2" }}>
                    <label>Importar do fornecedor <span className="ct-hint">cola o link e preenche tudo</span></label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input id="ct-prod-link" placeholder="https://...reval.net/produto/..." style={{ flex: 1 }} />
                      <button className="ct-act" onClick={importarProdutoUI} disabled={salvando} style={{ whiteSpace: "nowrap" }}>{iconeFoto}Importar</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="ct-row" style={{ gridTemplateColumns: "1.1fr 2fr 1.1fr" }}>
                <div className="ct-field"><label>Código de barras (GTIN)</label><input id="ct-prod-gtin" defaultValue="7898943477996" maxLength={14} onChange={(e) => (e.target.value = somenteDigitos(e.target.value, 14))} onBlur={onGtin} /><div className="ct-doc-msg" /></div>
                <div className="ct-field"><label>Descrição do produto<span className="ct-req">*</span></label><input id="ct-prod-descricao" placeholder="Nome do produto" /></div>
                <div className="ct-field ct-ac">
                  <label>Código interno</label>
                  <input
                    id="ct-prod-sku"
                    autoComplete="off"
                    value={skuQ}
                    onChange={(e) => { setSkuQ(e.target.value); setAcAberto("sku"); }}
                    onFocus={() => setAcAberto("sku")}
                    onBlur={() => setTimeout(() => setAcAberto(null), 150)}
                    placeholder="SKU-0001"
                  />
                  <ul className={`ct-ac-list${acAberto === "sku" ? " on" : ""}`}>
                    {filtrar(produtos.map((p) => p.sku), skuQ).length === 0 && <li className="ct-ac-empty">Nenhum por aqui — digite e salve</li>}
                    {filtrar(produtos.map((p) => p.sku), skuQ).map((v) => (
                      <li key={v} onMouseDown={() => { const p = produtos.find((x) => x.sku === v); if (p) carregarProduto(p); setAcAberto(null); }}>{v}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="ct-row ct-r4-forn">
                <div className="ct-field ct-ac">
                  <label>Setor/Cadastrar</label>
                  <input
                    autoComplete="off"
                    value={setorQ}
                    onChange={(e) => { setSetorQ(e.target.value); setAcAberto("setor"); }}
                    onFocus={() => setAcAberto("setor")}
                    onBlur={() => setTimeout(() => setAcAberto(null), 150)}
                  />
                  <ul className={`ct-ac-list${acAberto === "setor" ? " on" : ""}`}>
                    {filtrar(setores, setorQ).length === 0 && <li className="ct-ac-empty">Nenhum cadastrado ainda</li>}
                    {filtrar(setores, setorQ).map((v) => (
                      <li key={v} onMouseDown={() => { setSetorQ(v); setAcAberto(null); }}>{v}</li>
                    ))}
                    {setorQ.trim() && !setores.some((v) => v.toLowerCase() === setorQ.trim().toLowerCase()) && (
                      <li className="ct-ac-new">
                        <button className="ct-ac-new-btn" onMouseDown={(e) => { e.preventDefault(); const v = setorQ.trim(); setSetores((s) => [...s, v]); setSetorQ(v); setAcAberto(null); }}>Cadastrar</button>
                      </li>
                    )}
                  </ul>
                </div>
                <div className="ct-field ct-ac">
                  <label>Fornecedor/Cadastrar</label>
                  <input
                    autoComplete="off"
                    value={fornQ}
                    onChange={(e) => { setFornQ(e.target.value); setAcAberto("fornecedor"); }}
                    onFocus={() => setAcAberto("fornecedor")}
                    onBlur={() => setTimeout(() => setAcAberto(null), 150)}
                  />
                  <ul className={`ct-ac-list${acAberto === "fornecedor" ? " on" : ""}`}>
                    {filtrar(fornecedores, fornQ).length === 0 && <li className="ct-ac-empty">Nenhum cadastrado ainda</li>}
                    {filtrar(fornecedores, fornQ).map((v) => (
                      <li key={v} onMouseDown={() => { setFornQ(v); setAcAberto(null); }}>{v}</li>
                    ))}
                    {fornQ.trim() && !fornecedores.some((v) => v.toLowerCase() === fornQ.trim().toLowerCase()) && (
                      <li className="ct-ac-new">
                        <button className="ct-ac-new-btn" onMouseDown={(e) => { e.preventDefault(); setModal("fornecedor"); }}>Cadastrar fornecedor</button>
                      </li>
                    )}
                  </ul>
                </div>
                <div className="ct-field"><label>Fabricante</label><input id="ct-prod-fabricante" placeholder="Ex.: Tilibra" /></div>
                <div className="ct-field">
                  <label>Unidade</label>
                  <select id="ct-prod-unit" defaultValue="UN">
                    {["UN", "PC", "CX", "RL", "KG", "FD", "KIT"].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Fornecedor e embalagem <span className="ct-hint">vem do importador / digitado à mão</span></p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Fornecedor (nome na fonte)</label><input id="ct-prod-forn-nome" placeholder="TILIBRA" /></div>
                <div className="ct-field"><label>Código do fornecedor</label><input id="ct-prod-forn-sku" placeholder="114148" /></div>
                <div className="ct-field"><label>Ref. fabricante</label><input id="ct-prod-forn-ref" placeholder="354945" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Qtd. por embalagem</label><input id="ct-prod-pack-qty" placeholder="4" /></div>
                <div className="ct-field"><label>Qtd. por master</label><input id="ct-prod-master-qty" placeholder="5" /></div>
                <div className="ct-field"><label>GTIN da embalagem (inner)</label><input id="ct-prod-gtin-inner" placeholder="7891027019150" maxLength={14} /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>GTIN master (DUN-14)</label><input id="ct-prod-gtin-master" placeholder="17891027354944" maxLength={14} /></div>
                <div className="ct-field"><label>Peso embalagem (kg)</label><input id="ct-prod-emb-peso" placeholder="1,390" /></div>
                <div className="ct-field"><label>Peso master (kg)</label><input id="ct-prod-mst-peso" placeholder="7,220" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Comp. emb. (cm)</label><input id="ct-prod-emb-comp" placeholder="21,5" /></div>
                <div className="ct-field"><label>Alt. emb. (cm)</label><input id="ct-prod-emb-alt" placeholder="6,5" /></div>
                <div className="ct-field"><label>Larg. emb. (cm)</label><input id="ct-prod-emb-larg" placeholder="15,5" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Comp. master (cm)</label><input id="ct-prod-mst-comp" placeholder="36" /></div>
                <div className="ct-field"><label>Alt. master (cm)</label><input id="ct-prod-mst-alt" placeholder="22,5" /></div>
                <div className="ct-field"><label>Larg. master (cm)</label><input id="ct-prod-mst-larg" placeholder="16,5" /></div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Financeiro e estoque</p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Preço de custo</label><input id="ct-prod-custo" placeholder="R$ 0,00" /></div>
                <div className="ct-field"><label>Margem de lucro</label><input id="ct-prod-margem" placeholder="0,00%" /></div>
                <div className="ct-field"><label>Preço de venda<span className="ct-req">*</span></label><input id="ct-prod-venda" placeholder="R$ 0,00" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Qtd. mínima</label><input id="ct-prod-min" defaultValue="0" /></div>
                <div className="ct-field"><label>Qtd. atual em estoque</label><input disabled placeholder="controlada em Logística" style={{ opacity: 0.7 }} /></div>
                <div className="ct-field"><label>Data último reajuste</label><input id="ct-prod-reajuste" type="date" /></div>
              </div>
            </div>

            <div className="ct-row ct-r2">
              <label className="ct-checkline"><input type="checkbox" id="ct-prod-oculta-preco" />Não imprimir na tabela de preços</label>
              <label className="ct-checkline"><input type="checkbox" id="ct-prod-inativo" />Inativo</label>
            </div>
          </div>

          <div className="ct-side">
            <div className="ct-fiscal">
              <p className="ct-grp-label">Emissão de NF-e / NFC-e / CF-e</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>NCM</label><input id="ct-prod-ncm" defaultValue="48201000" /></div>
                <div className="ct-field"><label>CSOSN</label><input id="ct-prod-csosn" defaultValue="102" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>CEST <span className="ct-hint">opcional</span></label><input id="ct-prod-cest" placeholder="0000000" /></div>
                <div className="ct-field">
                  <label>Origem</label>
                  <select id="ct-prod-origem" defaultValue="0">
                    <option value="0">0 — Nacional</option>
                    <option value="1">1 — Estrangeira (importação direta)</option>
                    <option value="2">2 — Estrangeira (adquirida no mercado)</option>
                    <option value="3">3 — Nacional ({">"}40% conteúdo importado)</option>
                    <option value="4">4 — Nacional (processos básicos)</option>
                    <option value="5">5 — Nacional ({">"}70% conteúdo importado)</option>
                    <option value="6">6 — Estrangeira (importação direta, similar nacional)</option>
                    <option value="7">7 — Estrangeira (adquirida no mercado, similar nacional)</option>
                  </select>
                </div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>ICMS interno</label><input id="ct-prod-icms" defaultValue="18,00%" /></div>
                <div className="ct-field"><label>Base de cálculo</label><input id="ct-prod-icmsbase" defaultValue="100,00%" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>IPI</label><input id="ct-prod-ipi" defaultValue="0,00%" /></div>
                <div className="ct-field"><label>CST PIS</label><input id="ct-prod-cstpis" placeholder="49" maxLength={2} /></div>
                <div className="ct-field"><label>CST Cofins</label><input id="ct-prod-cstcofins" placeholder="49" maxLength={2} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>CST IBS/CBS <span className="ct-hint">reforma 2026</span></label><input id="ct-prod-cstibscbs" placeholder="000" maxLength={3} /></div>
                <div className="ct-field"><label>cClassTrib <span className="ct-hint">reforma 2026</span></label><input id="ct-prod-cclasstrib" placeholder="000000" maxLength={6} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Peso bruto</label><input id="ct-prod-pesobruto" defaultValue="0,320" /></div>
                <div className="ct-field"><label>Peso líquido</label><input id="ct-prod-pesoliquido" defaultValue="0,300" /></div>
              </div>
            </div>

            <div className="ct-side-tabs" style={{ marginTop: 14 }}>
              <div className="ct-extra-tabs">
                <button className={`ct-extra-tab${extra.produto === "obs" ? " on" : ""}`} onClick={() => mostrarExtra("produto", "obs")}>1. Observações</button>
                <button className={`ct-extra-tab${extra.produto === "outros" ? " on" : ""}`} onClick={() => mostrarExtra("produto", "outros")}>2. Outros</button>
              </div>
              <div className={`ct-extra-panel${extra.produto === "obs" ? " on" : ""}`}>
                <div className="ct-field"><textarea id="ct-prod-observacoes" placeholder="Detalhes do produto / observações internas..." /></div>
              </div>
              <div className={`ct-extra-panel${extra.produto === "outros" ? " on" : ""}`}>
                <div className="ct-row ct-r1"><div className="ct-field"><label>GTIN tributável</label><input id="ct-prod-gtintrib" placeholder="7898943477996" maxLength={14} /></div></div>
                <div className="ct-row ct-r1"><div className="ct-field"><label>Foto (URL)</label><input id="ct-prod-foto" placeholder="https://.../imagem/produtos/m/080000.jpg" /></div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="ct-status">
          <span>GTIN, NCM e tributos são validados no servidor e no banco antes de gravar.</span>
        </div>
      </div>
    </div>
  );

  const telaEmpresa = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title"><span className="eyebrow">Nuvem de Papel · Configuração fiscal</span><h1>Cadastro da empresa emitente</h1></div>
          <button className="ct-act primary" onClick={salvarEmpresaUI} disabled={salvando}>
            {iconeCheck}{salvando ? "Salvando..." : "Salvar"}
          </button>
          <button className="ct-act">Configurar CSC</button>
          <span className="ct-spacer" />
          <span className="ct-pill ok">Homologação ok</span>
        </div>

        {avisoTopo}

        <div className="ct-grid ct-eq">
          <div className="ct-main">
            <div className="ct-grp">
              <p className="ct-grp-label">Dados da empresa emitente</p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>CNPJ</label><input id="ct-emp-cnpj" defaultValue={empresa?.cnpj ?? ""} placeholder="00.000.000/0000-00" maxLength={18} onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} onBlur={(e) => verificarDoc(e.target)} /><div className="ct-doc-msg" /></div>
                <div className="ct-field"><label>Inscrição Estadual</label><input id="ct-emp-ie" defaultValue={empresa?.ie ?? ""} placeholder="000.000.000.000" /></div>
                <div className="ct-field">
                  <label>Regime tributário</label>
                  <select id="ct-emp-regime" defaultValue={empresa?.regime ?? "simples"}>
                    <option value="simples">Simples Nacional</option>
                    <option value="normal">Normal</option>
                    <option value="mei">MEI</option>
                  </select>
                </div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Razão social<span className="ct-req">*</span></label><input id="ct-emp-razao" defaultValue={empresa?.razaoSocial ?? ""} /></div>
                <div className="ct-field"><label>Nome fantasia</label><input id="ct-emp-fantasia" defaultValue={empresa?.fantasia ?? ""} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>E-mail</label><input id="ct-emp-email" defaultValue={empresa?.email ?? ""} /></div>
                <div className="ct-field"><label>Telefone</label><input id="ct-emp-telefone" defaultValue={empresa?.telefone ?? ""} maxLength={15} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>CEP</label><input id="ct-emp-cep" defaultValue={empresa?.cep ?? ""} maxLength={9} onChange={(e) => (e.target.value = mascaraCep(e.target.value))} onBlur={onCepEmpresa} /></div>
                <div className="ct-field"><label>Estado</label><select id="ct-emp-uf" defaultValue={empresa?.uf || "SP"}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
                <div className="ct-field"><label>Município</label><input id="ct-emp-cidade" defaultValue={empresa?.cidade ?? ""} /></div>
              </div>
              <div className="ct-row ct-r-2-1">
                <div className="ct-field"><label>Logradouro</label><input id="ct-emp-logradouro" defaultValue={empresa?.logradouro ?? ""} /></div>
                <div className="ct-field"><label>Número</label><input id="ct-emp-numero" defaultValue={empresa?.numero ?? ""} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Bairro</label><input id="ct-emp-bairro" defaultValue={empresa?.bairro ?? ""} /></div>
                <div className="ct-field"><label>Complemento</label><input id="ct-emp-complemento" defaultValue={empresa?.complemento ?? ""} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Site na internet</label><input id="ct-emp-site" defaultValue={empresa?.site ?? ""} /></div>
              </div>
              <div className="ct-row ct-r1">
                <div className="ct-radio-group"><span className="rg-label">Ambiente de emissão</span>
                  <label className="ct-radio-opt"><input type="radio" name="amb" value="homologacao" defaultChecked={(empresa?.ambiente ?? "homologacao") === "homologacao"} />Homologação (testes)</label>
                  <label className="ct-radio-opt"><input type="radio" name="amb" value="producao" defaultChecked={empresa?.ambiente === "producao"} />Produção</label>
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Numeração e séries</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Série NF-e</label><input id="ct-emp-serie-nfe" defaultValue={empresa?.serieNfe ?? "1"} /></div>
                <div className="ct-field"><label>Série NFC-e</label><input id="ct-emp-serie-nfce" defaultValue={empresa?.serieNfce ?? "1"} /></div>
              </div>
              <p className="ct-hint" style={{ margin: "6px 0 0" }}>A numeração da nota vem automática (próximo número da série).</p>
            </div>
          </div>

          <div className="ct-side">
            <div className="ct-fiscal">
              <p className="ct-grp-label">Emissão · certificado e CSC</p>
              <div className="ct-row ct-r1"><div className="ct-field"><label>Certificado digital <span className="ct-hint">A1, carregado</span></label><input placeholder="•••• arquivo protegido ••••" disabled style={{ opacity: 0.7 }} /></div></div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>ID (Código CSC)</label><input placeholder="000001" /></div>
                <div className="ct-field"><label>CSC <span className="ct-hint">nunca exibido em texto</span></label><input type="password" placeholder="••••••••••••" disabled style={{ opacity: 0.7 }} /></div>
              </div>
              <div className="ct-row ct-r1">
                <div className="ct-field">
                  <label>CFOP padrão na emissão</label>
                  <select id="ct-emp-cfop" defaultValue={empresa?.cfopPadrao ?? "5102"}>
                    <option value="5102">5102 — Venda de mercadoria</option>
                    <option value="5405">5405 — Venda ST</option>
                    <option value="5101">5101 — Venda produção</option>
                    <option value="6108">6108 — Venda a não contribuinte</option>
                  </select>
                </div>
              </div>
              <label className="ct-checkline" style={{ marginBottom: 8 }}><input type="checkbox" id="ct-emp-pedirdoc" defaultChecked={empresa ? empresa.pedirDocumento : true} />Pedir CPF/CNPJ antes da emissão</label>
              <label className="ct-checkline"><input type="checkbox" />Enviar novos tributos da reforma tributária</label>
            </div>

            {abasExtra(
              "empresa",
              [
                { id: "danfe", label: "Danfe" },
                { id: "venda", label: "Venda" },
                { id: "tef", label: "TEF" },
                { id: "outras", label: "Outras" },
              ],
              {
                danfe: (
                  <>
                    <div className="ct-row ct-r1">
                      <div className="ct-radio-group"><span className="rg-label">Tipo</span>
                        <label className="ct-radio-opt"><input type="radio" name="danfe" defaultChecked />Impressa</label>
                        <label className="ct-radio-opt"><input type="radio" name="danfe" />Ecológica</label>
                      </div>
                    </div>
                    <div className="ct-row ct-r2">
                      <div className="ct-field"><label>Modelo de impressão</label><select><option>Modelo ACBR Fortes</option></select></div>
                      <div className="ct-field"><label>Largura da bobina</label><input defaultValue="302" /></div>
                    </div>
                    <label className="ct-checkline"><input type="checkbox" defaultChecked />Imprime desconto/acréscimo do item</label>
                  </>
                ),
                venda: (
                  <>
                    <label className="ct-checkline"><input type="checkbox" defaultChecked />Aceitar pagamento misto</label>
                    <label className="ct-checkline"><input type="checkbox" />Sempre pedir número de orçamento</label>
                    <div className="ct-row ct-r2" style={{ marginTop: 8 }}>
                      <div className="ct-field"><label>Modelo da balança</label><select><option>Nenhuma</option></select></div>
                      <div className="ct-field"><label>Porta serial</label><select><option>COM1</option></select></div>
                    </div>
                  </>
                ),
                tef: (
                  <div className="ct-row ct-r1">
                    <div className="ct-radio-group"><span className="rg-label">Integrador</span>
                      <label className="ct-radio-opt"><input type="radio" name="tef" defaultChecked />Não usar TEF</label>
                      <label className="ct-radio-opt"><input type="radio" name="tef" />PayGo</label>
                    </div>
                  </div>
                ),
                outras: (
                  <>
                    <div className="ct-row ct-r2">
                      <div className="ct-field"><label>Servidor de data/hora 1</label><input defaultValue="200.20.186.94" /></div>
                      <div className="ct-field"><label>Servidor de data/hora 2</label><input defaultValue="200.20.186.75" /></div>
                    </div>
                    <label className="ct-checkline"><input type="checkbox" />Tentar reenviar notas emitidas offline</label>
                  </>
                ),
              }
            )}
          </div>
        </div>

        <div className="ct-status">
          <span>Dados salvos no servidor — nenhum certificado ou CSC real aparece aqui.</span>
        </div>
      </div>
    </div>
  );

  // ---- fornecedores reais (mesma action da tela de Compras) --------------
  function salvarFornecedorNovo(e: React.FormEvent) {
    e.preventDefault();
    const nome = fnNome.trim();
    if (nome.length < 3) {
      setFeedback({ tipo: "err", texto: "Informe o nome do fornecedor." });
      return;
    }
    startTransition(async () => {
      const r = await criarFornecedor({
        nome,
        emailContato: fnContato.trim(),
        cnpj: fnCnpj.trim(),
        emailUsuario: fnUsuario.trim(),
      });
      if (r.ok) {
        setFeedback({ tipo: "ok", texto: r.aviso ?? "Fornecedor cadastrado com sucesso." });
        setFnNome("");
        setFnCnpj("");
        setFnContato("");
        setFnUsuario("");
        router.refresh();
      } else {
        setFeedback({ tipo: "err", texto: r.erro });
      }
    });
  }

  // ---- aprovação de revendas (mesma action do console de usuários) -------
  function mudarRevenda(userId: string, novoStatus: "ativo" | "inativo") {
    startTransition(async () => {
      const r = await alternarStatus({ userId, novoStatus });
      if (r.ok) {
        setFeedback({
          tipo: "ok",
          texto: r.aviso ?? (novoStatus === "ativo" ? "Revenda aprovada." : "Revenda rejeitada."),
        });
        router.refresh();
      } else {
        setFeedback({ tipo: "err", texto: r.erro });
      }
    });
  }

  const telaFornecedor = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title">
            <span className="eyebrow">Nuvem de Papel · Suprimentos</span>
            <h1>Fornecedores</h1>
          </div>
          <span className="ct-spacer" />
          <span className="ct-pill">
            {fornecedoresReais.length} cadastrado{fornecedoresReais.length === 1 ? "" : "s"}
          </span>
        </div>

        {avisoTopo}

        <div className="ct-sec">
          <div className="ct-sec-title">
            <h2>Lista de fornecedores</h2>
            <a className="ct-act" href="/compras">
              Abrir compras
            </a>
          </div>
          {fornecedoresReais.length === 0 ? (
            <p className="ct-empty">Nenhum fornecedor cadastrado ainda.</p>
          ) : (
            <table className="ct-tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>CNPJ</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {fornecedoresReais.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.contato ?? "-"}</td>
                    <td>{f.cnpj ?? "-"}</td>
                    <td>
                      <span className={`ct-pill${f.ativo ? " ok" : " bad"}`}>
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="ct-sec">
          <div className="ct-sec-title">
            <h2>Novo fornecedor</h2>
          </div>
          <form onSubmit={salvarFornecedorNovo}>
            <div className="ct-row ct-r2">
              <div className="ct-field">
                <label>Nome do fornecedor *</label>
                <input
                  value={fnNome}
                  onChange={(e) => setFnNome(e.target.value)}
                  placeholder="Ex.: Papelaria Central Ltda"
                />
              </div>
              <div className="ct-field">
                <label>CNPJ</label>
                <input
                  value={fnCnpj}
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                  onChange={(e) => setFnCnpj(mascaraDoc(e.target.value))}
                />
              </div>
            </div>
            <div className="ct-row ct-r2">
              <div className="ct-field">
                <label>E-mail de contato</label>
                <input
                  value={fnContato}
                  onChange={(e) => setFnContato(e.target.value)}
                  placeholder="contato@fornecedor.com"
                />
              </div>
              <div className="ct-field">
                <label>E-mail do usuário do portal (opcional)</label>
                <input
                  value={fnUsuario}
                  onChange={(e) => setFnUsuario(e.target.value)}
                  placeholder="portal@fornecedor.com"
                />
              </div>
            </div>
            <div className="ct-actions" style={{ marginTop: 8 }}>
              <button type="submit" className="ct-act primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Cadastrar fornecedor"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  const telaRevenda = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title">
            <span className="eyebrow">Nuvem de Papel · Parceiros</span>
            <h1>Cadastro de revendas</h1>
          </div>
          <span className="ct-spacer" />
          <span className="ct-pill">
            {revendas.length} revenda{revendas.length === 1 ? "" : "s"}
          </span>
        </div>

        {avisoTopo}

        <div className="ct-sec">
          <div className="ct-sec-title">
            <h2>Revendas</h2>
            <a className="ct-act" href="/seja-revenda">
              Ver formulário público
            </a>
          </div>
          {revendas.length === 0 ? (
            <p className="ct-empty">
              Nenhuma revenda cadastrada ainda — pedidos feitos no formulário público
              (/seja-revenda) aparecem aqui para aprovação.
            </p>
          ) : (
            <table className="ct-tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Pedido em</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {revendas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.full_name ?? "-"}</td>
                    <td>{r.email}</td>
                    <td>{dataCurta(r.created_at)}</td>
                    <td>
                      <span
                        className={`ct-pill ${
                          r.status === "ativo" ? "ok" : r.status === "inativo" ? "bad" : "wait"
                        }`}
                      >
                        {r.status === "ativo"
                          ? "Ativa"
                          : r.status === "inativo"
                            ? "Inativa"
                            : "Aguardando aprovação"}
                      </span>
                    </td>
                    <td>
                      <div className="ct-actions">
                        {r.status === "pendente" && (
                          <>
                            <button
                              type="button"
                              className="ct-act primary"
                              disabled={salvando}
                              onClick={() => mudarRevenda(r.id, "ativo")}
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              className="ct-act danger"
                              disabled={salvando}
                              onClick={() => mudarRevenda(r.id, "inativo")}
                            >
                              Rejeitar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {tela === "cliente" && telaCliente}
      {tela === "produto" && telaProduto}
      {tela === "empresa" && telaEmpresa}
      {tela === "fornecedor" && telaFornecedor}
      {tela === "revenda" && telaRevenda}

      {modal === "cliente" && (
        <form
          className="ct-overlay"
          onSubmit={salvarClienteNovo}
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="ct-modal">
            <div className="ct-modal-head"><h2>Inclusão de cliente</h2><button type="button" className="ct-modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="ct-modal-body">
              <div className="ct-row ct-r1" style={{ marginBottom: 12 }}>
                <div className="ct-field"><label>Nome / Razão social<span className="ct-req">*</span></label>
                  <input id="ct-cli-novo-nome" aria-label="Nome do cliente novo" maxLength={160} autoFocus /></div>
              </div>
              <div className="ct-row ct-r1" style={{ marginBottom: 12 }}>
                <div className="ct-field"><label>E-mail<span className="ct-req">*</span></label>
                  <input id="ct-cli-novo-email" aria-label="E-mail do cliente novo" type="email" placeholder="nome@provedor.com.br" /></div>
              </div>
              <div className="ct-row ct-r2" style={{ marginBottom: 12 }}>
                <div className="ct-field"><label>CPF/CNPJ</label>
                  <input id="ct-cli-novo-doc" aria-label="CPF ou CNPJ do cliente novo" maxLength={18} placeholder="000.000.000-00" onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} />
                  <div className="ct-doc-msg" /></div>
                <div className="ct-field"><label>Nível (tier)</label>
                  <select id="ct-cli-novo-tier" aria-label="Nivel do cliente novo" defaultValue="bronze">
                    <option value="bronze">Bronze</option>
                    <option value="prata">Prata</option>
                    <option value="ouro">Ouro</option>
                    <option value="diamante">Diamante</option>
                  </select></div>
              </div>
              {feedback && <p className={`ct-feed ${feedback.tipo}`} role="status">{feedback.texto}</p>}
              <p className="ct-lookup-note">O e-mail é obrigatório: é ele que identifica o cliente na loja e não pode se repetir no mesmo cadastro.</p>
            </div>
            <div className="ct-modal-foot">
              <button type="button" className="ct-act" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="ct-act primary" disabled={salvando}>{iconeCheck}{salvando ? "Salvando..." : "Salvar cliente"}</button>
            </div>
          </div>
        </form>
      )}

      {modal === "fornecedor" && (
        <div className="ct-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="ct-modal">
            <div className="ct-modal-head"><h2>Cadastro rápido de fornecedor</h2><button className="ct-modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="ct-modal-body">
              <p className="ct-lookup-note" style={{ margin: "0 0 12px" }}>
                Um nome sozinho não é fornecedor — preencha pelo menos documento e contato antes de vincular ao produto.
              </p>
              <div className="ct-radio-group" style={{ marginBottom: 14 }}>
                <span className="rg-label">Tipo</span>
                <label className="ct-radio-opt"><input type="radio" name="forn-tipo" checked={tipoForn === "pj"} onChange={() => setTipoForn("pj")} />Pessoa jurídica</label>
                <label className="ct-radio-opt"><input type="radio" name="forn-tipo" checked={tipoForn === "pf"} onChange={() => setTipoForn("pf")} />Pessoa física</label>
              </div>
              <div className="ct-field" style={{ marginBottom: 12 }}><label>Razão social / Nome<span className="ct-req">*</span></label><input id="ct-forn-razao" defaultValue={fornQ} /></div>
              <div className="ct-row ct-r2" style={{ marginBottom: 12 }}>
                <div className="ct-field">
                  <label>{tipoForn === "pj" ? "CNPJ" : "CPF"}</label>
                  <input key={tipoForn} placeholder={tipoForn === "pj" ? "00.000.000/0000-00" : "000.000.000-00"} onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} onBlur={(e) => verificarDoc(e.target)} />
                  <div className="ct-doc-msg" />
                </div>
                <div className="ct-field"><label>Telefone</label><input placeholder="(00) 00000-0000" maxLength={15} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
              </div>
              <label className="ct-checkline" style={{ marginBottom: 14 }}><input type="checkbox" defaultChecked />Obter dados da Receita Federal</label>
              <div className="ct-row ct-r1" style={{ marginBottom: 12 }}>
                <div className="ct-field"><label>CEP <span className="ct-hint">busca automática</span></label><input placeholder="00000-000" maxLength={9} onChange={(e) => (e.target.value = mascaraCep(e.target.value))} onBlur={(e) => onCepModal("forn", e)} /></div>
              </div>
              <div className={`ct-addr-box${fornAddr ? " on" : ""}`}>
                <div className="ct-row ct-r1" style={{ marginBottom: 12 }}><div className="ct-field"><label>Logradouro</label><input id="ct-forn-logradouro" /></div></div>
                <div className="ct-row ct-r3" style={{ marginBottom: 12 }}>
                  <div className="ct-field"><label>Número</label><input id="ct-forn-numero" placeholder="Nº" /></div>
                  <div className="ct-field"><label>Bairro</label><input id="ct-forn-bairro" /></div>
                  <div className="ct-field"><label>Cidade/UF</label><input id="ct-forn-cidade" /></div>
                </div>
              </div>
              <div className="ct-row ct-r1"><div className="ct-field"><label>E-mail</label><input id="ct-forn-email" placeholder="opcional" /></div></div>
            </div>
            <div className="ct-modal-foot">
              <button className="ct-act" onClick={() => setModal(null)}>Cancelar</button>
              <button className="ct-act primary" onClick={salvarFornecedor}>{iconeCheck}Salvar fornecedor e continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
