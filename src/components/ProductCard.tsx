import type { VarejoProduct } from "@/lib/products";

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
      <div
        style={{
          borderRadius: 10,
          background: "linear-gradient(135deg,var(--blue-100),var(--lilac-100))",
          aspectRatio: "1",
        }}
      />
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
        <button
          style={{
            background: "var(--pink-100)",
            color: "var(--pink-600)",
            width: 38,
            height: 38,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1.4" />
            <circle cx="18" cy="21" r="1.4" />
            <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
