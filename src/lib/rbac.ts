// RBAC — fonte única de papeis, usada pelo middleware (servidor), pelo login
// (cliente) e pelas Server Actions de gestão de usuários (Fase 2).

// Papéis que acessam áreas operacionais (/crm, /configuracoes) no mínimo.
export const PAPEIS_OPERACIONAIS: string[] = ["master", "gerente", "operador", "vendedor"];

// Todos os papeis válidos de profiles.role.
export const PAPEIS: string[] = [
  "master",
  "gerente",
  "operador",
  "vendedor",
  "fornecedor",
  "revenda",
];

// Papéis de gestão: console de usuários + leitura da trilha de auditoria.
export const PAPEIS_GESTAO: string[] = ["master", "gerente"];

// Matriz por módulo (parecer-acesso-enterprise §4): prefixo de rota → papéis.
// Sem entrada = PAPEIS_OPERACIONAIS.
export const PAPEIS_POR_MODULO: Record<string, string[]> = {
  "/configuracoes": PAPEIS_GESTAO,
  "/crm": PAPEIS_OPERACIONAIS,
  "/logistica": PAPEIS_OPERACIONAIS,
};

// Hierarquia de gestão: quem pode criar/editar quem.
// master → todos; gerente → operacional/tipos externos (nunca master/gerente).
export const PAPEIS_QUE_GERENCIA: Record<string, string[]> = {
  master: PAPEIS,
  gerente: ["operador", "vendedor", "fornecedor", "revenda"],
};

// true se o papel é permitido no prefixo de rota mais específico.
export function papelPermitidoNoModulo(pathname: string, role: string): boolean {
  const modulo = Object.keys(PAPEIS_POR_MODULO)
    .filter((p) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const permitidos = modulo ? PAPEIS_POR_MODULO[modulo] : PAPEIS_OPERACIONAIS;
  return permitidos.includes(role);
}

// true se `gestor` pode criar/editar usuários com o papel `alvo`.
export function podeGerenciar(gestorRole: string, alvoRole: string): boolean {
  return (PAPEIS_QUE_GERENCIA[gestorRole] ?? []).includes(alvoRole);
}
