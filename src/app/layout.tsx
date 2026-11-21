import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer, FloatingSocial } from "@/components/Footer";
import { WhatsChat } from "@/components/WhatsChat";
import { CartProvider } from "@/components/carrinho/CartProvider";
import { OrcamentoProvider } from "@/components/orcamento/OrcamentoProvider";
import { getBrandingCssVars } from "@/lib/branding";
import { PainelAcessibilidade } from "@/components/acessibilidade/PainelAcessibilidade";
import { VLibrasWidget } from "@/components/acessibilidade/VLibrasWidget";
import { SCRIPT_PREFS_A11Y } from "@/lib/acessibilidade";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuvem de Papel",
  description: "Sua papelaria favorita agora na nuvem.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandingCss = await getBrandingCssVars();

  return (
    // suppressHydrationWarning: o script abaixo poe as classes de
    // acessibilidade no <html> antes do React (padrao comum 20/11/2026)
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_PREFS_A11Y }} />
        {brandingCss && <style dangerouslySetInnerHTML={{ __html: brandingCss }} />}
      </head>
      <body>
        <CartProvider>
          <OrcamentoProvider>
          <Header />
          <FloatingSocial />
          <WhatsChat />
          {children}
          <Footer />
        </OrcamentoProvider>
        </CartProvider>
        <PainelAcessibilidade />
        <VLibrasWidget />
      </body>
    </html>
  );
}
