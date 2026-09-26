import type { VarejoProduct } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { AddToCartButton } from "@/components/carrinho/AddToCartButton";

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function ProductCard({ produto }: { produto: VarejoProduct }) {
  return (
    <div
      style={{
        background: "var(--bg-cloud)",
        border: "1px solid var(--ink-faint)",
        borderRadius: "var(--radius-card)",
        padding: 16,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <ProductImage category={produto.category} />
      {produto.category && (
        <span
          style={{
            fontSize: 11,
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
          fontFamily: "Open Sans",
          fontWeight: 600,
          fontSize: 15,
          margin: "4px 0",
          color: "var(--ink)",
        }}
      >
        {produto.name}
      </h3>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <span className="display" style={{ fontSize: 18 }}>
          {formatPrice(produto.price)}
        </span>
        <AddToCartButton produto={produto} disabled={produto.estoque === 0} />
      </div>
      {produto.estoque === 0 && (
        <span
          style={{
            display: "block",
            marginTop: 8,
            fontSize: 11,
            fontWeight: 700,
            color: "#FFFFFF",
            background: "var(--pink-600)",
            borderRadius: 999,
            padding: "3px 10px",
            width: "fit-content",
          }}
        >
          Esgotado
        </span>
      )}
      {produto.estoque !== null && produto.estoque > 0 && produto.estoque <= 5 && (
        <span
          style={{
            display: "block",
            marginTop: 8,
            fontSize: 11,
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
