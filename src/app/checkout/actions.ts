"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { checkoutAberto } from "@/lib/checkout";
import { criarPreferencia, mpConfigurado } from "@/lib/mercadopago";
import { beneficioClube } from "@/lib/clube";
import { enviarEmail, templatePedidoCriado, codigoPedido } from "@/lib/email";

// Finalização de compra (F3/F6). Regras de ouro:
//  - preço/título NUNCA vêm do navegador: item_prices é lido aqui com o canal
//    do usuário (revenda → atacado) e vigência ativa — faixas por
//    min_quantity respeitadas;
//  - pedido nasce 'aguardando_pagamento' com snapshot de endereço + itens;
//  - checkout abre só com MP configurado ou CHECKOUT_LIBERADO=1 (fail-closed
//    para não vender sem meio de pagamento em produção).

export type EnderecoInput = {
  recipientName: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type ResultadoCheckout =
  | { ok: true; pedidoId: string; initPoint: string | null; aviso?: string }
  | { ok: false; erro: string };

export type OpcaoFrete = { servico: "pac" | "sedex"; valor: number; prazo: number };

export type ResultadoCotacao =
  | { ok: true; opcoes: OpcaoFrete[]; peso: number; aviso: string | null }
  | { ok: false; erro: string };

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Peso do frete (0028): soma do peso BRUTO do item (item_fiscal_data, com
// embalagem) x qty. Item sem peso cadastrado entra com 0,3 kg - o demo nao
// tem pesos preenchidos e 0,3 kg e o minimo dos Correios (faixa 0.3 da
// matriz). A tabela e lida no servidor: preco de frete NUNCA vem do
// navegador, igual ao preco dos itens.
const PESO_PADRAO_KG = 0.3;

type CotacaoInterna = { peso: number; opcoes: OpcaoFrete[] } | { erro: string };

async function cotarInterno(
  admin: ReturnType<typeof createAdminClient>,
  cepDestino: string,
  porId: Map<string, number>
): Promise<CotacaoInterna> {
  const digitos = String(cepDestino ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(digitos)) return { erro: "CEP de destino inválido." };

  const { data: fiscais, error: erroFisc } = await admin
    .from("item_fiscal_data")
    .select("item_id, weight_kg, weight_gross_kg")
    .in("item_id", [...porId.keys()]);
  if (erroFisc) return { erro: "Não foi possível calcular o frete agora." };

  const pesoPorItem = new Map<string, number>();
  for (const f of fiscais ?? []) {
    pesoPorItem.set(f.item_id, Number(f.weight_gross_kg ?? f.weight_kg ?? 0) || PESO_PADRAO_KG);
  }
  let peso = 0;
  for (const [id, qty] of porId) peso += (pesoPorItem.get(id) ?? PESO_PADRAO_KG) * qty;
  peso = Math.max(PESO_PADRAO_KG, Math.round(peso * 100) / 100);

  // origem = CEP da loja (mesma fonte do importador scripts/importar-frete-correios.cjs)
  const { data: empresa } = await admin
    .from("tenant_company")
    .select("endereco")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const origem = String(empresa?.endereco?.cep ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(origem)) return { erro: "CEP da loja não configurado para frete." };

  // menor teto de faixa >= peso do pedido, por servico (regiao = 1o digito do CEP)
  const { data: linhas, error: erroTab } = await admin
    .from("freight_tabelas")
    .select("servico, valor, prazo_dias, peso_ate")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("origem_cep", origem)
    .eq("destino_regiao", digitos[0])
    .gte("peso_ate", peso)
    .order("peso_ate", { ascending: true });
  if (erroTab) return { erro: "Não foi possível ler a tabela de frete." };

  const opcoes: OpcaoFrete[] = [];
  for (const svc of ["pac", "sedex"] as const) {
    const l = (linhas ?? []).find((x) => x.servico === svc);
    if (l) opcoes.push({ servico: svc, valor: Number(l.valor), prazo: Number(l.prazo_dias) });
  }
  return { peso, opcoes };
}

// Cotação para o formulario do checkout: devolve so as opcoes DISPONIVEIS
// (pac/sedex) - a UI sempre oferece "retirar na loja" (frete 0) por fora.
export async function cotarFrete(input: {
  cep: string;
  itens: { item_id: string; qty: number }[];
}): Promise<ResultadoCotacao> {
  if (!checkoutAberto()) return { ok: false, erro: "Checkout temporariamente indisponível." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  if (!Array.isArray(input.itens) || input.itens.length === 0 || input.itens.length > 50) {
    return { ok: false, erro: "Carrinho vazio ou inválido." };
  }
  const porId = new Map<string, number>();
  for (const i of input.itens) {
    if (!i || !ehUuid(String(i.item_id))) return { ok: false, erro: "Item inválido no carrinho." };
    const q = Math.floor(Number(i.qty));
    if (!Number.isFinite(q) || q < 1 || q > 99) return { ok: false, erro: "Quantidade inválida." };
    porId.set(i.item_id, (porId.get(i.item_id) ?? 0) + q);
  }

  const cot = await cotarInterno(createAdminClient(), input.cep, porId);
  if ("erro" in cot) return { ok: false, erro: cot.erro };

  let aviso: string | null = null;
  if (cot.opcoes.length === 0) {
    // distingue "peso acima de 20 kg" de "regiao sem linha na matriz"
    const digitos = input.cep.replace(/\D/g, "");
    const { data: regiao } = await createAdminClient()
      .from("freight_tabelas")
      .select("id")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("destino_regiao", digitos[0])
      .limit(1);
    aviso = (regiao ?? []).length > 0
      ? `Frete online indisponível: peso estimado de ${cot.peso} kg excede 20 kg. Fale conosco ou retire na loja.`
      : "Sem frete online para este CEP (fora da área de cobertura da tabela). Fale conosco.";
  }
  return { ok: true, opcoes: cot.opcoes, peso: cot.peso, aviso };
}

function validarEndereco(e: EnderecoInput): string | null {
  if (!e.recipientName?.trim()) return "Informe o nome de quem recebe.";
  if (!/^\d{8}$/.test((e.cep ?? "").replace(/\D/g, ""))) return "CEP inválido.";
  if (!e.logradouro?.trim()) return "Informe o endereço (rua).";
  if (!e.numero?.trim()) return "Informe o número.";
  if (!e.bairro?.trim()) return "Informe o bairro.";
  if (!e.cidade?.trim()) return "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(e.uf ?? "")) return "UF inválida.";
  return null;
}

export async function finalizarCheckout(input: {
  itens: { item_id: string; qty: number }[];
  pagamento: "pix" | "cartao" | "boleto";
  addressId?: string | null;
  endereco?: EnderecoInput | null;
  salvarEndereco?: boolean;
  frete?: "pac" | "sedex" | "retirada" | null;
}): Promise<ResultadoCheckout> {
  if (!checkoutAberto()) {
    return { ok: false, erro: "Checkout temporariamente indisponível." };
  }
  // frete: so o TIPO e validado aqui (input barato); a exigencia de ESCOLHA
  // fica no bloco 4.5, depois do endereco - assim endereco ruim responde
  // "CEP invalido" antes de falar de frete. Valor nunca vem do navegador.
  const freteBruto = input.frete as unknown;
  if (freteBruto != null && freteBruto !== "pac" && freteBruto !== "sedex" && freteBruto !== "retirada") {
    return { ok: false, erro: "Opção de frete inválida." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  if (!["pix", "cartao", "boleto"].includes(input.pagamento)) {
    return { ok: false, erro: "Forma de pagamento inválida." };
  }
  if (!Array.isArray(input.itens) || input.itens.length === 0 || input.itens.length > 50) {
    return { ok: false, erro: "Carrinho vazio ou inválido." };
  }

  const porId = new Map<string, number>();
  for (const i of input.itens) {
    if (!i || !ehUuid(String(i.item_id))) return { ok: false, erro: "Item inválido no carrinho." };
    const q = Math.floor(Number(i.qty));
    if (!Number.isFinite(q) || q < 1 || q > 99) return { ok: false, erro: "Quantidade inválida." };
    porId.set(i.item_id, (porId.get(i.item_id) ?? 0) + q);
  }
  const ids = [...porId.keys()];

  const admin = createAdminClient();

  // canal de precificação: revenda ativa compra no atacado (F6)
  const { data: meuPerfil } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const canal: "varejo" | "atacado" =
    meuPerfil?.status === "ativo" && meuPerfil.role === "revenda" ? "atacado" : "varejo";

  // 1) catálogo (ativo) + preços vigentes do canal — servidor manda
  const agora = new Date().toISOString();
  const [catalogoRes, precosRes] = await Promise.all([
    admin
      .from("catalog_items")
      .select("id, sku, name")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("id", ids)
      .eq("active", true),
    admin
      .from("item_prices")
      .select("item_id, price, min_quantity, valid_from, valid_until")
      .eq("channel", canal)
      .in("item_id", ids)
      .lte("valid_from", agora)
      .or(`valid_until.is.null,valid_until.gt.${agora}`),
  ]);
  if (catalogoRes.error || precosRes.error) {
    return { ok: false, erro: "Não foi possível ler o catálogo agora." };
  }

  const catalogo = new Map(
    (catalogoRes.data ?? []).map((c) => [c.id as string, { sku: c.sku as string, name: c.name as string }])
  );
  const faltando = ids.filter((id) => !catalogo.has(id));
  if (faltando.length > 0) {
    return { ok: false, erro: "Alguns itens saíram do catálogo. Atualize o carrinho." };
  }

  const precosPorItem = new Map<string, { price: number; min_quantity: number }[]>();
  for (const p of precosRes.data ?? []) {
    const lista = precosPorItem.get(p.item_id) ?? [];
    lista.push({ price: Number(p.price), min_quantity: Number(p.min_quantity) });
    precosPorItem.set(p.item_id, lista);
  }

  type Linha = { item_id: string; sku: string; name: string; unit_price: number; qty: number; total: number };
  const linhas: Linha[] = [];
  let total = 0;
  for (const [itemId, qty] of porId) {
    const regras = precosPorItem.get(itemId);
    if (!regras || regras.length === 0) {
      return { ok: false, erro: `Item sem preço de ${canal} configurado.` };
    }
    // faixa: maior min_quantity <= qty; fallback = menor faixa disponível
    const elegiveis = regras.filter((r) => r.min_quantity <= qty);
    const escolhida =
      elegiveis.length > 0
        ? elegiveis.reduce((a, b) => (b.min_quantity > a.min_quantity ? b : a))
        : regras.reduce((a, b) => (b.min_quantity < a.min_quantity ? b : a));
    const cat = catalogo.get(itemId)!;
    const sub = escolhida.price * qty;
    linhas.push({
      item_id: itemId,
      sku: cat.sku,
      name: cat.name,
      unit_price: escolhida.price,
      qty,
      total: sub,
    });
    total += sub;
  }

  // 1.1) beneficio do Clube (F7): assinante ativo ganha desconto sobre o
  // total - aplicado aqui no servidor (o navegador nunca manda o preco).
  let desconto = 0;
  let pctClube = 0;
  const beneficio = await beneficioClube(user.id);
  if (beneficio) {
    pctClube = beneficio.discount_pct;
    desconto = Math.round(total * pctClube) / 100;
    if (desconto > total) desconto = total;
    total = Math.round((total - desconto) * 100) / 100;
  }

  // 2) endereço: existente (próprio) ou novo
  let snapshot: EnderecoInput | null = null;
  if (input.addressId) {
    const { data: proprio } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", input.addressId)
      .maybeSingle();
    if (!proprio) return { ok: false, erro: "Endereço não encontrado." };
    snapshot = {
      recipientName: proprio.recipient_name,
      cep: proprio.cep,
      logradouro: proprio.logradouro,
      numero: proprio.numero,
      complemento: proprio.complemento ?? "",
      bairro: proprio.bairro,
      cidade: proprio.cidade,
      uf: proprio.uf,
    };
  } else if (input.endereco) {
    const erro = validarEndereco(input.endereco);
    if (erro) return { ok: false, erro };
    snapshot = { ...input.endereco, cep: input.endereco.cep.replace(/\D/g, ""), uf: input.endereco.uf.toUpperCase() };
  } else {
    return { ok: false, erro: "Informe o endereço de entrega." };
  }

  // 3) cliente (upsert por tenant+email — CRM já usa esta tabela)
  const email = user.email ?? user.id;
  const { data: clienteRes, error: erroCliente } = await admin
    .from("customers")
    .upsert(
      {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        email,
        name: snapshot.recipientName,
      },
      { onConflict: "tenant_id,email" }
    )
    .select("id")
    .single();
  if (erroCliente || !clienteRes) {
    return { ok: false, erro: `Falha ao registrar cliente: ${erroCliente?.message ?? "desconhecida"}` };
  }

  // 4) endereço novo salvo (opcional) — antes do pedido para poder reusar
  if (!input.addressId && input.salvarEndereco) {
    await admin.from("addresses").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      user_id: user.id,
      recipient_name: snapshot.recipientName,
      cep: snapshot.cep,
      logradouro: snapshot.logradouro,
      numero: snapshot.numero,
      complemento: snapshot.complemento || null,
      bairro: snapshot.bairro,
      cidade: snapshot.cidade,
      uf: snapshot.uf,
    });
    revalidatePath("/checkout");
  }

  // 4.5) frete (0028): recalculado AQUI com a mesma tabela do cotarFrete -
  // o navegador manda so a modalidade escolhida, nunca o valor. Retirada = 0;
  // pac/sedex fora da tabela (peso acima de 20 kg ou regiao sem linha) sao
  // recusados fail-closed para nao vender com frete errado.
  // Escolha e OBRIGATORIA: default silencioso "retirada" faria backoffice
  // marcar a entrega como retirada concluida (vendas/actions.ts EN-01).
  const freteServico = input.frete;
  if (freteServico !== "pac" && freteServico !== "sedex" && freteServico !== "retirada") {
    return { ok: false, erro: "Escolha a modalidade de entrega (retirada na loja ou frete)." };
  }
  let freteValor = 0;
  if (freteServico !== "retirada") {
    const cot = await cotarInterno(admin, snapshot.cep, porId);
    if ("erro" in cot) return { ok: false, erro: cot.erro };
    const opcao = cot.opcoes.find((o) => o.servico === freteServico);
    if (!opcao) {
      return {
        ok: false,
        erro: "Não foi possível calcular o frete para este destino/peso. Escolha retirar na loja ou fale conosco.",
      };
    }
    freteValor = Math.round(opcao.valor * 100) / 100;
    total = Math.round((total + freteValor) * 100) / 100;
  }

  // 5) pedido + itens (transação via ordem de escrita; RLS deny-all + service_role)
  const { data: pedido, error: erroPedido } = await admin
    .from("orders")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      customer_id: clienteRes.id,
      user_id: user.id,
      channel: canal,
      // 0015/0016: pedido da loja entra como origem 'loja' com etapa nula;
      // a aba "Importar da loja" (/vendas) gera o numero P- e a etapa.
      origem: "loja",
      status: "aguardando_pagamento",
      total_amount: total,
      discount_amount: desconto,
      frete: freteValor,
      payment_method: input.pagamento,
      address_snapshot: snapshot,
    })
    .select("id")
    .single();
  if (erroPedido || !pedido) {
    return { ok: false, erro: `Falha ao criar pedido: ${erroPedido?.message ?? "desconhecida"}` };
  }

  const { error: erroItens } = await admin.from("order_items").insert(
    linhas.map((l) => ({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      order_id: pedido.id,
      item_id: l.item_id,
      sku: l.sku,
      name: l.name,
      unit_price: l.unit_price,
      quantity: l.qty,
      total: l.total,
    }))
  );
  if (erroItens) {
    // compensação: não deixa pedido sem itens
    await admin.from("orders").delete().eq("id", pedido.id);
    return { ok: false, erro: `Falha ao registrar itens: ${erroItens.message}` };
  }

  // 5.1) reserva de estoque (F4): função atômica — se QUALQUER item não tem
  // saldo, tudo derruba dentro da função e o pedido é compensado (cascade).
  // Corrida de última unidade: o segundo recebimento leva ESTOQUE_INSUFICIENTE.
  const { error: erroReserva } = await admin.rpc("reserve_order_stock", {
    p_order_id: pedido.id,
  });
  if (erroReserva) {
    await admin.from("orders").delete().eq("id", pedido.id);
    const m = /ESTOQUE_INSUFICIENTE: reserva \(([0-9a-f-]{36})\)/i.exec(erroReserva.message ?? "");
    const linha = m ? linhas.find((l) => l.item_id === m[1]) : undefined;
    return {
      ok: false,
      erro: linha
        ? `Estoque insuficiente para "${linha.name}". Atualize o carrinho.`
        : "Estoque insuficiente para um dos itens. Atualize o carrinho.",
    };
  }

  // rastro: pedido da loja nao gravava audit_log (bloco 1, auditoria 0020).
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: user.id,
    action: "pedido.criar",
    entity: "orders",
    entity_id: pedido.id,
    after: {
      channel: canal,
      origem: "loja",
      status: "aguardando_pagamento",
      total_amount: total,
      discount_amount: desconto,
      frete: { modalidade: freteServico, valor: freteValor },
      payment_method: input.pagamento,
      customer_id: clienteRes.id,
      itens: linhas.length,
    },
  });

  // 6) preferência Mercado Pago (quando configurado)
  let initPoint: string | null = null;
  let aviso: string | undefined;
  if (mpConfigurado()) {
    const pref = await criarPreferencia({
      pedidoId: pedido.id,
      itens: [
        ...linhas.map((l) => ({ title: l.name, unit_price: l.unit_price, quantity: l.qty, id: l.item_id })),
        // desconto do Clube como linha negativa: os itens somam o total
        ...(desconto > 0
          ? [{ title: `Desconto Clube ${pctClube}%`, unit_price: -desconto, quantity: 1, id: "clube-desconto" }]
          : []),
        // frete como linha propria (0028): itens + frete - desconto = total
        ...(freteValor > 0
          ? [{ title: `Frete ${freteServico.toUpperCase()}`, unit_price: freteValor, quantity: 1, id: "frete" }]
          : []),
      ],
      pagador: { email, name: snapshot.recipientName },
      total,
    });
    if (pref.ok) {
      initPoint = pref.initPoint;
      await admin.from("orders").update({ mp_preference_id: pref.preferenceId }).eq("id", pedido.id);
    } else {
      aviso = "Pagamento online indisponível no momento — pedido registrado.";
    }
  } else {
    aviso = "Pedido registrado. O pagamento online será ativado em breve.";
  }

  // 7) aviso de pedido registrado (F6.5, best-effort: falha de e-mail nunca
  // derruba o checkout — a trilha fica em email_messages)
  const tPedido = templatePedidoCriado(snapshot.recipientName, codigoPedido(pedido.id), total);
  await enviarEmail(email, tPedido.assunto, tPedido.html, {
    relatedEntity: "orders",
    relatedId: pedido.id,
  });

  revalidatePath("/conta/pedidos");
  return { ok: true, pedidoId: pedido.id, initPoint, aviso };
}
