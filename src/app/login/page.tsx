import type { Metadata } from "next";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Entrar — Nuvem de Papel",
  description: "Área restrita — acesso operacional Nuvem de Papel.",
};

export default function LoginPage() {
  return <LoginForm />;
}
