import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCombinaCom, getPaginaProduto } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { ProductActions } from "@/components/produtos/ProductActions";

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// Pagina do produto (grade). Topo: foto principal + 4 informacoes embaixo.
// Direita: nome, preco, seletor de cor (variantes com foto) e carrinho.
// Variante escolhida via ?v=SKU (ex.: /produtos/BLT38?v=BLT38A).
export default async function PaginaProdutoPage({
  params,
  searchParams,
}: {
  params: { sku: string };
  searchParams: { v?: string };
}) {
  const pagina = await getPaginaProduto(decodeURIComponent(params.sku), searchParams.v ?? null);
  if (!pagina) notFound();
  const { principal, selecionado, variantes, galeria } = pagina;
  const combina = await getCombinaCom(selecionado.sku);

  return (
    <>
    <main className="fundo-animado" style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 32px 72px" }}>
      <nav style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 18 }}>
        <Link href="/">Home</Link> / <Link href="/produtos">Produtos</Link> / {principal.name}
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
        <div>
          <ProductImage
            category={selecionado.category}
            name={selecionado.name}
            fotoUrl={selecionado.fotoUrl}
            style={{ aspectRatio: "1 / 1", height: "auto", border: "1px solid var(--cta)" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
            {[0, 1, 2, 3].map((i) =>
              galeria[i] ? (
                <img
                  key={i}
                  src={galeria[i]}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "contain",
                    borderRadius: 10,
                    background: "#fff",
                    border: "1px solid var(--ink-faint)",
                  }}
                />
              ) : (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    border: "1px dashed var(--ink-faint)",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "var(--ink-soft)",
                  }}
                >
                  {["Detalhe", "Medidas", "Verso", "Pack"][i]}
                </div>
              )
            )}
          </div>
        </div>

        <div>
          <h1 className="display" style={{ fontSize: 30, margin: "0 0 6px" }}>
            {principal.name}
          </h1>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
            SKU: {selecionado.sku}
            {selecionado.cor ? ` · ${selecionado.cor}` : ""}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 12 }}>{moeda(selecionado.price)}</div>
          {selecionado.description && (
            <p style={{ lineHeight: 1.6, color: "var(--ink)", margin: "0 0 22px", fontSize: 15 }}>{selecionado.description}</p>
          )}

          {variantes.length > 1 && (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--ink-soft)",
                  marginBottom: 10,
                }}
              >
                Cor
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
                {variantes.map((v) => {
                  const ativo = v.sku === selecionado.sku;
                  const href =
                    v.sku === principal.sku ? `/produtos/${principal.sku}` : `/produtos/${principal.sku}?v=${v.sku}`;
                  return (
                    <Link
                      key={v.sku}
                      href={href}
                      style={{
                        width: 96,
                        textAlign: "center",
                        textDecoration: "none",
                        color: "var(--ink)",
                        border: ativo ? "2px solid var(--ink)" : "2px solid var(--ink-faint)",
                        boxShadow: ativo ? "0 0 0 3px var(--pink-100)" : "none",
                        borderRadius: 12,
                        padding: 6,
                        background: "#fff",
                      }}
                    >
                      <ProductImage
                        category={v.category}
                        name={v.name}
                        fotoUrl={v.fotoUrl}
                        style={{ aspectRatio: "1 / 1", height: "auto" }}
                      />
                      <span style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                        {v.cor ?? v.sku}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          <ProductActions produto={selecionado} grande />
        </div>
      </div>

    </main>
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "18px 56px 72px", boxSizing: "border-box" }}>
      <CategoryCarousel title="Combina com" products={combina} intensidadeCor={10} encaixar autoPlayMs={4000} />
    </div>
    </>
  );
}
