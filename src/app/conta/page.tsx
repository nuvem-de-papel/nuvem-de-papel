import type { Metadata } from "next";
import { CadastrosTelaUnica } from "@/components/conta/CadastrosTelaUnica";

export const metadata: Metadata = {
  title: "Área do Cliente — Nuvem de Papel",
  description: "Cadastro de cliente, produto e dados cadastrais da empresa.",
};

export default function ContaPage() {
  return <CadastrosTelaUnica />;
}
