import { Fragment, type ReactNode } from "react";
import { getStoreProducts } from "@/lib/products";
import { CATEGORIAS_PRODUTOS, agruparPorSetor } from "@/lib/categoriasProdutos";
import { BannerSlider } from "@/components/produtos/BannerSlider";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { PromoStrip, PROMO_ICONS } from "@/components/produtos/PromoStrip";
import { SetoresMenu } from "@/components/produtos/SetoresMenu";
import { PageHeader } from "@/components/admin/PageHeader";
// Blocos de ponta a ponta da tela (banner, setores e faixas de promocao)
const PONTA_A_PONTA = {
  width: "100vw",
  marginLeft: "calc(50% - 50vw)",
  padding: "0 56px",
  boxSizing: "border-box" as const,
};

// Cabecalho do site (61px) + topo da barra (14px) + barra (64px) + respiro (12px)
const OFFSET_SECAO = 151;

export default async function ProdutosPage() {
  const produtos = await getStoreProducts();
  const groups = agruparPorSetor(produtos);
  const setores = CATEGORIAS_PRODUTOS.map((c) => ({ slug: c.slug, titulo: c.titulo }));

  const midBanners: Record<number, { variant: "pink" | "green"; icon: ReactNode; imagem: string; title: string; text: string; tag: string }> = {
    1: {
      variant: "pink",
      icon: PROMO_ICONS.scissors,
      imagem: "/banners/banner-criatividade.jpg",
      title: "Armaria & criatividade",
      text: "Cola, tesoura, papel colorido e muito mais.",
      tag: "Ver tudo",
    },
    3: {
      variant: "green",
      icon: PROMO_ICONS.backpack,
      imagem: "/banners/banner-escolar.jpg",
      title: "Escolar 2027",
      text: "Tudo para o ano letivo com preços de lançamento.",
      tag: "40% OFF",
    },
  };

  return (
    <main className="fundo-animado fundo-pagina-produtos" style={{ paddingBottom: 72, overflowX: "clip" }}>
      <div
        className="barra-setores"
        style={{
          position: "fixed",
          top: 75,
          left: 0,
          right: 0,
          height: 64,
          zIndex: 40,
          background: "rgba(120, 124, 132, 0.22)",
          backdropFilter: "blur(16px) saturate(0.9)",
          WebkitBackdropFilter: "blur(16px) saturate(0.9)",
          borderTop: "1px solid rgba(255, 255, 255, 0.45)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.45)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
        }}
      >
        <section style={{ maxWidth: 1240, height: "100%", margin: "0 auto", padding: "0 24px", boxSizing: "border-box", display: "flex", alignItems: "center" }}>
          <PageHeader titulo="Produtos" voltarPara="/" meio={<SetoresMenu itens={setores} offsetTopo={OFFSET_SECAO} />} />
        </section>
      </div>
      <div aria-hidden="true" style={{ height: 102 }} />

      <div style={PONTA_A_PONTA}>
        <BannerSlider />
      </div>

      {groups.map((group, i) => (
        <Fragment key={group.slug}>
          <div id={group.slug} style={{ ...PONTA_A_PONTA, padding: i === 0 ? "34px 56px 0" : "18px 56px 0", scrollMarginTop: OFFSET_SECAO }}>
            <CategoryCarousel title={group.title} products={group.items} cor={group.cor} corTitulo={group.corTitulo} intensidadeCor={10} encaixar />
          </div>
          {midBanners[i] && (
            <div style={PONTA_A_PONTA}>
              <PromoStrip {...midBanners[i]} />
            </div>
          )}
        </Fragment>
      ))}

      <div style={{ ...PONTA_A_PONTA, paddingTop: 38 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
          <h2 className="display" style={{ fontSize: 23 }}>
            Promoções imperdíveis
          </h2>
          <span style={{ flex: 1, height: 2, background: "var(--pink-300)", borderRadius: 2 }} />
        </div>
      </div>

      <div style={{ ...PONTA_A_PONTA, display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
        <PromoStrip
          variant="navy"
          icon={PROMO_ICONS.truck}
          imagem="/banners/banner-frete.jpg"
          title="Frete grátis acima de R$ 199,00"
          text="Para todo o Brasil, via Correios/PAC."
          tag="Aproveite"
        />
        <PromoStrip
          variant="pink"
          icon={PROMO_ICONS.gift}
          imagem="/banners/banner-clube.jpg"
          title="Clube Nuvem de Papel"
          text="Assinatura mensal com brindes e descontos exclusivos."
          tag="Assine já"
        />
        <PromoStrip
          variant="light"
          icon={PROMO_ICONS.pencil}
          imagem="/banners/banner-escolar.jpg"
          title="Coleção Escolar 2027"
          text="Cadernos, mochilas e material com até 40% off."
          tag="Ver coleção"
        />
      </div>
    </main>
  );
}
