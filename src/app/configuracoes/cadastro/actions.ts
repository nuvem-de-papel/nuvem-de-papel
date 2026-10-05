"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Cadastros (F8.1): a empresa emitente e o produto passaram a persistir de
// verdade (antes eram formularios de exemplo hardcoded). Escrita deny-all no
// banco - tudo via service_role; GTIN/CNPJ validados no servidor (e o banco
// tem o mesmo check de GTIN por cima).

export type ResultadoAcao = { ok: true; aviso?: string } | { ok: false; erro: string };

async function gestaoAtual(): Promise<{ id: string; role: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) {
    return null;
  }
  return profile;
}

async function auditar(
  admin: ReturnType<typeof createAdminClient>,
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  depois: Record<string, unknown>
): Promise<void> {
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: actor,
    action,
    entity,
    entity_id: entityId,
    after: depois,
  });
}

const digitos = (v: string) => (v ?? "").replace(/\D/g, "");

// validacao GS1 (mesma regra da funcao ean_dv_valido do banco)
function eanValido(valor: string): boolean {
  const d = digitos(valor);
  if (!/^([0-9]{8}|[0-9]{13})$/.test(d)) return false;
  let soma = 0;
  let peso = 3;
  for (let i = d.length - 2; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 3 ? 1 : 3;
  }
  const dv = (10 - (soma % 10)) % 10;
  return dv === Number(d[d.length - 1]);
}

function cnpjValido(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, dig, i) => acc + Number(dig) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const dv1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calc(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(c[12]) && dv2 === Number(c[13]);
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

export type EmpresaInput = {
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

export async function salvarEmpresa(input: EmpresaInput): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const razaoSocial = (input.razaoSocial ?? "").trim();
  const cnpj = digitos(input.cnpj ?? "");
  const regime = (input.regime ?? "simples").toLowerCase();
  const ambiente = (input.ambiente ?? "homologacao").toLowerCase();
  const serieNfe = Math.floor(Number(input.serieNfe ?? 1));
  const serieNfce = Math.floor(Number(input.serieNfce ?? 1));
  const cfop = digitos(input.cfopPadrao ?? "");

  if (razaoSocial.length < 2) return { ok: false, erro: "Informe a razão social." };
  if (!cnpjValido(cnpj)) return { ok: false, erro: "CNPJ inválido (checar dígitos)." };
  if (!["simples", "normal", "mei"].includes(regime)) {
    return { ok: false, erro: "Regime tributário inválido." };
  }
  if (!["homologacao", "producao"].includes(ambiente)) {
    return { ok: false, erro: "Ambiente de emissão inválido." };
  }
  if (!Number.isFinite(serieNfe) || serieNfe < 1 || serieNfe > 999) {
    return { ok: false, erro: "Série NF-e inválida." };
  }
  if (!Number.isFinite(serieNfce) || serieNfce < 1 || serieNfce > 999) {
    return { ok: false, erro: "Série NFC-e inválida." };
  }
  if (!/^[0-9]{4}$/.test(cfop)) return { ok: false, erro: "CFOP padrão inválido (4 dígitos)." };

  const admin = createAdminClient();
  const { error: errCompany } = await admin.from("tenant_company").upsert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    razao_social: razaoSocial,
    fantasia: (input.fantasia ?? "").trim(),
    cnpj,
    ie: (input.ie ?? "").trim(),
    im: (input.im ?? "").trim(),
    regime,
    email: (input.email ?? "").trim(),
    telefone: (input.telefone ?? "").trim(),
    endereco: {
      cep: digitos(input.cep ?? ""),
      uf: (input.uf ?? "").trim(),
      cidade: (input.cidade ?? "").trim(),
      logradouro: (input.logradouro ?? "").trim(),
      numero: (input.numero ?? "").trim(),
      bairro: (input.bairro ?? "").trim(),
      complemento: (input.complemento ?? "").trim(),
    },
    site: (input.site ?? "").trim(),
    updated_at: new Date().toISOString(),
    updated_by: gestor.id,
  });
  if (errCompany) return { ok: false, erro: `Falha ao salvar a empresa: ${errCompany.message}` };

  const { error: errSefaz } = await admin.from("sefaz_config").upsert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    ambiente,
    serie_nfe: serieNfe,
    serie_nfce: serieNfce,
    cfop_padrao: cfop,
    pedir_documento: !!input.pedirDocumento,
    updated_at: new Date().toISOString(),
  });
  if (errSefaz) return { ok: false, erro: `Falha ao salvar a emissão: ${errSefaz.message}` };

  await auditar(admin, gestor.id, "empresa.atualizada", "tenant_company", NUVEM_DE_PAPEL_TENANT_ID, {
    cnpj,
    regime,
    ambiente,
  });

  revalidatePath("/configuracoes/cadastro");
  return { ok: true };
}

export type ProdutoInput = {
  id?: string;
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
  icmsPct: string;
  ipiPct: string;
  pesoLiquido: string;
  pesoBruto: string;
  precoCusto: string;
  precoVenda: string;
  minStock: string;
  margemPct: string;
};

export async function salvarProduto(input: ProdutoInput): Promise<ResultadoAcao & { id?: string }> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const sku = (input.sku ?? "").trim();
  const nome = (input.nome ?? "").trim();
  const categoria = (input.categoria ?? "").trim();
  const gtin = digitos(input.gtin ?? "");
  const ncm = digitos(input.ncm ?? "");
  const csosn = digitos(input.csosn ?? "");
  const cest = digitos(input.cest ?? "");
  const origem = digitos(input.origem ?? "") || "0";
  const unit = (input.unit ?? "UN").trim().toUpperCase();
  const cf = (v: string, min: number, max: number) => num(v, min, max);

  if (!/^[A-Za-z0-9._-]{2,40}$/.test(sku)) {
    return { ok: false, erro: "Código interno (SKU) inválido: use 2-40 letras/números, . _ -" };
  }
  if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "Descrição do produto inválida." };
  if (gtin && !eanValido(gtin)) {
    return { ok: false, erro: "Código de barras (GTIN) inválido: DV não confere (8 ou 13 dígitos)." };
  }
  if (ncm && !/^[0-9]{8}$/.test(ncm)) return { ok: false, erro: "NCM precisa de 8 dígitos." };
  if (csosn && !/^[0-9]{3}$/.test(csosn)) return { ok: false, erro: "CSOSN precisa de 3 dígitos." };
  if (cest && !/^[0-9]{7}$/.test(cest)) return { ok: false, erro: "CEST precisa de 7 dígitos." };
  if (!/^[0-7]$/.test(origem)) return { ok: false, erro: "Origem da mercadoria inválida (0-7)." };
  if (unit.length < 1 || unit.length > 6) return { ok: false, erro: "Unidade comercial inválida (até 6)." };

  const icms = cf(input.icmsPct, 0, 100);
  const ipi = cf(input.ipiPct, 0, 100);
  const pesoLiq = cf(input.pesoLiquido, 0, 99999);
  const pesoBru = cf(input.pesoBruto, 0, 99999);
  const custo = cf(input.precoCusto, 0, 9999999);
  const venda = cf(input.precoVenda, 0.01, 9999999);
  const minStock = cf(input.minStock, 0, 9999999);
  const margem = cf(input.margemPct, 0, 9999);
  if (
    icms === null || ipi === null || pesoLiq === null || pesoBru === null ||
    custo === null || venda === null || minStock === null || margem === null
  ) {
    return { ok: false, erro: "Confira preço, estoque, tributos e pesos (valores fora do intervalo)." };
  }

  const admin = createAdminClient();

  let itemId = input.id && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : null;
  const eraNovo = itemId === null;

  if (itemId) {
    const { error } = await admin
      .from("catalog_items")
      .update({ sku, name: nome, category: categoria || null, active: input.ativo })
      .eq("id", itemId);
    if (error) {
      if (/duplicate/i.test(error.message)) return { ok: false, erro: "Já existe produto com este código interno." };
      return { ok: false, erro: `Falha ao atualizar o produto: ${error.message}` };
    }
  } else {
    const { data, error } = await admin
      .from("catalog_items")
      .insert({
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        sku,
        name: nome,
        category: categoria || null,
        active: input.ativo,
      })
      .select("id")
      .single();
    if (error) {
      if (/duplicate/i.test(error.message)) return { ok: false, erro: "Já existe produto com este código interno." };
      return { ok: false, erro: `Falha ao criar o produto: ${error.message}` };
    }
    itemId = data.id;
  }

  const { error: errFiscal } = await admin.from("item_fiscal_data").upsert({
    item_id: itemId,
    gtin: gtin || null,
    ncm: ncm || null,
    cst_csosn: csosn || null,
    cest: cest || null,
    origem,
    unit,
    icms_rate: icms,
    ipi_rate: ipi,
    weight_kg: pesoLiq,
    weight_gross_kg: pesoBru,
  });
  if (errFiscal) {
    if (/duplicate/i.test(errFiscal.message)) {
      return { ok: false, erro: "Este GTIN já está cadastrado em outro produto." };
    }
    return { ok: false, erro: `Falha nos dados fiscais: ${errFiscal.message}` };
  }

  const { error: errCom } = await admin.from("item_commercial_data").upsert({
    item_id: itemId,
    cost_price: custo,
    margin_percent: margem,
    min_stock: Math.floor(minStock),
  });
  if (errCom) return { ok: false, erro: `Falha nos dados comerciais: ${errCom.message}` };

  // A faixa 1 do varejo e a base do produto. A PK de item_prices inclui
  // valid_from, entao um upsert "cego" criaria uma SEGUNDA linha para a mesma
  // faixa e o checkout passaria a escolher preco de forma indefinida - por isso
  // a Tabela de precos (/configuracoes/precos) mantem UMA linha por faixa.
  // Grava sempre na linha base existente e, em seguida, apaga as demais.
  const { data: baseExistente } = await admin
    .from("item_prices")
    .select("valid_from")
    .eq("item_id", itemId)
    .eq("channel", "varejo")
    .eq("min_quantity", 1)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const vigenciaBase = baseExistente?.valid_from
    ? String(baseExistente.valid_from).slice(0, 10)
    : "1970-01-01";

  const { error: errPrice } = await admin.from("item_prices").upsert(
    {
      item_id: itemId,
      channel: "varejo",
      price: venda,
      min_quantity: 1,
      valid_from: vigenciaBase,
    },
    { onConflict: "item_id,channel,min_quantity,valid_from" }
  );
  if (errPrice) return { ok: false, erro: `Falha no preço de venda: ${errPrice.message}` };

  // consolida a faixa 1 do varejo: sobra apenas a linha que acabou de ser
  // gravada (as outras, inclusive a de 1970, saem daqui).
  const { error: errLimpaPreco } = await admin
    .from("item_prices")
    .delete()
    .eq("item_id", itemId)
    .eq("channel", "varejo")
    .eq("min_quantity", 1)
    .neq("valid_from", vigenciaBase);
  if (errLimpaPreco) {
    return { ok: false, erro: `Falha ao consolidar o preco: ${errLimpaPreco.message}` };
  }

  await auditar(admin, gestor.id, eraNovo ? "produto.criado" : "produto.atualizado", "catalog_items", itemId, {
    sku,
    nome,
    gtin: gtin || null,
  });

  revalidatePath("/configuracoes/cadastro");
  revalidatePath("/produtos");
  return { ok: true, id: itemId ?? undefined };
}

// ---------------------------------------------------------------------------
// Bloco 5 - passo 3: cadastro de cliente FUNCIONAL (antes era formulario de
// exemplo hardcoded, com campos que nao gravavam nada).
//
// Regras do proprio banco (migration 0003):
//   * customers.email e NOT NULL + unique(tenant_id,email) -> e-mail obrigatorio
//     e conflito 23505 vira mensagem amigavel;
//   * customers.tier nasce em bronze e so aceita bronze/prata/ouro/diamante;
//   * orders.customer_id e FK on delete restrict -> cliente com pedido nao sai.
//
// Endereco, telefone, nascimento etc. NAO existem na tabela e ficaram FORA da
// tela de proposito: mostrar campo que nao grava e mentira para o usuario.
// ---------------------------------------------------------------------------

export type ClienteInput = {
  id?: string | null;
  nome: string;
  email: string;
  documento?: string;
  ie?: string;
  uf?: string;
  tier?: string;
  pontos?: number | string;
};

const TIERS_VALIDOS = ["bronze", "prata", "ouro", "diamante"];
const UFS_VALIDAS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI",
  "RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_CLIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cpfValido(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(c.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[9]) && d2 === Number(c[10]);
}

function erroDeGravacao(error: { code?: string; message?: string } | null): string {
  if (!error) return "Falha ao gravar o cliente.";
  if (error.code === "23505") return "Já existe um cliente com este e-mail.";
  if (error.code === "23514") return "Valor fora do que o banco permite.";
  if (error.code === "23502") return "Campo obrigatório em falta (provável e-mail).";
  return `Falha ao gravar o cliente: ${error.message ?? "desconhecida"}`;
}

export async function salvarCliente(input: ClienteInput): Promise<ResultadoAcao & { id?: string }> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para cadastrar clientes." };

  const nome = String(input?.nome ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (nome.length < 3 || nome.length > 160) {
    return { ok: false, erro: "Nome do cliente precisa de 3 a 160 caracteres." };
  }

  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, erro: "Informe o e-mail do cliente." };
  if (email.length > 254 || !RE_EMAIL.test(email)) return { ok: false, erro: "E-mail inválido." };

  const tier = String(input?.tier ?? "bronze");
  if (!TIERS_VALIDOS.includes(tier)) return { ok: false, erro: "Nível do cliente inválido." };

  const documento = digitos(input?.documento ?? "");
  if (documento) {
    const okDoc =
      documento.length === 11 ? cpfValido(documento) : documento.length === 14 && cnpjValido(documento);
    if (!okDoc) return { ok: false, erro: "CPF/CNPJ inválido: confira os dígitos." };
  }

  const ie = String(input?.ie ?? "")
    .replace(/[^0-9A-Za-z./-]/g, "")
    .slice(0, 20);
  const uf = String(input?.uf ?? "").trim().toUpperCase();
  if (uf && !UFS_VALIDAS.includes(uf)) return { ok: false, erro: "Estado (UF) inválido." };

  const pontos = Number(input?.pontos ?? 0);
  if (!Number.isInteger(pontos) || pontos < 0 || pontos > 1000000000) {
    return { ok: false, erro: "Pontos precisa ser inteiro, de 0 a 1.000.000.000." };
  }

  const id = typeof input?.id === "string" && input.id ? input.id : null;
  if (id && !UUID_CLIENTE.test(id)) return { ok: false, erro: "Cliente inválido." };

  const registro = {
    name: nome,
    email,
    documento: documento || null,
    ie: ie || null,
    uf: uf || null,
    tier,
    points: pontos,
  };

  const admin = createAdminClient();
  let salvoId: string | null = id;

  if (id) {
    const { data, error } = await admin
      .from("customers")
      .update(registro)
      .eq("id", id)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, erro: erroDeGravacao(error) };
    if (!data) return { ok: false, erro: "Cliente não encontrado." };
    salvoId = data.id;
  } else {
    const { data, error } = await admin
      .from("customers")
      .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, ...registro })
      .select("id")
      .single();
    if (error || !data) return { ok: false, erro: erroDeGravacao(error) };
    salvoId = data.id;
  }

  await auditar(
    admin,
    gestor.id,
    id ? "cliente.atualizado" : "cliente.criado",
    "customers",
    salvoId,
    registro
  );

  revalidatePath("/configuracoes/cadastro");
  revalidatePath("/crm");
  revalidatePath("/vendas");
  return { ok: true, id: salvoId ?? undefined };
}

export async function removerCliente(input: { id: string }): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para excluir clientes." };

  const id = String(input?.id ?? "");
  if (!UUID_CLIENTE.test(id)) return { ok: false, erro: "Cliente inválido." };

  const admin = createAdminClient();
  const { data: antes } = await admin
    .from("customers")
    .select("name, email")
    .eq("id", id)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!antes) return { ok: false, erro: "Cliente não encontrado." };

  const { error } = await admin
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) {
    if (error.code === "23503") {
      return { ok: false, erro: "Este cliente tem pedidos vinculados e não pode ser excluído." };
    }
    return { ok: false, erro: `Falha ao excluir: ${error.message}` };
  }

  // audit_log guarda apenas "depois"; numa exclusao o conteudo apagado e o que
  // interessa a trilha.
  await auditar(admin, gestor.id, "cliente.removido", "customers", id, {
    removido: antes,
  });

  revalidatePath("/configuracoes/cadastro");
  revalidatePath("/crm");
  revalidatePath("/vendas");
  return { ok: true };
}
