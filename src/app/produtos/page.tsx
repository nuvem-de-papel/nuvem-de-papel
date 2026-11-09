import { Fragment, type ReactNode } from "react";
import { getStoreProducts, type VarejoProduct } from "@/lib/products";
import { CATEGORIAS_PRODUTOS } from "@/lib/categoriasProdutos";
import { BannerSlider } from "@/components/produtos/BannerSlider";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { PromoStrip, PROMO_ICONS } from "@/components/produtos/PromoStrip";
import { PageHeader } from "@/components/admin/PageHeader";

type Group = { slug: string; title: string; items: VarejoProduct[] };

// 09/11/2026 (pedido do Joaquim): 6 secoes FIXAS, uma por categoria de
// CATEGORIAS_PRODUTOS (mesma lista usada no CategoryShowcase da home) -
// sempre nessa ordem e sempre as 6, mesmo vazia, pra servir de destino
// fixo pro clique no icone de categoria ("#cadernos", "#canetas" etc).
// Antes disso a pagina montava grupos dinamicos a partir do catalogo e
// escondia os vazios; agora quem decide o agrupamento e a lista fixa.
function groupProducts(produtos: VarejoProduct[]): Group[] {
  const groups: Group[] = CATEGORIAS_PRODUTOS.map((c) => ({ slug: c.slug, title: c.titulo, items: [] }));
  const catchAllIdx = groups.length - 1;

  for (const p of produtos) {
    const key = (p.category ?? "").toLowerCase();
    const idx = CATEGORIAS_PRODUTOS.findIndex((c) => c.match.test(key));
    groups[idx >= 0 ? idx : catchAllIdx].items.push(p);
  }

  return groups;
}

export default async function ProdutosPage() {
  const produtos = await getStoreProducts();
  const groups = groupProducts(produtos);

  const midBanners: Record<number, { variant: "pink" | "green"; icon: ReactNode; title: string; text: string; tag: string }> = {
    1: {
      variant: "pink",
      icon: PROMO_ICONS.scissors,
      title: "Armaria & criatividade",
      text: "Cola, tesoura, papel colorido e muito mais.",
      tag: "Ver tudo",
    },
    3: {
      variant: "green",
      icon: PROMO_ICONS.backpack,
      title: "Escolar 2027",
      text: "Tudo para o ano letivo com preços de lançamento.",
      tag: "40% OFF",
    },
  };

  return (
    <main style={{ paddingBottom: 72 }}>
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 24px" }}>
        <PageHeader
          titulo="Produtos"
          subtitulo={<>{produtos.length} produtos no catálogo — direto do banco de dados.</>}
          voltarPara="/"
        />
      </section>

      {/* banners na MESMA largura dos catálogos (pedido do cliente) */}
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <BannerSlider />
      </div>

      {groups.map((group, i) => (
        <Fragment key={group.slug}>
          <div
            id={group.slug}
            style={{
              maxWidth: 1240,
              margin: "0 auto",
              padding: i === 0 ? "34px 32px 0" : "18px 32px 0",
              // cabecalho fica sticky (61px) - folga pro titulo da secao nao
              // ficar colado/escondido quando chega via #ancora.
              scrollMarginTop: 77,
            }}
          >
            <CategoryCarousel title={group.title} products={group.items} />
          </div>
          {midBanners[i] && (
            <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
              <PromoStrip {...midBanners[i]} />
            </div>
          )}
        </Fragment>
      ))}

      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "38px 32px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 className="display" style={{ fontSize: 23 }}>
            Promoções imperdíveis
          </h2>
          <span style={{ flex: 1, height: 2, background: "var(--pink-300)", borderRadius: 2 }} />
        </div>
      </section>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 32px",
        }}
      >
        <PromoStrip
          variant="navy"
          icon={PROMO_ICONS.truck}
          title="Frete grátis acima de R$ 199,00"
          text="Para todo o Brasil, via Correios/PAC."
          tag="Aproveite"
        />
        <PromoStrip
          variant="pink"
          icon={PROMO_ICONS.gift}
          title="Clube Nuvem de Papel"
          text="Assinatura mensal com brindes e descontos exclusivos."
          tag="Assine já"
        />
        <PromoStrip
          variant="light"
          icon={PROMO_ICONS.pencil}
          title="Coleção Escolar 2027"
          text="Cadernos, mochilas e material com até 40% off."
          tag="Ver coleção"
        />
      </div>
    </main>
  );
}
