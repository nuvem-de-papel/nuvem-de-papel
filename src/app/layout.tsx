import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuvem de Papel",
  description: "Sua papelaria favorita agora na nuvem.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
