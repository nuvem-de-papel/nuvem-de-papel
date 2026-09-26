"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { checkoutAberto } from "@/lib/checkout";
import { criarPreferencia, mpConfigurado } from "@/lib/mercadopago";

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

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
}): Promise<ResultadoCheckout> {
  if (!checkoutAberto()) {
    return { ok: false, erro: "Checkout temporariamente indisponível." };
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

  // 5) pedido + itens (transação via ordem de escrita; RLS deny-all + service_role)
  const { data: pedido, error: erroPedido } = await admin
    .from("orders")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      customer_id: clienteRes.id,
      user_id: user.id,
      channel: canal,
      status: "aguardando_pagamento",
      total_amount: total,
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

  // 6) preferência Mercado Pago (quando configurado)
  let initPoint: string | null = null;
  let aviso: string | undefined;
  if (mpConfigurado()) {
    const pref = await criarPreferencia({
      pedidoId: pedido.id,
      itens: linhas.map((l) => ({ title: l.name, unit_price: l.unit_price, quantity: l.qty, id: l.item_id })),
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

  revalidatePath("/conta/pedidos");
  return { ok: true, pedidoId: pedido.id, initPoint, aviso };
}
