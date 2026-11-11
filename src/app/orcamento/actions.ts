"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import type { FaixaPreco, InfoItemOrcamento } from "@/lib/orcamentoPrecos";
import {
  ORCAMENTO_MAX_ITENS,
  ORCAMENTO_QTD_MAX,
  PRAZO_ENCOMENDA_DIAS_UTEIS,
} from "@/lib/orcamentoConfig";

// Envio do orcamento (0050). Regras:
//  - nome, SKU e saldo do CD sao lidos do catalogo aqui, nunca do navegador;
//  - tipo de prazo por item: 'estoque' se o CD cobre a quantidade, senao 'encomenda';
//  - sem login: cria a conta (modo novo) ou entra (modo entrar) e vincula o cliente;
//  - escrita com service_role (quote_requests e quote_request_items: RLS deny-all).

export type ItemEnvio = { id: string; qty: number };

export type EnviarOrcamentoInput = {
  itens: ItemEnvio[];
  cep: string;
  mensagem: string;
  consentimento: boolean;
  endereco?: { rua: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string };
  // so quando nao ha login:
  modo?: "novo" | "entrar";
  nome?: string;
  email?: string;
  telefone?: string;
  senha?: string;
};

export type EnviarOrcamentoResultado =
  | { ok: true; protocolo: string; confirmarEmail: boolean }
  | { ok: false; erro: string };

const T = NUVEM_DE_PAPEL_TENANT_ID;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erro(mensagem: string): EnviarOrcamentoResultado {
  return { ok: false, erro: mensagem };
}

export async function enviarOrcamento(input: EnviarOrcamentoInput): Promise<EnviarOrcamentoResultado> {
  const cep = (input.cep ?? "").replace(/\D/g, "");
  const mensagem = (input.mensagem ?? "").trim();

  if (!input.consentimento) return erro("Confirme o consentimento para contato.");
  if (cep.length !== 8) return erro("Informe um CEP válido (8 dígitos).");
  // endereco de entrega: vai no texto do pedido (sem coluna nova no banco)
  const e = input.endereco;
  const uf = (e?.uf ?? "").trim().toUpperCase();
  if (!e || !e.rua?.trim() || !e.numero?.trim() || !e.bairro?.trim() || !e.cidade?.trim() || !/^[A-Z]{2}$/.test(uf)) {
    return erro("Informe o endereço de entrega completo.");
  }
  const complemento = e.complemento?.trim() ? ` - ${e.complemento.trim()}` : "";
  const linhaEndereco = `Endereço de entrega: ${e.rua.trim()}, ${e.numero.trim()}${complemento}, ${e.bairro.trim()}, ${e.cidade.trim()}/${uf} - CEP ${cep.slice(0, 5)}-${cep.slice(5)}`;
  const mensagemFinal = [linhaEndereco, mensagem].filter(Boolean).join("\n");
  if (mensagem.length > 1000) return erro("Mensagem muito longa (máx. 1000 caracteres).");

  // lista: valida, soma quantidades repetidas, limita tamanho
  const mapa = new Map<string, number>();
  for (const i of input.itens ?? []) {
    if (!UUID.test(i.id)) return erro("Produto inválido na lista.");
    const q = Math.floor(Number(i.qty));
    if (!Number.isFinite(q) || q < 1 || q > ORCAMENTO_QTD_MAX) return erro("Quantidade inválida.");
    mapa.set(i.id, Math.min((mapa.get(i.id) ?? 0) + q, ORCAMENTO_QTD_MAX));
  }
  if (mapa.size === 0) return erro("Sua lista está vazia.");
  if (mapa.size > ORCAMENTO_MAX_ITENS) {
    return erro(`Máximo de ${ORCAMENTO_MAX_ITENS} produtos por orçamento.`);
  }

  const admin = createAdminClient();
  const ids = [...mapa.keys()];

  const { data: catalogo, error: catalogoError } = await admin
    .from("catalog_items")
    .select("id, sku, name")
    .in("id", ids)
    .eq("tenant_id", T)
    .eq("active", true)
    .returns<{ id: string; sku: string; name: string }[]>();
  if (catalogoError || !catalogo || catalogo.length !== ids.length) {
    return erro("Algum produto da lista não está mais disponível. Revise sua lista.");
  }

  const { data: saldos, error: saldoError } = await admin
    .from("item_stock_cd_public")
    .select("item_id, stock_on_hand")
    .in("item_id", ids)
    .returns<{ item_id: string; stock_on_hand: number }[]>();
  if (saldoError) {
    console.error("solicitarOrcamento saldo:", saldoError.message);
    return erro("Não foi possível conferir o estoque agora. Tente de novo.");
  }
  const saldo = new Map((saldos ?? []).map((s) => [s.item_id, Number(s.stock_on_hand)]));

  // identificacao: login atual, ou cria conta / entra
  const supa = createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();

  // sessao de equipe (profiles) nao e cliente: nao vincula nem cria conta por cima
  if (user) {
    const { data: perfil } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (perfil) {
      return erro("Esta sessão é da equipe. Saia da conta ou use uma janela anônima para enviar como cliente.");
    }
  }

  let authUserId: string | null = user?.id ?? null;
  let emailCliente: string | null = user?.email ?? null;
  let nomeCliente = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim();
  let telefoneCliente: string | null = null;
  let confirmarEmail = false;

  if (!user) {
    const email = (input.email ?? "").trim().toLowerCase();
    const senha = input.senha ?? "";
    if (!EMAIL.test(email)) return erro("Informe um e-mail válido.");
    if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");

    if (input.modo === "entrar") {
      const { data, error } = await supa.auth.signInWithPassword({ email, password: senha });
      if (error || !data.user) return erro("E-mail ou senha incorretos.");
      authUserId = data.user.id;
      emailCliente = email;
    } else {
      const nome = (input.nome ?? "").trim();
      const telefone = (input.telefone ?? "").replace(/\D/g, "");
      if (nome.length < 2 || nome.length > 120) return erro("Informe seu nome.");
      if (!/^[0-9]{10,11}$/.test(telefone)) {
        return erro("Informe um telefone com DDD (10 ou 11 dígitos).");
      }
      const { data, error } = await supa.auth.signUp({
        email,
        password: senha,
        options: { data: { full_name: nome, telefone } },
      });
      if (error) {
        if (/already|registered|exist/i.test(error.message)) {
          return erro("Este e-mail já tem cadastro. Escolha 'Já tenho cadastro' e entre com sua senha.");
        }
        console.error("signUp:", error.message);
        return erro("Não foi possível criar o cadastro agora. Tente de novo.");
      }
      if (!data.user) return erro("Não foi possível criar o cadastro agora. Tente de novo.");
      authUserId = data.user.id;
      emailCliente = email;
      nomeCliente = nome;
      telefoneCliente = telefone;
      confirmarEmail = !data.session;
    }
  }

  if (!emailCliente) return erro("Não foi possível identificar seu cadastro.");

  // cliente (CRM): acha pelo login, depois pelo e-mail, ou cria
  let customerId: string | null = null;
  if (authUserId) {
    const { data: porAuth } = await admin
      .from("customers")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    customerId = (porAuth as { id: string } | null)?.id ?? null;
  }

  if (!customerId) {
    const { data: porEmail } = await admin
      .from("customers")
      .select("id, auth_user_id")
      .eq("tenant_id", T)
      .eq("email", emailCliente)
      .maybeSingle();
    const existente = porEmail as { id: string; auth_user_id: string | null } | null;

    if (existente) {
      if (existente.auth_user_id && existente.auth_user_id !== authUserId) {
        return erro("Este e-mail já está vinculado a outro cadastro. Fale com a loja.");
      }
      if (!existente.auth_user_id && authUserId) {
        await admin.from("customers").update({ auth_user_id: authUserId }).eq("id", existente.id);
      }
      customerId = existente.id;
    } else {
      const { data: novo, error: novoError } = await admin
        .from("customers")
        .insert({
          tenant_id: T,
          name: nomeCliente || emailCliente,
          email: emailCliente,
          telefone: telefoneCliente,
          cep,
          tier: "bronze",
          points: 0,
          limite_credito: 0,
          ativo: true,
          auth_user_id: authUserId,
        })
        .select("id")
        .single();
      if (novoError || !novo) {
        console.error("solicitarOrcamento cliente:", novoError?.message);
        return erro("Não foi possível salvar seu cadastro. Tente de novo.");
      }
      customerId = (novo as { id: string }).id;
    }
  }

  // cabecalho + itens
  const { data: cab, error: cabError } = await admin
    .from("quote_requests")
    .insert({
      tenant_id: T,
      customer_id: customerId,
      cep,
      prazo_encomenda_dias: PRAZO_ENCOMENDA_DIAS_UTEIS,
      mensagem: mensagemFinal || null,
    })
    .select("id")
    .single();
  if (cabError || !cab) {
    console.error("solicitarOrcamento cabecalho:", cabError?.message);
    return erro("Não foi possível enviar agora. Tente de novo em instantes.");
  }
  const quoteId = (cab as { id: string }).id;

  const linhas = catalogo.map((p) => {
    const qty = mapa.get(p.id) ?? 1;
    return {
      tenant_id: T,
      quote_id: quoteId,
      item_id: p.id,
      sku: p.sku,
      product_name: p.name,
      quantidade: qty,
      tipo_prazo: (saldo.get(p.id) ?? 0) >= qty ? "estoque" : "encomenda",
    };
  });

  const { error: itensError } = await admin.from("quote_request_items").insert(linhas);
  if (itensError) {
    console.error("solicitarOrcamento itens:", itensError.message);
    await admin.from("quote_requests").delete().eq("id", quoteId);
    return erro("Não foi possível enviar agora. Tente de novo em instantes.");
  }

  return { ok: true, protocolo: quoteId.slice(0, 8).toUpperCase(), confirmarEmail };
}

// Saldo do CD e faixas de preco (varejo, vigentes) por item da lista. So para
// mostrar a tela: separa "Em estoque" / "Sob encomenda" e mostra valores de referencia.
// Dado publico (mesmas fontes da vitrine). null = nao deu pra conferir.
export async function infoItensOrcamento(ids: string[]): Promise<Record<string, InfoItemOrcamento> | null> {
  const validos = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, ORCAMENTO_MAX_ITENS);
  if (validos.length === 0) return {};
  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const [saldosRes, precosRes] = await Promise.all([
    admin
      .from("item_stock_cd_public")
      .select("item_id, stock_on_hand")
      .in("item_id", validos)
      .returns<{ item_id: string; stock_on_hand: number }[]>(),
    admin
      .from("item_prices")
      .select("item_id, price, min_quantity")
      .in("item_id", validos)
      .eq("channel", "varejo")
      .lte("valid_from", agora)
      .or(`valid_until.is.null,valid_until.gt.${agora}`)
      .returns<{ item_id: string; price: number | string; min_quantity: number }[]>(),
  ]);

  if (saldosRes.error || precosRes.error) {
    console.error("infoItensOrcamento:", saldosRes.error?.message ?? precosRes.error?.message);
    return null;
  }

  const saldo = new Map((saldosRes.data ?? []).map((r) => [r.item_id, Number(r.stock_on_hand)]));
  const faixas = new Map<string, FaixaPreco[]>();
  for (const r of precosRes.data ?? []) {
    const lista = faixas.get(r.item_id) ?? [];
    lista.push({ minQtd: Number(r.min_quantity), preco: Number(r.price) });
    faixas.set(r.item_id, lista);
  }

  return Object.fromEntries(
    validos.map((id) => [id, { saldo: saldo.get(id) ?? 0, faixas: faixas.get(id) ?? [] }])
  );
}
