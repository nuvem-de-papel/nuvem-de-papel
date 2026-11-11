import type { CSSProperties } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { ProductActions } from "@/components/produtos/ProductActions";

// Card unico do catalogo: home e /produtos usam este mesmo componente
// (mesmo tamanho, mesma linha de acao).
// grande: texto abaixo da imagem maior (usado na vitrine do hero).
export function ProductCard({ produto, grande = false }: { produto: VarejoProduct; grande?: boolean }) {
  // Altura fixa em todos os cards (home, /produtos e vitrine): o nome corta em 2 linhas,
  // para os cards ficarem iguais. Na vitrine do hero a altura vem do quadro (100%).
  const estiloCard: CSSProperties = grande
    ? { height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }
    : { height: 480, boxSizing: "border-box", display: "flex", flexDirection: "column" };
  const estiloNome: CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
  return (
    <div
      style={{
        background: "var(--bg-cloud)",
        border: "1px solid var(--ink-faint)",
        borderRadius: "var(--radius-card)",
        padding: 16,
        boxShadow: "var(--shadow-card)",
        ...estiloCard,
      }}
    >
      <ProductImage
        category={produto.category}
        name={produto.name}
        fotoUrl={produto.fotoUrl}
        style={{ aspectRatio: "auto", height: grande ? 400 : 300 }}
      />
      {produto.category && (
        <span
          style={{
            fontSize: grande ? 13 : 11,
            fontWeight: 700,
            color: "var(--lilac-600)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            display: "block",
            marginTop: 12,
          }}
        >
          {produto.category}
        </span>
      )}
      <h3
        style={{
          ...estiloNome,
          fontFamily: "Open Sans",
          fontWeight: 600,
          fontSize: grande ? 19 : 15,
          margin: "4px 0",
          color: "var(--ink)",
        }}
      >
        {produto.name}
      </h3>
      <ProductActions produto={produto} grande={grande} />
      {produto.estoque !== null && produto.estoque > 0 && produto.estoque <= 5 && (
        <span
          style={{
            display: "block",
            marginTop: 8,
            fontSize: grande ? 13 : 11,
            fontWeight: 700,
            color: "var(--blue-600)",
          }}
        >
          Últimas {produto.estoque} unidades
        </span>
      )}
    </div>
  );
}
