import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Corporativo — Nuvem de Papel",
  description: "Atendimento a empresas com compras recorrentes.",
};

// Corporativo (20/11/2026): pagina de entrada; a area do comprador PJ
// (pedidos em aberto, recentes, novo pedido, prazos, pagamentos, promocoes)
// esta desenhada e documentada, aguardando aprovacao para implementacao.
export default function CorporativoPage() {
  return (
    <main className="conta-shell">
      <section className="conta-secao">
        <h1 className="display">Atendimento corporativo</h1>
        <p>
          Empresas com compras recorrentes contam com condições comerciais próprias: prazos de pagamento,
          faturamento por CNPJ, acompanhamento de pedidos em aberto e promoções exclusivas.
        </p>
        <p>
          Para habilitar sua empresa, cadastre-se com o CNPJ ou fale com nosso atendimento pelo botão do canto da tela.
        </p>
      </section>
    </main>
  );
}
