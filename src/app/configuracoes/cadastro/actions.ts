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

// DUN-14 (ITF-14) tem DV proprio calculado sobre 14 digitos - NAO e o mesmo
// do GTIN-13 embutido (tirar o 1 da esquerda nao bate). Ex.: master
// 17891027354944 e DUN-14 valido; a raiz 7891027354944 NAO e GTIN-13 valido.
// Mesma regra da funcao dun14_dv_valido do banco (0031).
function dun14Valido(valor: string): boolean {
  const d = digitos(valor);
  if (!/^[0-9]{14}$/.test(d)) return false;
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
  // Bloco 2 (0031): campos que antes eram "fantasma" no form - agora gravam.
  fabricante: string;
  observacoes: string;
  cstPis: string;
  cstCofins: string;
  icmsBasePct: string;
  cstIbsCbs: string;
  cclassTrib: string;
  gtinTributavel: string;
  // Bloco 2 (0031): ficha do fornecedor + embalagem (item_supplier_data).
  fornecedorNome: string;
  supplierSku: string;
  refFabricante: string;
  packQty: string;
  masterQty: string;
  gtinInner: string;
  gtinMaster: string;
  embComprimento: string;
  embAltura: string;
  embLargura: string;
  embPeso: string;
  masterComprimento: string;
  masterAltura: string;
  masterLargura: string;
  masterPeso: string;
  sourceUrl: string;
  hidePriceTable: boolean;
  lastAdjustedAt: string;
  // 0032: foto do produto (URL servida pelo fornecedor, ex. Reval /imagem/...)
  fotoUrl: string;
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

  // Bloco 2 (0031): campos novos - texto solto, dígitos e números opcionais.
  const fabricante = (input.fabricante ?? "").trim().slice(0, 80);
  const observacoes = (input.observacoes ?? "").trim().slice(0, 4000);
  const cstPis = digitos(input.cstPis ?? "");
  const cstCofins = digitos(input.cstCofins ?? "");
  const cstIbsCbs = digitos(input.cstIbsCbs ?? "");
  const cclassTrib = digitos(input.cclassTrib ?? "");
  const gtinTrib = digitos(input.gtinTributavel ?? "");
  const icmsBase = cf(input.icmsBasePct, 0, 100);
  const hidePriceTable = input.hidePriceTable === true;
  const lastAdj = (input.lastAdjustedAt ?? "").trim();
  if (lastAdj && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(lastAdj)) {
    return { ok: false, erro: "Data do último reajuste inválida." };
  }

  // 0032: foto do produto (URL servida pelo fornecedor). O banco so aceita
  // https + extensão de imagem, então valida aqui pra não gravar lixo.
  const fotoUrl = (input.fotoUrl ?? "").trim().slice(0, 500);
  if (fotoUrl && !/^https:\/\/\S+\.(jpg|jpeg|png|webp)(\?\S*)?$/i.test(fotoUrl)) {
    return { ok: false, erro: "Foto inválida: use uma URL https terminada em .jpg, .png ou .webp." };
  }

  const fornecedorNome = (input.fornecedorNome ?? "").trim().slice(0, 120);
  const supplierSku = (input.supplierSku ?? "").trim().slice(0, 40);
  const refFabricante = (input.refFabricante ?? "").trim().slice(0, 40);
  const gtinInner = digitos(input.gtinInner ?? "");
  const gtinMaster = digitos(input.gtinMaster ?? "");
  const sourceUrl = (input.sourceUrl ?? "").trim().slice(0, 500);
  const packQty = cf(input.packQty, 1, 99999);
  const masterQty = cf(input.masterQty, 1, 99999);
  const embComp = cf(input.embComprimento, 0, 9999);
  const embAlt = cf(input.embAltura, 0, 9999);
  const embLarg = cf(input.embLargura, 0, 9999);
  const embPeso = cf(input.embPeso, 0, 99999);
  const mstComp = cf(input.masterComprimento, 0, 9999);
  const mstAlt = cf(input.masterAltura, 0, 9999);
  const mstLarg = cf(input.masterLargura, 0, 9999);
  const mstPeso = cf(input.masterPeso, 0, 99999);

  if (cstPis && !/^[0-9]{2}$/.test(cstPis)) return { ok: false, erro: "CST PIS precisa de 2 dígitos (ex.: 01, 49)." };
  if (cstCofins && !/^[0-9]{2}$/.test(cstCofins)) return { ok: false, erro: "CST Cofins precisa de 2 dígitos (ex.: 01, 49)." };
  if (cstIbsCbs && !/^[0-9]{3}$/.test(cstIbsCbs)) return { ok: false, erro: "CST IBS/CBS precisa de 3 dígitos." };
  if (cclassTrib && !/^[0-9]{6}$/.test(cclassTrib)) return { ok: false, erro: "cClassTrib precisa de 6 dígitos." };
  if (gtinTrib && !eanValido(gtinTrib)) return { ok: false, erro: "GTIN tributável inválido: DV não confere (8 ou 13 dígitos)." };
  if (gtinInner && !eanValido(gtinInner)) return { ok: false, erro: "GTIN da embalagem (inner) inválido: DV não confere." };
  if (gtinMaster && !dun14Valido(gtinMaster) && !eanValido(gtinMaster)) {
    return { ok: false, erro: "GTIN master inválido: confira o DUN-14 (14 dígitos) ou GTIN-13 (13)." };
  }

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
    custo === null || venda === null || minStock === null || margem === null ||
    icmsBase === null
  ) {
    return { ok: false, erro: "Confira preço, estoque, tributos e pesos (valores fora do intervalo)." };
  }

  const admin = createAdminClient();

  let itemId = input.id && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : null;
  const eraNovo = itemId === null;

  if (itemId) {
    const { error } = await admin
      .from("catalog_items")
      .update({
        sku, name: nome, category: categoria || null, active: input.ativo,
        fabricante: fabricante || null, notes: observacoes || null,
        hide_price_table: hidePriceTable,
        last_adjusted_at: lastAdj || null,
        foto_url: fotoUrl || null,
      })
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
        fabricante: fabricante || null,
        notes: observacoes || null,
        hide_price_table: hidePriceTable,
        last_adjusted_at: lastAdj || null,
        foto_url: fotoUrl || null,
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
    // Bloco 2 (0031)
    cst_pis: cstPis || null,
    cst_cofins: cstCofins || null,
    icms_base_pct: icmsBase,
    cst_ibscbs: cstIbsCbs || null,
    cclass_trib: cclassTrib || null,
    gtin_tributavel: gtinTrib || null,
  });
  if (errFiscal) {
    if (/duplicate/i.test(errFiscal.message)) {
      return { ok: false, erro: "Este GTIN já está cadastrado em outro produto." };
    }
    return { ok: false, erro: `Falha nos dados fiscais: ${errFiscal.message}` };
  }

  // Bloco 2 (0031): ficha do fornecedor + embalagem. So grava se veio alguma
  // coisa (fornecedor nome, sku do fornecedor ou embalagem) - senao nao cria
  // linha vazia. supplier_id fica null por enquanto (o fornecedor ainda e
  // cadastrado em /compras); o nome do site fica em supplier_name p/ rastrear.
  const temFichaForn =
    !!fornecedorNome || !!supplierSku || !!refFabricante ||
    packQty !== null || masterQty !== null || !!gtinInner || !!gtinMaster ||
    embComp !== null || embAlt !== null || embLarg !== null || embPeso !== null ||
    mstComp !== null || mstAlt !== null || mstLarg !== null || mstPeso !== null;

  if (temFichaForn) {
    // upsert por (item_id): a ficha do fornecedor e 1 por produto por ora.
    const { data: fornExistente } = await admin
      .from("item_supplier_data")
      .select("id")
      .eq("item_id", itemId)
      .maybeSingle();

    const fichaForn = {
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      item_id: itemId,
      supplier_name: fornecedorNome || null,
      supplier_sku: supplierSku || null,
      manufacturer_ref: refFabricante || null,
      manufacturer: fabricante || null,
      source_type: sourceUrl ? "reval" : "manual",
      source_url: sourceUrl || null,
      pack_qty: packQty !== null ? Math.floor(packQty) : null,
      master_qty: masterQty !== null ? Math.floor(masterQty) : null,
      gtin_inner: gtinInner || null,
      gtin_master: gtinMaster || null,
      emb_comprimento_cm: embComp,
      emb_altura_cm: embAlt,
      emb_largura_cm: embLarg,
      emb_peso_kg: embPeso,
      master_comprimento_cm: mstComp,
      master_altura_cm: mstAlt,
      master_largura_cm: mstLarg,
      master_peso_kg: mstPeso,
    };

    const errFich = fornExistente
      ? (await admin.from("item_supplier_data").update(fichaForn).eq("id", fornExistente.id)).error
      : (await admin.from("item_supplier_data").insert(fichaForn)).error;
    if (errFich) return { ok: false, erro: `Falha na ficha do fornecedor: ${errFich.message}` };
  }

  // 0033: `preco_custo` e o que o operador digita; `cost_price` virou o CUSTO
  // MEDIO PONDERADO do modulo de Compras (0017) - por isso nao e gravado aqui.
  const { error: errCom } = await admin.from("item_commercial_data").upsert({
    item_id: itemId,
    preco_custo: custo,
    margin_percent: margem,
    min_stock: Math.floor(minStock),
  });
  if (errCom) return { ok: false, erro: `Falha nos dados comerciais: ${errCom.message}` };

  // O custo medio so acompanha o preco digitado ENQUANTO o produto nao passou
  // por nota de entrada (purchase_receipt_items). A partir da primeira nota
  // quem reescreve `cost_price` e o recebimento da Compras (0017:471-494), e
  // gravar por cima apagaria a media ponderada. Enquanto nao ha nota, "media"
  // e o proprio preco digitado - e tem de acompanhar a edicao, senao a tela
  // mostraria um valor velho e o CMV (0022) usaria custo errado.
  const { data: notasItem } = await admin
    .from("purchase_receipt_items")
    .select("id, purchase_order_items!inner(item_id)")
    .eq("purchase_order_items.item_id", itemId)
    .limit(1);
  if (notasItem && notasItem.length > 0) {
    // produto com entrada de nota: a media ja e do Compras, nao mexe.
  } else {
    const { error: errCustoMedio } = await admin
      .from("item_commercial_data")
      .update({ cost_price: custo })
      .eq("item_id", itemId);
    if (errCustoMedio) {
      return { ok: false, erro: `Falha no custo médio: ${errCustoMedio.message}` };
    }
  }

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
// Bloco 2 (0031): importar cadastro de produto por link do fornecedor (Reval).
// Roda no SERVIDOR (Node faz fetch livre de CORS; o browser bloquearia). O
// form cola o link -> esta action busca a pagina -> parseia (lib defensiva,
// sem cheerio) -> devolve JSON ja preenchido pro form. NAO grava nada: o
// usuario revisa e clica Salvar (salvarProduto persiste).
//
// O unico campo que o Reval nao da e o PRECO (restrito a login de CNPJ).
// Peso e dimensoes vem por EMBALAGEM e por MASTER; o peso unitario e calculado
// aqui (peso emb / qtd emb).
// ---------------------------------------------------------------------------
export type ProdutoImportado = {
  sku: string;
  nome: string;
  categoria: string;
  ncm: string;
  cest: string;
  origem: string;
  gtin: string;
  pesoBruto: string;
  fornecedorNome: string;
  fabricante: string;
  observacoes: string;
  fotoUrl: string;
  supplierSku: string;
  refFabricante: string;
  packQty: string;
  masterQty: string;
  gtinInner: string;
  gtinMaster: string;
  embComprimento: string;
  embAltura: string;
  embLargura: string;
  embPeso: string;
  masterComprimento: string;
  masterAltura: string;
  masterLargura: string;
  masterPeso: string;
  sourceUrl: string;
};

export async function importarProdutoFornecedor(
  url: string
): Promise<ResultadoAcao & { produto?: ProdutoImportado }> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const { importarProdutoReval } = await import("@/lib/fornecedor-import");
  const r = await importarProdutoReval(url);
  if (!r.ok) return { ok: false, erro: r.erro };

  const p = r.produto;
  const s = (v: string | null) => (v ?? "").trim();
  const n = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

  // SKU interno: sugere "REV-<codigo>" pra nao colidir com o codigo do
  // fornecedor; usuario pode editar antes de salvar.
  const sku = p.codigo ? `REV-${p.codigo}` : "";

  return {
    ok: true,
    aviso: p.pesoUnitarioKg
      ? `Importado. Peso unitário calculado: ${n(p.pesoUnitarioKg)} kg (${n(p.pesoEmbalagemKg)} ÷ ${p.qtdEmbalagem}). Preço não vem do site (restrito a CNPJ) — preencha à mão.`
      : "Importado. Preço não vem do site (restrito a CNPJ) — preencha à mão.",
    produto: {
      sku,
      nome: s(p.nome),
      categoria: s(p.categoria),
      ncm: s(p.ncm),
      cest: s(p.cest),
      origem: p.origem ?? "0",
      gtin: s(p.gtinUnitario),
      pesoBruto: n(p.pesoUnitarioKg ?? p.pesoEmbalagemKg),
      fornecedorNome: s(p.fornecedor),
      fabricante: s(p.fabricante),
      observacoes: s(p.observacoes),
      fotoUrl: s(p.fotoUrl),
      supplierSku: s(p.codigo),
      refFabricante: s(p.refFabricante),
      packQty: p.qtdEmbalagem ? String(p.qtdEmbalagem) : "",
      masterQty: p.qtdMaster ? String(p.qtdMaster) : "",
      gtinInner: s(p.gtinEmbalagem),
      gtinMaster: s(p.gtinMaster),
      embComprimento: n(p.embComprimentoCm),
      embAltura: n(p.embAlturaCm),
      embLargura: n(p.embLarguraCm),
      embPeso: n(p.pesoEmbalagemKg),
      masterComprimento: n(p.masterComprimentoCm),
      masterAltura: n(p.masterAlturaCm),
      masterLargura: n(p.masterLarguraCm),
      masterPeso: n(p.pesoMasterKg),
      sourceUrl: url.trim(),
    },
  };
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
// Endereco, telefone e nascimento passaram a existir na tabela na 0029:
// a ficha do cliente virou cadastro completo (contato + endereco + situacao).
// Continuam valendo as regras acima: documento so digitos com DV conferido,
// e-mail unico, tier fixo e FK de pedido bloqueando exclusao.
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
  telefone?: string;
  whatsapp?: string;
  nascimento?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  observacoes?: string;
  limiteCredito?: number | string;
  ativo?: boolean;
  fotoUrl?: string;
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

  // 0029: contato + endereco + situacao - gravam SO digitos sem mascara
  // (mesma convencao de 'documento' na 0016); a tela e que formata.
  const soDigitos = (v?: string) => String(v ?? "").replace(/\D/g, "");
  const telefone = soDigitos(input?.telefone);
  if (telefone && (telefone.length < 10 || telefone.length > 11)) {
    return { ok: false, erro: "Telefone precisa ter 10 ou 11 dígitos." };
  }
  const whatsapp = soDigitos(input?.whatsapp);
  if (whatsapp && whatsapp.length !== 11) {
    return { ok: false, erro: "WhatsApp precisa ter 11 dígitos (DDD + número com 9)." };
  }
  const cep = soDigitos(input?.cep);
  if (cep && cep.length !== 8) return { ok: false, erro: "CEP precisa ter 8 dígitos." };

  const nascimento = String(input?.nascimento ?? "").trim();
  if (nascimento) {
    const d = new Date(`${nascimento}T00:00:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, erro: "Data de nascimento inválida." };
    if (d.getTime() > Date.now()) return { ok: false, erro: "Nascimento não pode ser no futuro." };
  }

  const linha = (v: string | undefined, max: number) => {
    const t = String(v ?? "").trim().replace(/\s+/g, " ");
    return t.slice(0, max);
  };
  const logradouro = linha(input?.logradouro, 120);
  const numero = linha(input?.numero, 20);
  const complemento = linha(input?.complemento, 80);
  const bairro = linha(input?.bairro, 80);
  const cidade = linha(input?.cidade, 80);
  const fotoUrl = linha(input?.fotoUrl, 500);

  const observacoes = String(input?.observacoes ?? "").trim().slice(0, 2000);

  const limiteCredito = Number(input?.limiteCredito ?? 0);
  if (!Number.isFinite(limiteCredito) || limiteCredito < 0 || limiteCredito > 10000000) {
    return { ok: false, erro: "Limite de crédito precisa ser de R$ 0 a R$ 10.000.000." };
  }

  const ativo = typeof input?.ativo === "boolean" ? input.ativo : true;

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
    telefone: telefone || null,
    whatsapp: whatsapp || null,
    nascimento: nascimento || null,
    cep: cep || null,
    logradouro: logradouro || null,
    numero: numero || null,
    complemento: complemento || null,
    bairro: bairro || null,
    cidade: cidade || null,
    observacoes: observacoes || null,
    limite_credito: limiteCredito,
    ativo,
    foto_url: fotoUrl || null,
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
