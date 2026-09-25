import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente ADMIN (service role) — uso exclusivo no servidor.
// Ignora RLS por design: só deve ser usado para dados administrativos
// (CRM) que nunca têm policy de leitura pública. NUNCA importar isto
// em um Client Component ou em código que rode no navegador.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
