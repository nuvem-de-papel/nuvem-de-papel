import type { Metadata } from "next";
import { CarrinhoView } from "@/components/carrinho/CarrinhoView";

export const metadata: Metadata = {
  title: "Carrinho — Nuvem de Papel",
  description: "Revise os itens do seu carrinho antes de finalizar.",
};

export default function CarrinhoPage() {
  return <CarrinhoView />;
}
