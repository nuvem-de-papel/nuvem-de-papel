"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { cnpjValido } from "@/lib/documento";
import { revalidatePath } from "next/cache";

// Conta corporativa (0059 - 20/11/2026). A empresa nasce 'pendente' e so
// compra depois que a gestao aprova em Cadastros > Revenda. O login que
// solicita vira o 'admin' da empresa (corporate_buyers). Escrita so pela
// service_role, sempre com audit_log.

export type ResultadoCorporativo = { ok: true; destino: string } | { ok: false; erro: string; jaCadastrado?: true };

type Entrada = {
  razaoSocial: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  senha: string;
};

const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

function validar(e: Entrada, logado: boolean): string | null {
  const razao = (e.razaoSocial ?? "").trim();
  if (razao.length < 3 || razao.length > 160) return "Razão social deve ter de 3 a 160 caracteres.";
  if (!cnpjValido(e.cnpj)) return "CNPJ inválido (confira os dígitos).";
  const tel = soDigitos(e.telefone);
  if (tel.length < 10 || tel.length > 11) return "Telefone inválido (DDD + número).";
  if (logado) return null;
  if ((e.contato ?? "").trim().length < 3) return "Informe o nome de quem vai comprar (mínimo 3 letras).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e.email ?? "").trim())) return "E-mail inválido.";
  if (!e.senha || e.senha.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  return null;
}

async function cnpjJaUsado(admin: ReturnType<typeof createAdminClient>, cnpj: string): Promise<boolean> {
  const { data } = await admin
    .from("corporate_accounts")
    .select("id")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("cnpj", cnpj)
    .maybeSingle();
  return !!data;
}

async function criarEmpresa(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  customerId: string,
  razao: string,
  cnpj: string
): Promise<{ ok: true; accountId: string } | { ok: false; erro: string }> {
  const { data: conta, error } = await admin
    .from("corporate_accounts")
    .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, customer_id: customerId, razao_social: razao, cnpj })
    .select("id")
    .single();
  if (error || !conta) {
    if (error?.code === "23505") return { ok: false, erro: "Este CNPJ já tem conta corporativa. Peça acesso ao administrador da empresa." };
    console.error("corporate_accounts insert:", error);
    return { ok: false, erro: "Não foi possível registrar a empresa agora. Tente novamente." };
  }
  const { error: errBuyer } = await admin
    .from("corporate_buyers")
    .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, account_id: conta.id, auth_user_id: userId, papel: "admin" });
  if (errBuyer) {
    await admin.from("corporate_accounts").delete().eq("id", conta.id);
    console.error("corporate_buyers insert:", errBuyer);
    return { ok: false, erro: "Não foi possível vincular seu login à empresa. Tente novamente." };
  }
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "corporativo.solicitado",
    entity: "corporate_accounts",
    entity_id: conta.id,
    after: { razao_social: razao, cnpj, customer_id: customerId, status: "pendente" },
  });
  return { ok: true, accountId: conta.id };
}

export async function solicitarContaCorporativa(entrada: Entrada): Promise<ResultadoCorporativo> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const erro = validar(entrada, !!user);
  if (erro) return { ok: false, erro };

  const admin = createAdminClient();
  const razao = entrada.razaoSocial.trim();
  const cnpj = soDigitos(entrada.cnpj);
  const telefone = soDigitos(entrada.telefone);
  if (await cnpjJaUsado(admin, cnpj)) {
    return { ok: false, erro: "Este CNPJ já tem conta corporativa. Peça acesso ao administrador da empresa." };
  }

  // Caso 1: ja logado como cliente da loja -> a empresa usa o cadastro dele.
  if (user) {
    const [{ data: vinculo }, { data: perfil }, { data: cliente }] = await Promise.all([
      admin.from("corporate_buyers").select("id").eq("auth_user_id", user.id).maybeSingle(),
      admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      admin
        .from("customers")
        .select("id, documento, telefone")
        .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]);
    if (vinculo) return { ok: false, erro: "Seu login já está ligado a uma empresa." };
    if (perfil) return { ok: false, erro: "Login da equipe não pode solicitar conta corporativa. Use um e-mail de cliente." };
    if (!cliente) return { ok: false, erro: "Cadastro de cliente não encontrado. Saia e cadastre a empresa com um e-mail novo." };
    const doc = soDigitos(cliente.documento ?? "");
    if (doc && doc !== cnpj) {
      return {
        ok: false,
        erro: "Seu cadastro já tem outro CPF/CNPJ. Para a empresa, saia e cadastre com outro e-mail.",
      };
    }
    const { error: errUp } = await admin
      .from("customers")
      .update({ documento: cnpj, telefone: cliente.telefone ?? telefone })
      .eq("id", cliente.id);
    if (errUp) {
      console.error("customers update corporativo:", errUp);
      return { ok: false, erro: "Não foi possível atualizar seu cadastro. Tente novamente." };
    }
    const r = await criarEmpresa(admin, user.id, cliente.id, razao, cnpj);
    return r.ok ? { ok: true, destino: "/corporativo" } : r;
  }

  // Caso 2: visitante -> cria login + cadastro da empresa + vinculo admin.
  const email = entrada.email.toLowerCase().trim();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: entrada.senha,
    email_confirm: true,
    user_metadata: { full_name: entrada.contato.trim() },
  });
  if (authError || !authData.user) {
    if (authError?.code === "email_exists" || /already (been )?registered/i.test(authError?.message ?? "")) {
      return { ok: false, jaCadastrado: true, erro: "Este e-mail já tem cadastro. Entre com sua senha e solicite a conta da empresa." };
    }
    console.error("createUser corporativo:", authError);
    return { ok: false, erro: "Não foi possível criar seu acesso agora. Tente novamente." };
  }
  const userId = authData.user.id;

  const { data: cliente, error: errCli } = await admin
    .from("customers")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      auth_user_id: userId,
      name: razao,
      email,
      telefone,
      documento: cnpj,
      tier: "bronze",
      points: 0,
      ativo: true,
    })
    .select("id")
    .single();
  if (errCli || !cliente) {
    await admin.auth.admin.deleteUser(userId);
    console.error("customers insert corporativo:", errCli);
    return { ok: false, erro: "Não foi possível criar o cadastro da empresa. Tente novamente." };
  }

  const r = await criarEmpresa(admin, userId, cliente.id, razao, cnpj);
  if (!r.ok) {
    await admin.from("customers").delete().eq("id", cliente.id);
    await admin.auth.admin.deleteUser(userId);
    return r;
  }

  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: entrada.senha });
  if (loginError) return { ok: false, erro: "Empresa cadastrada. Entre com seu e-mail e senha para acompanhar." };
  return { ok: true, destino: "/corporativo" };
}

// ------------------------------------------------------------------------
// Pedido corporativo no atacado (0060 - etapa 3, 20/11/2026). Preco, credito,
// estoque e titulo sao decididos pela RPC corporate_place_order (service_role):
// a tela so manda item + quantidade. Disponivel = limite - parcelas em aberto
// dos pedidos da empresa; parcela vencida trava pedido novo.

export type ItemPedidoCorporativo = { itemId: string; quantidade: number };
export type EntregaCorporativa = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};
export type ResultadoPedidoCorporativo =
  | { ok: true; orderId: string; total: number; vencimento: string; duplicado: boolean }
  | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const brlTxt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function traduzirErroPedido(msg: string): string {
  const m = msg ?? "";
  const lim = m.match(/LIMITE_INSUFICIENTE: disponivel ([\d.]+) total ([\d.]+)/);
  if (lim) {
    return `Limite de crédito insuficiente: disponível ${brlTxt(Number(lim[1]))}, pedido de ${brlTxt(Number(lim[2]))}.`;
  }
  const venc = m.match(/TITULO_VENCIDO: ([\d.]+)/);
  if (venc) {
    return `A empresa tem ${brlTxt(Number(venc[1]))} em parcelas vencidas. Regularize para fazer pedidos novos.`;
  }
  if (m.includes("COMPRADOR_SEM_PERMISSAO")) return "Seu acesso é do financeiro: você acompanha, mas não faz pedidos.";
  if (m.includes("COMPRADOR_INEXISTENTE")) return "Seu login não está ligado a uma empresa ativa.";
  if (m.includes("CONTA_NAO_ATIVA")) return "A conta da empresa não está ativa.";
  if (m.includes("CLIENTE_BLOQUEADO")) return "O cadastro da empresa está bloqueado. Fale com o atendimento.";
  if (m.includes("SEM_PRECO_OU_INATIVO")) return "Um dos produtos saiu de linha ou está sem preço. Atualize a página.";
  if (m.includes("ESTOQUE_INSUFICIENTE") || m.includes("SALDO_INSUFICIENTE")) return "Estoque insuficiente para um dos produtos.";
  if (m.includes("CARRINHO_VAZIO")) return "Adicione pelo menos um produto.";
  if (m.includes("ITENS_DEMAIS")) return "Máximo de 100 produtos por pedido.";
  if (m.includes("QUANTIDADE_INVALIDA")) return "Quantidade inválida.";
  if (m.includes("ENTREGA_ENDERECO_INVALIDO")) return "Informe o endereço de entrega (rua).";
  if (m.includes("OBSERVACAO_LONGA")) return "Observação com mais de 500 caracteres.";
  return "Não foi possível registrar o pedido agora. Tente novamente.";
}

export async function fazerPedidoCorporativo(entrada: {
  itens: ItemPedidoCorporativo[];
  entrega: EntregaCorporativa | null;
  observacao: string;
  chave: string;
}): Promise<ResultadoPedidoCorporativo> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Entre com seu login para fazer o pedido." };

  const itens = (entrada.itens ?? []).filter((i) => i && i.quantidade > 0);
  if (itens.length === 0) return { ok: false, erro: "Adicione pelo menos um produto." };
  if (itens.length > 100) return { ok: false, erro: "Máximo de 100 produtos por pedido." };
  for (const i of itens) {
    if (!UUID.test(i.itemId)) return { ok: false, erro: "Produto inválido. Atualize a página." };
    if (!Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 99999) {
      return { ok: false, erro: "Quantidade inválida." };
    }
  }
  const observacao = (entrada.observacao ?? "").trim();
  if (observacao.length > 500) return { ok: false, erro: "Observação com mais de 500 caracteres." };
  const chave = (entrada.chave ?? "").trim();
  if (!UUID.test(chave)) return { ok: false, erro: "Atualize a página e tente de novo." };

  let entrega: Record<string, string> | null = null;
  if (entrada.entrega) {
    const e = entrada.entrega;
    if ((e.logradouro ?? "").trim().length < 3) return { ok: false, erro: "Informe o endereço de entrega (rua)." };
    if (soDigitos(e.cep).length !== 8) return { ok: false, erro: "CEP de entrega inválido." };
    entrega = {
      cep: soDigitos(e.cep),
      logradouro: e.logradouro.trim().slice(0, 160),
      numero: (e.numero ?? "").trim().slice(0, 20),
      complemento: (e.complemento ?? "").trim().slice(0, 80),
      bairro: (e.bairro ?? "").trim().slice(0, 80),
      cidade: (e.cidade ?? "").trim().slice(0, 80),
      uf: (e.uf ?? "").trim().toUpperCase().slice(0, 2),
    };
  }

  // soma itens repetidos (a RPC aceitaria, mas o pedido fica mais limpo)
  const somados = new Map<string, number>();
  for (const i of itens) somados.set(i.itemId, (somados.get(i.itemId) ?? 0) + i.quantidade);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("corporate_place_order", {
    p_user: user.id,
    p_items: [...somados].map(([item_id, quantity]) => ({ item_id, quantity })),
    p_entrega: entrega,
    p_observacao: observacao || null,
    p_idempotency_key: `corp:${chave}`,
  });
  if (error || !data) {
    console.error("corporate_place_order:", error);
    return { ok: false, erro: traduzirErroPedido(error?.message ?? "") };
  }
  const r = data as {
    order_id: string;
    account_id?: string;
    total: number | string;
    vencimento?: string;
    disponivel_antes?: number | string;
    duplicate: boolean;
  };

  if (!r.duplicate) {
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: user.id,
      action: "corporativo.pedido",
      entity: "orders",
      entity_id: r.order_id,
      after: {
        account_id: r.account_id,
        total: Number(r.total),
        vencimento: r.vencimento,
        disponivel_antes: Number(r.disponivel_antes ?? 0),
        itens: somados.size,
        entrega: !!entrega,
      },
    });
  }
  revalidatePath("/corporativo");
  revalidatePath("/conta/pedidos");
  revalidatePath("/vendas");
  return {
    ok: true,
    orderId: r.order_id,
    total: Number(r.total),
    vencimento: r.vencimento ?? "",
    duplicado: !!r.duplicate,
  };
}
