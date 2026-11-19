import type { Metadata } from "next";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Entrar — Nuvem de Papel",
  description: "Entrar na sua conta Nuvem de Papel.",
};

export default function LoginPage() {
  // 19/11/2026: hero com foto do Pexels atras do formulario (fundo-login).
  return (
    <div className="fundo-animado fundo-login" style={{ minHeight: "calc(100vh - 110px)" }}>
      <LoginForm />
    </div>
  );
}
