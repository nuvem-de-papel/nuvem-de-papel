import type { Metadata } from "next";
import { LoginForm } from "@/components/login/LoginForm";
import { CamadasFundo } from "@/components/FundoRotativo";

export const metadata: Metadata = {
  title: "Entrar — Nuvem de Papel",
  description: "Entrar na sua conta Nuvem de Papel.",
};

export default function LoginPage() {
  // 19/11/2026: fundo rotativo (3 fotos) atras do cartao de vidro.
  return (
    <div className="fundo-rotativo" style={{ minHeight: "calc(100vh - 110px)" }}>
      <CamadasFundo />
      <LoginForm />
    </div>
  );
}
