import { getVarejoProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export default async function ProdutosPage() {
  const produtos = await getVarejoProducts();

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8 }}>
        Produtos
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        {produtos.length} produtos no catálogo — direto do banco de dados.
      </p>

      {produtos.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Nenhum produto encontrado.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 22,
          }}
        >
          {produtos.map((produto) => (
            <ProductCard key={produto.id} produto={produto} />
          ))}
        </div>
      )}
    </main>
  );
}
