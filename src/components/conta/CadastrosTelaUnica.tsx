"use client";

import { useState } from "react";

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
.ct-switch{padding:10px 0;background:var(--navy);color:#fff}
.ct-switch-inner{max-width:1240px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ct-brand{display:flex;align-items:center;gap:10px;font-weight:700}
.ct-brand .dot{width:9px;height:9px;border-radius:50%;background:var(--cta)}
.ct-btns{display:flex;gap:6px;flex-wrap:wrap}
.ct-sw{padding:8px 16px;border-radius:999px;border:1.5px solid rgba(255,255,255,.25);background:transparent;color:#cfd8e3;font-weight:700;font-size:.82rem;cursor:pointer}
.ct-sw:hover{border-color:var(--cta);color:#fff}
.ct-sw.on{background:var(--cta);border-color:var(--cta);color:#fff}
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
  .ct-r3,.ct-r4{grid-template-columns:1fr 1fr}
  .ct-r-2-1,.ct-r-1-2{grid-template-columns:1fr}
}
@media (max-width:560px){
  .ct-r2,.ct-r3,.ct-r4{grid-template-columns:1fr}
  .ct-screen{padding:0 12px}
}
`;

export function CadastrosTelaUnica() {
  const [tela, setTela] = useState<"cliente" | "produto" | "empresa">("cliente");
  const [modal, setModal] = useState<null | "cliente" | "fornecedor">(null);
  const [tipoPre, setTipoPre] = useState<"pj" | "pf">("pj");
  const [tipoForn, setTipoForn] = useState<"pj" | "pf">("pj");
  const [preAddr, setPreAddr] = useState(false);
  const [fornAddr, setFornAddr] = useState(false);
  const [extra, setExtra] = useState<Record<string, string>>({
    cliente: "obs",
    produto: "obs",
    empresa: "danfe",
  });
  const [setores, setSetores] = useState(SETORES_INICIAIS);
  const [fornecedores, setFornecedores] = useState(FORNECEDORES_INICIAIS);
  const [setorQ, setSetorQ] = useState("Cadernos");
  const [fornQ, setFornQ] = useState("Papelaria Central Ltda");
  const [acAberto, setAcAberto] = useState<null | "setor" | "fornecedor">(null);

  const mostrarExtra = (tela_: string, chave: string) => setExtra((e) => ({ ...e, [tela_]: chave }));

  const filtrar = (lista: string[], q: string) => {
    const limpo = q.trim().toLowerCase();
    return limpo ? lista.filter((v) => v.toLowerCase().includes(limpo)) : [...lista].sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  const onCepCliente = async (e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    if (!data) return;
    const bairro = document.getElementById("ct-cli-bairro") as HTMLInputElement | null;
    const cidade = document.getElementById("ct-cli-cidade") as HTMLInputElement | null;
    const uf = document.getElementById("ct-cli-uf") as HTMLSelectElement | null;
    if (bairro && data.bairro) bairro.value = data.bairro;
    if (cidade && data.localidade) cidade.value = data.localidade;
    if (uf && data.uf) uf.value = data.uf;
  };

  const onCepEmpresa = async (e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    if (!data) return;
    const logr = document.getElementById("ct-emp-logradouro") as HTMLInputElement | null;
    const cidade = document.getElementById("ct-emp-cidade") as HTMLInputElement | null;
    const uf = document.getElementById("ct-emp-uf") as HTMLSelectElement | null;
    if (logr && data.logradouro) logr.value = data.logradouro;
    if (cidade && data.localidade) cidade.value = data.localidade;
    if (uf && data.uf) uf.value = data.uf;
  };

  const onCepModal = async (prefixo: "pre" | "forn", e: React.FocusEvent<HTMLInputElement>) => {
    const data = await buscarCep(e.target.value);
    const logr = document.getElementById(`ct-${prefixo}-logradouro`) as HTMLInputElement | null;
    const bairro = document.getElementById(`ct-${prefixo}-bairro`) as HTMLInputElement | null;
    const cidade = document.getElementById(`ct-${prefixo}-cidade`) as HTMLInputElement | null;
    if (data) {
      if (logr) logr.value = data.logradouro || "";
      if (bairro) bairro.value = data.bairro || "";
      if (cidade) cidade.value = `${data.localidade || ""}${data.uf ? "/" + data.uf : ""}`;
    }
    if (prefixo === "pre") setPreAddr(true);
    else setFornAddr(true);
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
  const iconeZap = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 5c0 8 7 15 15 15l3-4-6-3-2 2c-2-1-4-3-5-5l2-2-3-6z" /></svg>
  );
  const iconeCalendario = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 2v4M17 2v4M3 10h18" /></svg>
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

  const telaCliente = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title"><span className="eyebrow">Nuvem de Papel · Cliente</span><h1>Cadastro de pessoa</h1></div>
          <button className="ct-act primary" onClick={() => setModal("cliente")}>{iconePlus}Incluir</button>
          <button className="ct-act danger">{iconeLixeira}Apagar</button>
          <button className="ct-act">{iconeLupa}Pesquisar</button>
          <button className="ct-act">{iconeImpressora}Imprimir</button>
          <span className="ct-spacer" />
          <button className="ct-act">Vendas</button>
          <button className="ct-act">Extrato</button>
          <button className="ct-act">Orçamentos</button>
          <span className="ct-pill">Código 000042</span>
        </div>

        <div className="ct-grid">
          <div className="ct-main">
            <div className="ct-counters">
              <div className="code">CÓD. 000042</div>
              <div className="tot"><span className="k">Clientes total</span><b>318</b></div>
              <div className="ativ"><span className="k">Ativos</span><b>302</b></div>
              <div className="inat"><span className="k">Inativos</span><b>16</b></div>
            </div>

            <div className="ct-grp">
              <div className="ct-row ct-r1">
                <div className="ct-field"><label>Nome / Razão social<span className="ct-req">*</span></label><input defaultValue="Carla Beatriz Andrade Souza" /></div>
              </div>
              <div className="ct-row ct-r-2-1">
                <div className="ct-field"><label>Endereço (logradouro)</label><input defaultValue="Rua das Camélias" /></div>
                <div className="ct-field"><label>Número</label><input defaultValue="412" /></div>
              </div>
              <div className="ct-row ct-r-1-2">
                <div className="ct-field"><label>Complemento</label><input defaultValue="Apto 61" /></div>
                <div className="ct-field"><label>CEP <span className="ct-hint">busca automática</span></label><input defaultValue="09750-310" maxLength={9} onChange={(e) => (e.target.value = mascaraCep(e.target.value))} onBlur={onCepCliente} /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Bairro</label><input id="ct-cli-bairro" defaultValue="Jardim Silvina" /></div>
                <div className="ct-field"><label>Cidade</label><input id="ct-cli-cidade" defaultValue="São Bernardo do Campo" /></div>
                <div className="ct-field"><label>Estado</label><select id="ct-cli-uf" defaultValue="SP">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Documentos</p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>CPF/CNPJ</label><input defaultValue="123.456.789-10" maxLength={18} onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} onBlur={(e) => verificarDoc(e.target)} /><div className="ct-doc-msg" /></div>
                <div className="ct-field"><label>Identidade (RG)</label><input defaultValue="42.118.905-3" /></div>
                <div className="ct-field"><label>Profissão</label><input defaultValue="Professora" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Nascimento</label><input type="date" defaultValue="1988-04-12" /></div>
                <div className="ct-field"><label>Filiação</label><input defaultValue="Regina Andrade Souza" /></div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Contato</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Telefones</label><input defaultValue="(11) 4123-7788" maxLength={15} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
                <div className="ct-field"><label>Celular / WhatsApp</label><input defaultValue="(11) 9 8877-2244" maxLength={16} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>E-mail</label><input defaultValue="carla.andrade@exemplo.com.br" /></div>
                <div className="ct-field"><label>Vendedor</label><select><option>Equipe Nuvem de Papel</option></select></div>
              </div>
            </div>

            <div className="ct-grp">
              <div className="ct-row ct-r2">
                <div className="ct-radio-group"><span className="rg-label">Pessoa</span>
                  <label className="ct-radio-opt"><input type="radio" name="pessoa" defaultChecked />Física</label>
                  <label className="ct-radio-opt"><input type="radio" name="pessoa" />Jurídica</label>
                </div>
                <div className="ct-radio-group"><span className="rg-label">Ordenar por</span>
                  <label className="ct-radio-opt"><input type="radio" name="ordem" defaultChecked />Nome</label>
                  <label className="ct-radio-opt"><input type="radio" name="ordem" />CPF/CNPJ</label>
                  <label className="ct-radio-opt"><input type="radio" name="ordem" />Código</label>
                </div>
              </div>
            </div>

            <label className="ct-checkline"><input type="checkbox" />Bloquear atendimento para este cliente</label>
          </div>

          <div className="ct-side">
            <div className="ct-grp" style={{ marginBottom: 0 }}>
              <p className="ct-grp-label">Situação comercial</p>
              <div className="ct-row ct-r1"><div className="ct-field"><label>Tipo de cliente</label><select><option>Consumidor final</option><option>Revenda</option></select></div></div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Limite de crédito</label><input defaultValue="R$ 0,00" /></div>
                <div className="ct-field"><label>Data do cadastro</label><input type="date" defaultValue="2026-02-18" disabled style={{ opacity: 0.7 }} /></div>
              </div>
              <span className="ct-pill ok">Em dia</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="ct-act" style={{ width: "100%", justifyContent: "center" }}>{iconeZap}Mensagem WhatsApp</button>
              <button className="ct-act" style={{ width: "100%", justifyContent: "center" }}>{iconeCalendario}Ver histórico</button>
            </div>

            {abasExtra(
              "cliente",
              [
                { id: "obs", label: "Observações" },
                { id: "net", label: "Internet" },
                { id: "outros", label: "Outros dados" },
                { id: "foto", label: "Foto" },
              ],
              {
                obs: <div className="ct-field"><textarea placeholder="Observações internas..." defaultValue="Prefere ser atendida à tarde. Compra sempre à vista." /></div>,
                net: (
                  <div className="ct-row ct-r1">
                    <div className="ct-field"><label>Site</label><input placeholder="https://" /></div>
                    <div className="ct-field"><label>E-mail alternativo</label><input placeholder="opcional" /></div>
                  </div>
                ),
                outros: (
                  <>
                    <div className="ct-row ct-r2">
                      <div className="ct-field"><label>Cartão de crédito</label><select><option>Nenhum</option></select></div>
                      <div className="ct-field"><label>Número</label><input placeholder="**** **** **** ****" /></div>
                    </div>
                    <div className="ct-row ct-r2">
                      <div className="ct-field"><label>Validade</label><input placeholder="MM/AA" /></div>
                      <div className="ct-field"><label>Nome impresso</label><input placeholder="Nome no cartão" /></div>
                    </div>
                    <div className="ct-row ct-r1"><div className="ct-field"><label>Referências bancárias</label><input placeholder="Banco, agência..." /></div></div>
                    <div className="ct-row ct-r1"><div className="ct-field"><label>Atividade principal</label><input placeholder="ex.: Educação" /></div></div>
                    <div className="ct-row ct-r1"><div className="ct-field"><label>Referências comerciais</label><input placeholder="Fornecedores/lojas" /></div></div>
                  </>
                ),
                foto: (
                  <>
                    <div className="ct-photo">{iconeFoto}Sem foto</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="ct-act" style={{ flex: 1, justifyContent: "center" }}>Alterar</button>
                      <button className="ct-act" style={{ flex: 1, justifyContent: "center" }}>Apagar</button>
                    </div>
                  </>
                ),
              }
            )}
          </div>
        </div>

        <div className="ct-status"><span>Este é um cadastro de exemplo</span></div>
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
          <button className="ct-act primary">{iconePlus}Incluir</button>
          <button className="ct-act danger">{iconeLixeira}Apagar</button>
          <button className="ct-act">{iconeLupa}Pesquisar</button>
          <button className="ct-act">{iconeImpressora}Imprimir</button>
          <span className="ct-spacer" />
          <span className="ct-pill strong">318 produtos</span>
        </div>

        <div className="ct-grid">
          <div className="ct-main">
            <div className="ct-grp">
              <div className="ct-row ct-r4">
                <div className="ct-field"><label>Código</label><input defaultValue="000148" /></div>
                <div className="ct-field" style={{ gridColumn: "span 2" }}><label>Descrição do produto<span className="ct-req">*</span></label><input id="ct-prod-descricao" defaultValue="CADERNO ESPIRAL 96 FOLHAS COLUNA FINA" /></div>
                <div className="ct-field"><label>Código interno</label><input defaultValue="CADER-0148" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Código de barras (GTIN) <span className="ct-hint">busca automática</span></label><input id="ct-prod-gtin" defaultValue="7898943477996" maxLength={14} onChange={(e) => (e.target.value = somenteDigitos(e.target.value, 14))} onBlur={onGtin} /><div className="ct-doc-msg" /></div>
                <div className="ct-field ct-ac">
                  <label>Setor <span className="ct-hint">busca ou cadastra na hora</span></label>
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
                  <label>Fornecedor <span className="ct-hint">busca ou cadastra na hora</span></label>
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
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Fabricante</label><input defaultValue="Gráfica São José" /></div>
                <div className="ct-field"><label>Unidade</label><select><option>UN — Unidade</option></select></div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Financeiro e estoque</p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Preço de custo</label><input defaultValue="R$ 12,40" /></div>
                <div className="ct-field"><label>Margem de lucro</label><input defaultValue="47,00%" /></div>
                <div className="ct-field"><label>Preço de venda</label><input defaultValue="R$ 24,90" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>Qtd. mínima</label><input defaultValue="5" /></div>
                <div className="ct-field"><label>Qtd. atual em estoque</label><input defaultValue="24" /></div>
                <div className="ct-field"><label>Data último reajuste</label><input type="date" defaultValue="2026-08-20" /></div>
              </div>
            </div>

            <div className="ct-row ct-r2">
              <label className="ct-checkline"><input type="checkbox" />Não imprimir na tabela de preços</label>
              <label className="ct-checkline"><input type="checkbox" />Inativo</label>
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
                <div className="ct-field"><label>Origem</label><select id="ct-prod-origem"><option>0 — Nacional</option></select></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>ICMS interno</label><input id="ct-prod-icms" defaultValue="18,00%" /></div>
                <div className="ct-field"><label>Base de cálculo</label><input id="ct-prod-base" defaultValue="100,00%" /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>IPI</label><input id="ct-prod-ipi" defaultValue="0,00%" /></div>
                <div className="ct-field"><label>CST PIS</label><input id="ct-prod-cstpis" defaultValue="49" /></div>
                <div className="ct-field"><label>CST Cofins</label><input id="ct-prod-cstcofins" defaultValue="49" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Peso bruto</label><input id="ct-prod-pesobruto" defaultValue="0,320" /></div>
                <div className="ct-field"><label>Peso líquido</label><input id="ct-prod-pesoliquido" defaultValue="0,300" /></div>
              </div>
            </div>

            <div className="ct-side-tabs" style={{ marginTop: 14 }}>
              <div className="ct-extra-tabs">
                <button className={`ct-extra-tab${extra.produto === "obs" ? " on" : ""}`} onClick={() => mostrarExtra("produto", "obs")}>1. Observações</button>
                <button className={`ct-extra-tab${extra.produto === "foto" ? " on" : ""}`} onClick={() => mostrarExtra("produto", "foto")}>2. Foto</button>
                <button className={`ct-extra-tab${extra.produto === "outros" ? " on" : ""}`} onClick={() => mostrarExtra("produto", "outros")}>3. Outros</button>
              </div>
              <div className={`ct-extra-panel${extra.produto === "obs" ? " on" : ""}`}>
                <div className="ct-field"><textarea placeholder="Observações internas..." defaultValue="Coleção escolar — reforçar giro em jan/fev." /></div>
              </div>
              <div className={`ct-extra-panel${extra.produto === "foto" ? " on" : ""}`}>
                <div className="ct-photo">{iconeFoto}Sem foto</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="ct-act" style={{ flex: 1, justifyContent: "center" }}>Alterar</button>
                  <button className="ct-act" style={{ flex: 1, justifyContent: "center" }}>Apagar</button>
                </div>
              </div>
              <div className={`ct-extra-panel${extra.produto === "outros" ? " on" : ""}`}>
                <div className="ct-row ct-r1"><div className="ct-field"><label>GTIN tributável</label><input defaultValue="7898943477996" /></div></div>
                <div className="ct-row ct-r1"><div className="ct-field"><label>Previsão de chegada</label><input type="date" /></div></div>
                <div className="ct-row ct-r1"><div className="ct-field"><label>Origem do produto</label><select><option>Fabricação própria</option><option>Revenda</option></select></div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="ct-status"><span>Este é um cadastro de exemplo</span></div>
      </div>
    </div>
  );

  const telaEmpresa = (
    <div className="ct-screen">
      <div className="ct-window">
        <div className="ct-header">
          <div className="ct-h-title"><span className="eyebrow">Nuvem de Papel · Configuração fiscal</span><h1>Cadastro da empresa emitente</h1></div>
          <button className="ct-act primary">{iconeCheck}Salvar</button>
          <button className="ct-act">Configurar CSC</button>
          <span className="ct-spacer" />
          <span className="ct-pill ok">Homologação ok</span>
        </div>

        <div className="ct-grid ct-eq">
          <div className="ct-main">
            <div className="ct-grp">
              <p className="ct-grp-label">Dados da empresa emitente</p>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>CNPJ</label><input defaultValue="49.163.008/0001-68" maxLength={18} onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} onBlur={(e) => verificarDoc(e.target)} /><div className="ct-doc-msg" /></div>
                <div className="ct-field"><label>Inscrição Estadual</label><input placeholder="000.000.000.000" /></div>
                <div className="ct-field"><label>Regime tributário</label><select><option>Simples Nacional</option><option>Normal</option><option>MEI</option></select></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Razão social</label><input defaultValue="CR COMERCIO E EXPORTACAO LTDA" /></div>
                <div className="ct-field"><label>Nome fantasia</label><input defaultValue="Nuvem de Papel" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>E-mail</label><input defaultValue="contato@nuvemdepapel.com.br" /></div>
                <div className="ct-field"><label>Telefone</label><input defaultValue="(19) 99363-1145" maxLength={15} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
              </div>
              <div className="ct-row ct-r3">
                <div className="ct-field"><label>CEP</label><input defaultValue="13405-404" maxLength={9} onChange={(e) => (e.target.value = mascaraCep(e.target.value))} onBlur={onCepEmpresa} /></div>
                <div className="ct-field"><label>Estado</label><select id="ct-emp-uf" defaultValue="SP">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
                <div className="ct-field"><label>Município</label><input id="ct-emp-cidade" defaultValue="Piracicaba" /></div>
              </div>
              <div className="ct-row ct-r-2-1">
                <div className="ct-field"><label>Logradouro</label><input id="ct-emp-logradouro" defaultValue="Travessa Colonial" /></div>
                <div className="ct-field"><label>Número</label><input defaultValue="56" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Complemento</label><input defaultValue="Jardim Algodoal" /></div>
                <div className="ct-field"><label>Site na internet</label><input defaultValue="https://nuvem-de-papel.vercel.app" /></div>
              </div>
              <div className="ct-row ct-r1">
                <div className="ct-radio-group"><span className="rg-label">Ambiente de emissão</span>
                  <label className="ct-radio-opt"><input type="radio" name="amb" />Homologação (testes)</label>
                  <label className="ct-radio-opt"><input type="radio" name="amb" defaultChecked />Produção</label>
                </div>
              </div>
            </div>

            <div className="ct-grp">
              <p className="ct-grp-label">Numeração NFC-e</p>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Nº nota — Homologação</label><input defaultValue="1" /></div>
                <div className="ct-field"><label>Nº nota — Produção</label><input defaultValue="4" /></div>
              </div>
              <div className="ct-row ct-r2">
                <div className="ct-field"><label>Série — Homologação</label><input defaultValue="1" /></div>
                <div className="ct-field"><label>Série — Produção</label><input defaultValue="1" /></div>
              </div>
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
              <div className="ct-row ct-r1"><div className="ct-field"><label>CFOP padrão na emissão</label><select><option>5.102</option></select></div></div>
              <label className="ct-checkline" style={{ marginBottom: 8 }}><input type="checkbox" defaultChecked />Pedir CPF/CNPJ antes da emissão</label>
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

        <div className="ct-status"><span>Este é um cadastro de exemplo — nenhum certificado ou CSC real aparece aqui</span></div>
      </div>
    </div>
  );

  return (
    <div>
      <style>{css}</style>

      <nav className="ct-switch">
        <div className="ct-switch-inner">
          <div className="ct-brand"><span className="dot" />Nuvem de Papel · Cadastros</div>
          <div className="ct-btns">
            <button className={`ct-sw${tela === "cliente" ? " on" : ""}`} onClick={() => setTela("cliente")}>Cadastro Cliente</button>
            <button className={`ct-sw${tela === "produto" ? " on" : ""}`} onClick={() => setTela("produto")}>Cadastro Produto</button>
            <button className={`ct-sw${tela === "empresa" ? " on" : ""}`} onClick={() => setTela("empresa")}>Dados Cadastrais Empresa</button>
          </div>
        </div>
      </nav>

      {tela === "cliente" && telaCliente}
      {tela === "produto" && telaProduto}
      {tela === "empresa" && telaEmpresa}

      {modal === "cliente" && (
        <div className="ct-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="ct-modal">
            <div className="ct-modal-head"><h2>Inclusão de cliente</h2><button className="ct-modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="ct-modal-body">
              <div className="ct-radio-group" style={{ marginBottom: 14 }}>
                <span className="rg-label">Tipo de cliente</span>
                <label className="ct-radio-opt"><input type="radio" name="pre-tipo" checked={tipoPre === "pj"} onChange={() => setTipoPre("pj")} />Pessoa jurídica</label>
                <label className="ct-radio-opt"><input type="radio" name="pre-tipo" checked={tipoPre === "pf"} onChange={() => setTipoPre("pf")} />Pessoa física</label>
              </div>
              <div className="ct-row ct-r2" style={{ marginBottom: 12 }}>
                <div className="ct-field">
                  <label>{tipoPre === "pj" ? "CNPJ" : "CPF"}</label>
                  <input key={tipoPre} placeholder={tipoPre === "pj" ? "00.000.000/0000-00" : "000.000.000-00"} onChange={(e) => (e.target.value = mascaraDoc(e.target.value))} onBlur={(e) => verificarDoc(e.target)} />
                  <div className="ct-doc-msg" />
                </div>
                <div className="ct-field"><label>Telefone</label><input placeholder="(00) 00000-0000" maxLength={15} onChange={(e) => (e.target.value = mascaraTelefone(e.target.value))} /></div>
              </div>
              <label className="ct-checkline" style={{ marginBottom: 14 }}><input type="checkbox" defaultChecked />Obter dados da Receita Federal</label>
              <div className="ct-row ct-r1" style={{ marginBottom: 12 }}>
                <div className="ct-field"><label>CEP <span className="ct-hint">busca automática</span></label><input placeholder="00000-000" maxLength={9} onChange={(e) => (e.target.value = mascaraCep(e.target.value))} onBlur={(e) => onCepModal("pre", e)} /></div>
              </div>
              <div className={`ct-addr-box${preAddr ? " on" : ""}`}>
                <div className="ct-row ct-r1" style={{ marginBottom: 12 }}><div className="ct-field"><label>Logradouro</label><input id="ct-pre-logradouro" /></div></div>
                <div className="ct-row ct-r3" style={{ marginBottom: 12 }}>
                  <div className="ct-field"><label>Número</label><input id="ct-pre-numero" placeholder="Nº" /></div>
                  <div className="ct-field"><label>Bairro</label><input id="ct-pre-bairro" /></div>
                  <div className="ct-field"><label>Cidade/UF</label><input id="ct-pre-cidade" /></div>
                </div>
              </div>
              <div className="ct-row ct-r1"><div className="ct-field"><label>E-mail</label><input placeholder="opcional" /></div></div>
              <p className="ct-lookup-note">Ao continuar, buscamos CNPJ/CEP e trazemos os dados já preenchidos no cadastro completo — só confirmar ou corrigir.</p>
            </div>
            <div className="ct-modal-foot">
              <button className="ct-act" onClick={() => setModal(null)}>Cancelar</button>
              <button className="ct-act primary" onClick={() => setModal(null)}>{iconeCheck}Continuar</button>
            </div>
          </div>
        </div>
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
