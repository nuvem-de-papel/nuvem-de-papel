import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer, FloatingSocial } from "@/components/Footer";
import { getBrandingCssVars } from "@/lib/branding";

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
    <html lang="pt-BR">
      <head>
        {brandingCss && <style dangerouslySetInnerHTML={{ __html: brandingCss }} />}
      </head>
      <body>
        <Header />
        <FloatingSocial />
        {children}
        <Footer />
      </body>
    </html>
  );
}
