// Regras de abertura do checkout (F3). Fail-closed: só vende com meio de
// pagamento pronto (MP configurado) ou liberação explícita (CHECKOUT_LIBERADO=1)
// — assim produção não aceita pedido sem conseguir cobrar.
export function checkoutAberto(): boolean {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  const mpPronto = token.length > 20 && token.includes("-");
  return mpPronto || process.env.CHECKOUT_LIBERADO === "1";
}
