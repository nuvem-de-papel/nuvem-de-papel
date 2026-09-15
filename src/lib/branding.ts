import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant";

type BrandingTokens = {
  palette?: Record<string, string>;
  shadow?: { soft?: string; card?: string };
};

/**
 * Busca os tokens de branding do tenant (regra 5: identidade visual como JSON
 * estruturado no banco, nunca CSS solto) e devolve um bloco :root{...} pronto
 * pra injetar no <head>, sobrescrevendo os defaults de globals.css.
 * Falha aberta pro visual padrão do canvas se a busca der errado — nunca
 * quebra a página por causa de branding.
 */
export async function getBrandingCssVars(): Promise<string> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tenant_branding")
      .select("branding_tokens")
      .eq("tenant_id", getCurrentTenantId())
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("getBrandingCssVars:", error.message);
      return "";
    }

    const tokens = (data.branding_tokens ?? {}) as BrandingTokens;
    const vars: string[] = [];

    for (const [key, value] of Object.entries(tokens.palette ?? {})) {
      vars.push(`--${key.replace(/_/g, "-")}: ${value};`);
    }
    if (tokens.shadow?.soft) vars.push(`--shadow-soft: ${tokens.shadow.soft};`);
    if (tokens.shadow?.card) vars.push(`--shadow-card: ${tokens.shadow.card};`);

    return vars.length ? `:root{${vars.join("")}}` : "";
  } catch (err) {
    console.error("getBrandingCssVars (exception):", err);
    return "";
  }
}
