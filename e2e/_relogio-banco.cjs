/* t0 com o RELÓGIO DO BANCO - helper das suítes E2E.
 *
 * created_at de orders (e todo now() do Postgres) vem do relógio do Supabase,
 * medido ~5,5 s ATRASADO em relação à máquina local (3 amostras: -5,7/-5,8/
 * -5,1 s). Toda suíte que grava t0 com new Date() e depois filtra
 * .gte("created_at", t0) fica à mercê desse desfasado: quando ele passa da
 * janela entre t0 e a gravação do registro (~3 s no F5), o pedido "nasce
 * antes" do t0 no relógio do banco e o check falha intermitentemente.
 *
 * A função grava um marco em audit_log (created_at = now() do banco), lê o
 * timestamp devolvido, apaga o marco e devolve a string - os dois lados da
 * comparação passam a usar o MESMO relógio. Chamar com await.
 */
async function t0Banco(admin, tenantId) {
  const { data: marco, error } = await admin
    .from("audit_log")
    .insert({
      tenant_id: tenantId,
      action: "e2e.relogio.t0",
      entity: "orders",
      after: { suite: "t0" },
    })
    .select("created_at")
    .single();
  if (error) throw new Error("t0Banco (audit_log): " + error.message);
  await admin
    .from("audit_log")
    .delete()
    .eq("action", "e2e.relogio.t0")
    .eq("tenant_id", tenantId);
  return marco.created_at;
}

module.exports = { t0Banco };
