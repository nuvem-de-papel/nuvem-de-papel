import type { Metadata } from "next";
import { CadastrosTelaUnica } from "@/components/conta/CadastrosTelaUnica";

export const metadata: Metadata = {
  title: "Configurações · Cadastro — Nuvem de Papel",
  description: "Cadastro de cliente, produto e dados cadastrais da empresa.",
};

export default function CadastroPage() {
  return <CadastrosTelaUnica />;
}
