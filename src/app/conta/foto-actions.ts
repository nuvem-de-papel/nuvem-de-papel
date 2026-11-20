"use server";

// Foto do cliente na area "sua conta" (19/11/2026). Sobe no bucket publico
// `produtos` (0056) em clientes/<id>.<ext> pela service_role e grava a URL em
// customers.foto_url (0029). O cliente so troca a PROPRIA foto (auth_user_id).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function trocarFotoCliente(form: FormData): Promise<{ ok: boolean; erro?: string }> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return { ok: false, erro: "Entre na sua conta." };
  const arq = form.get("foto");
  if (!(arq instanceof File) || arq.size === 0) return { ok: false, erro: "Escolha uma imagem." };
  const ext = TIPOS[arq.type];
  if (!ext) return { ok: false, erro: "Use JPG, PNG ou WEBP." };
  if (arq.size > 2 * 1024 * 1024) return { ok: false, erro: "Imagem acima de 2 MB." };

  const admin = createAdminClient();
  const { data: cli } = await admin
    .from("customers")
    .select("id, foto_url")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!cli) return { ok: false, erro: "Cadastro não encontrado." };

  const caminho = `clientes/${cli.id}-${Date.now()}.${ext}`;
  const up = await admin.storage.from("produtos").upload(caminho, Buffer.from(await arq.arrayBuffer()), {
    contentType: arq.type,
    upsert: false,
  });
  if (up.error) return { ok: false, erro: "Falha ao enviar a imagem." };
  const url = admin.storage.from("produtos").getPublicUrl(caminho).data.publicUrl;

  await admin.from("customers").update({ foto_url: url }).eq("id", cli.id);
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: user.id,
    action: "cliente.foto_alterada",
    entity: "customers",
    entity_id: cli.id,
    before: { foto_url: cli.foto_url },
    after: { foto_url: url },
  });
  revalidatePath("/conta", "layout");
  return { ok: true };
}
