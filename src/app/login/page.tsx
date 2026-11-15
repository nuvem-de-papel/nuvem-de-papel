import type { Metadata } from "next";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Entrar — Nuvem de Papel",
  description: "Entrar na sua conta Nuvem de Papel.",
};

export default function LoginPage() {
  return <LoginForm />;
}
