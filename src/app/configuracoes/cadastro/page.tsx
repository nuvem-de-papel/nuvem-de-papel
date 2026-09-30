import type { Metadata } from "next";
import { CadastrosTelaUnica } from "@/components/conta/CadastrosTelaUnica";
import { PageHeader } from "@/components/admin/PageHeader";

export const metadata: Metadata = {
  title: "Configurações · Cadastro — Nuvem de Papel",
  description: "Cadastro de cliente, produto e dados cadastrais da empresa.",
};

export default function CadastroPage() {
  return (
    <>
      <PageHeader
        titulo="Cadastros"
        subtitulo="Clientes, produtos e dados da empresa emitente — tudo em um lugar só."
        voltarPara="/crm"
      />
      <CadastrosTelaUnica />
    </>
  );
}
