"use server";

// Autoatendimento do cliente (20/11/2026). Regras:
//  - o cliente muda os PROPRIOS dados pessoais e enderecos sem pedir a loja,
//    e toda troca fica no audit_log com antes/depois (inventario de troca);
//  - o cliente NUNCA muda status de pedido: aqui so ha solicitacao de nota,
//    registro de impressao/pagamento/refazer — status so muda pelo webhook do
//    MP ou pela equipe. Toda acao de pedido gera linha `pedido.*` no audit_log.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

type R = { ok: boolean; erro?: string; url?: string };
const T = NUVEM_DE_PAPEL_TENANT_ID;
const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const txt = (v: unknown, max = 160) => String(v ?? "").trim().slice(0, max);

async function usuario() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user;
}

async function auditar(actor: string, action: string, entity: string, id: string, before: unknown, after: unknown) {
  await createAdminClient()
    .from("audit_log")
    .insert({ tenant_id: T, actor_user_id: actor, action, entity, entity_id: id, before, after });
}

// ---------- Cadastro ----------
export type DadosCliente = { nome: string; email: string; telefone: string; whatsapp: string; nascimento: string };

export async function atualizarCadastro(d: DadosCliente): Promise<R> {
  const user = await usuario();
  if (!user) return { ok: false, erro: "Entre na sua conta." };
  const nome = txt(d.nome);
  const email = txt(d.email, 200).toLowerCase();
  const telefone = so(d.telefone);
  const whatsapp = so(d.whatsapp);
  const nascimento = txt(d.nascimento, 10);
  if (nome.length < 3) return { ok: false, erro: "Nome com pelo menos 3 letras." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
  if (telefone && !/^[0-9]{10,11}$/.test(telefone)) return { ok: false, erro: "Telefone com DDD (10 ou 11 dígitos)." };
  if (whatsapp && !/^[0-9]{11}$/.test(whatsapp)) return { ok: false, erro: "WhatsApp com DDD (11 dígitos)." };
  if (nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || new Date(nascimento) > new Date()))
    return { ok: false, erro: "Data de nascimento inválida." };

  const admin = createAdminClient();
  const { data: atual } = await admin
    .from("customers")
    .select("id, name, email, telefone, whatsapp, nascimento")
    .eq("tenant_id", T)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!atual) return { ok: false, erro: "Cadastro não encontrado." };

  const novo = { name: nome, email, telefone: telefone || null, whatsapp: whatsapp || null, nascimento: nascimento || null };
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  for (const k of Object.keys(novo) as (keyof typeof novo)[]) {
    if ((atual[k] ?? null) !== novo[k]) {
      antes[k] = atual[k] ?? null;
      depois[k] = novo[k];
    }
  }
  if (Object.keys(depois).length === 0) return { ok: true };

  if (depois.email) {
    const au = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
    if (au.error) return { ok: false, erro: "Este e-mail já está em uso em outra conta." };
  }
  const up = await admin.from("customers").update(novo).eq("id", atual.id);
  if (up.error) {
    if (depois.email) await admin.auth.admin.updateUserById(user.id, { email: atual.email, email_confirm: true });
    return { ok: false, erro: up.error.code === "23505" ? "Este e-mail já está em uso em outra conta." : "Não foi possível salvar." };
  }
  await auditar(user.id, "cliente.dados_alterados", "customers", atual.id, antes, depois);
  revalidatePath("/conta", "layout");
  return { ok: true };
}

// ---------- Enderecos ----------
export type Endereco = {
  id?: string;
  recipient_name: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function salvarEndereco(e: Endereco): Promise<R> {
  const user = await usuario();
  if (!user) return { ok: false, erro: "Entre na sua conta." };
  const linha = {
    recipient_name: txt(e.recipient_name),
    cep: so(e.cep),
    logradouro: txt(e.logradouro),
    numero: txt(e.numero, 20),
    complemento: txt(e.complemento, 80) || null,
    bairro: txt(e.bairro, 80),
    cidade: txt(e.cidade, 80),
    uf: txt(e.uf, 2).toUpperCase(),
  };
  if (linha.recipient_name.length < 3) return { ok: false, erro: "Nome de quem recebe." };
  if (!/^[0-9]{8}$/.test(linha.cep)) return { ok: false, erro: "CEP com 8 dígitos." };
  if (!linha.logradouro || !linha.numero || !linha.bairro || !linha.cidade) return { ok: false, erro: "Preencha rua, número, bairro e cidade." };
  if (!/^[A-Z]{2}$/.test(linha.uf)) return { ok: false, erro: "UF com 2 letras." };

  const admin = createAdminClient();
  if (e.id) {
    const { data: antes } = await admin.from("addresses").select("*").eq("id", e.id).eq("user_id", user.id).maybeSingle();
    if (!antes) return { ok: false, erro: "Endereço não encontrado." };
    const up = await admin.from("addresses").update(linha).eq("id", e.id).eq("user_id", user.id);
    if (up.error) return { ok: false, erro: "Não foi possível salvar." };
    await auditar(user.id, "cliente.endereco_alterado", "addresses", e.id, antes, linha);
  } else {
    const ins = await admin
      .from("addresses")
      .insert({ ...linha, tenant_id: T, user_id: user.id })
      .select("id")
      .single();
    if (ins.error) return { ok: false, erro: "Não foi possível salvar." };
    await auditar(user.id, "cliente.endereco_criado", "addresses", ins.data.id, null, linha);
  }
  revalidatePath("/conta/enderecos");
  return { ok: true };
}

export async function removerEndereco(id: string): Promise<R> {
  const user = await usuario();
  if (!user) return { ok: false, erro: "Entre na sua conta." };
  const admin = createAdminClient();
  const { data: antes } = await admin.from("addresses").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!antes) return { ok: false, erro: "Endereço não encontrado." };
  const del = await admin.from("addresses").delete().eq("id", id).eq("user_id", user.id);
  if (del.error) return { ok: false, erro: "Não foi possível remover." };
  await auditar(user.id, "cliente.endereco_removido", "addresses", id, antes, null);
  revalidatePath("/conta/enderecos");
  return { ok: true };
}

// ---------- Pedido (sem mudar status) ----------
export type AcaoPedido = "pagar" | "imprimir" | "refazer" | "nota";
const PAGOS = ["pago", "processando", "em_rota", "entregue"];

export async function acaoPedido(orderId: string, acao: AcaoPedido): Promise<R> {
  const user = await usuario();
  if (!user) return { ok: false, erro: "Entre na sua conta." };
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("orders")
    .select("id, status, mp_init_point")
    .eq("tenant_id", T)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!p) return { ok: false, erro: "Pedido não encontrado." };

  if (acao === "pagar") {
    if (p.status !== "aguardando_pagamento") return { ok: false, erro: "Este pedido não está aguardando pagamento." };
    if (!p.mp_init_point) return { ok: false, erro: "Link de pagamento indisponível. Fale com a loja." };
    await auditar(user.id, "pedido.pagamento_retomado", "orders", p.id, null, { status: p.status });
    return { ok: true, url: p.mp_init_point };
  }
  if (acao === "imprimir") {
    await auditar(user.id, "pedido.impresso", "orders", p.id, null, { status: p.status });
    return { ok: true };
  }
  if (acao === "refazer") {
    if (p.status !== "cancelado") return { ok: false, erro: "Só pedido cancelado pode ser refeito." };
    await auditar(user.id, "pedido.refeito", "orders", p.id, null, { status: p.status });
    return { ok: true };
  }
  // nota fiscal: solicitacao unica por pedido
  if (!PAGOS.includes(p.status)) return { ok: false, erro: "A nota é emitida depois do pagamento." };
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", T)
    .eq("entity_id", p.id)
    .eq("action", "pedido.nf_solicitada");
  if ((count ?? 0) > 0) return { ok: true };
  await auditar(user.id, "pedido.nf_solicitada", "orders", p.id, null, { status: p.status });
  revalidatePath("/conta/pedidos");
  return { ok: true };
}
