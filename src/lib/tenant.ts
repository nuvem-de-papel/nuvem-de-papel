/**
 * Nuvem de Papel opera hoje como tenant único, mas o schema já é multi-tenant
 * (regra 2 do AGENTS.md) para permitir migração futura sem dano estrutural.
 * Nunca derivar tenant_id de query string / form field — só desta constante
 * (ou, quando o modelo crescer, de uma resolução server-side real por sessão).
 */
export const NUVEM_DE_PAPEL_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export function getCurrentTenantId(): string {
  return NUVEM_DE_PAPEL_TENANT_ID;
}
