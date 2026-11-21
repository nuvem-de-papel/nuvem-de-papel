"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { cnpjValido } from "@/lib/documento";
import { alertarPedidoCorporativo } from "@/lib/alerta-corporativo";
import { revalidatePath } from "next/cache";

// Conta corporativa (0059 - 20/11/2026). Desde 20/11 (pedido do Joaquim) a
// empresa nasce 'ativa', sem fila de aprovacao: o cliente corporativo chega
// por link ou CNPJ ja conhecido da loja. Limite e prazo nascem com o padrao
// abaixo e a gestao ajusta/bloqueia em Cadastros > Revenda. O login que
// cadastra vira o 'admin' da empresa (corporate_buyers). Escrita so pela
// service_role, sempre com audit_log.

const LIMITE_PADRAO = 1000;
const PRAZO_PADRAO = 30;

export type ResultadoCorporativo = { ok: true; destino: string } | { ok: false; erro: string; jaCadastrado?: true };

type Entrada = {
  razaoSocial: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  senha: string;
  confirmarSenha?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  // Logado: a tela mostra "logado como X" e exige esta confirmacao, para a
  // empresa nao cair no cadastro de outra pessoa (teste de producao 20/11).
  confirmoLogado?: boolean;
};

const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

function validar(e: Entrada, logado: boolean): string | null {
  const razao = (e.razaoSocial ?? "").trim();
  if (razao.length < 3 || razao.length > 160) return "Razão social deve ter de 3 a 160 caracteres.";
  if (!cnpjValido(e.cnpj)) return "CNPJ inválido (confira os dígitos).";
  const tel = soDigitos(e.telefone);
  if (tel.length < 10 || tel.length > 11) return "Telefone inválido (DDD + número).";
  const cep = soDigitos(e.cep ?? "");
  if (cep.length !== 8) return "CEP inválido (8 dígitos).";
  if ((e.numero ?? "").trim().length < 1) return "Informe o número do endereço.";
  if ((e.cidade ?? "").trim().length < 2) return "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test((e.uf ?? "").trim())) return "Informe o estado (UF).";
  if (logado) return e.confirmoLogado ? null : "Confirme que a empresa fica ligada ao cadastro com que você está logado.";
  if ((e.contato ?? "").trim().length < 3) return "Informe o nome de quem vai comprar (mínimo 3 letras).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e.email ?? "").trim())) return "E-mail inválido.";
  if (!e.senha || e.senha.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  if (e.senha !== e.confirmarSenha) return "A confirmação não bate com a senha.";
  return null;
}

function endereco(e: Entrada) {
  const t = (v: string | undefined, max: number) => ((v ?? "").trim().slice(0, max) || null);
  return {
    cep: soDigitos(e.cep ?? ""),
    logradouro: t(e.logradouro, 160),
    numero: t(e.numero, 20),
    complemento: t(e.complemento, 80),
    bairro: t(e.bairro, 80),
    cidade: t(e.cidade, 80),
    uf: (e.uf ?? "").trim().toUpperCase(),
  };
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
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      customer_id: customerId,
      razao_social: razao,
      cnpj,
      status: "ativa",
      aprovado_em: new Date().toISOString(),
      limite_credito: LIMITE_PADRAO,
      prazo_dias: PRAZO_PADRAO,
    })
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
    action: "corporativo.cadastrado",
    entity: "corporate_accounts",
    entity_id: conta.id,
    after: {
      razao_social: razao,
      cnpj,
      customer_id: customerId,
      status: "ativa",
      limite_credito: LIMITE_PADRAO,
      prazo_dias: PRAZO_PADRAO,
    },
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
  const end = endereco(entrada);
  if (await cnpjJaUsado(admin, cnpj)) {
    return {
      ok: false,
      jaCadastrado: true,
      erro: "Este CNPJ já tem conta corporativa. Use \"Já tenho conta\" e entre com o CNPJ ou o e-mail de acesso.",
    };
  }

  // Caso 1: ja logado como cliente da loja -> a empresa usa o cadastro dele.
  if (user) {
    const [{ data: vinculo }, { data: perfil }, { data: cliente }] = await Promise.all([
      admin.from("corporate_buyers").select("id").eq("auth_user_id", user.id).maybeSingle(),
      admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      admin
        .from("customers")
        .select("id, documento, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf")
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
      .update({ documento: cnpj, telefone: cliente.telefone ?? telefone, ...end })
      .eq("id", cliente.id);
    if (errUp) {
      console.error("customers update corporativo:", errUp);
      return { ok: false, erro: "Não foi possível atualizar seu cadastro. Tente novamente." };
    }
    const r = await criarEmpresa(admin, user.id, cliente.id, razao, cnpj);
    if (!r.ok) {
      // Devolve o cadastro como estava: a empresa nao ficou de pe.
      await admin
        .from("customers")
        .update({
          documento: cliente.documento,
          telefone: cliente.telefone,
          cep: cliente.cep,
          logradouro: cliente.logradouro,
          numero: cliente.numero,
          complemento: cliente.complemento,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          uf: cliente.uf,
        })
        .eq("id", cliente.id);
      return r;
    }
    return { ok: true, destino: "/corporativo" };
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
      return { ok: false, jaCadastrado: true, erro: "Este e-mail já tem cadastro. Entre com ele e a senha; depois de entrar, cadastre a empresa." };
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
      ...end,
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
// Entrar na conta corporativa (20/11/2026): o login e o MESMO da loja
// (e-mail + senha). Aqui tambem aceita o CNPJ: o servidor acha o login
// administrador da empresa e entra com a senha dele. Resposta generica em
// qualquer falha para nao revelar se o CNPJ ou o e-mail existem.

const LOGIN_INVALIDO = "E-mail/CNPJ ou senha inválidos.";

export async function entrarCorporativo(identificador: string, senha: string): Promise<ResultadoCorporativo> {
  const id = (identificador ?? "").trim();
  if (!id || !senha) return { ok: false, erro: "Informe o e-mail ou CNPJ e a senha." };
  let email = id.toLowerCase();
  if (!id.includes("@")) {
    const cnpj = soDigitos(id);
    if (!cnpjValido(cnpj)) return { ok: false, erro: "Digite um e-mail ou um CNPJ válido." };
    const admin = createAdminClient();
    const { data: conta } = await admin
      .from("corporate_accounts")
      .select("id")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("cnpj", cnpj)
      .maybeSingle();
    if (!conta) return { ok: false, erro: LOGIN_INVALIDO };
    const { data: buyer } = await admin
      .from("corporate_buyers")
      .select("auth_user_id")
      .eq("account_id", conta.id)
      .eq("papel", "admin")
      .eq("ativo", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!buyer) return { ok: false, erro: LOGIN_INVALIDO };
    const { data: u } = await admin.auth.admin.getUserById(buyer.auth_user_id);
    if (!u?.user?.email) return { ok: false, erro: LOGIN_INVALIDO };
    email = u.user.email;
  }
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { ok: false, erro: LOGIN_INVALIDO };
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
    // aviso para a loja (etapa 4): best-effort, nunca derruba o pedido
    await alertarPedidoCorporativo(admin, {
      orderId: r.order_id,
      accountId: r.account_id ?? null,
      comprador: user.email ?? user.id,
      observacao: observacao || null,
      actorUserId: user.id,
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
