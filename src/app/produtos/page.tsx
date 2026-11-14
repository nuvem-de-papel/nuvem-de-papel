import { Fragment, type ReactNode } from "react";
import { getStoreProducts } from "@/lib/products";
import { CATEGORIAS_PRODUTOS, agruparPorSetor } from "@/lib/categoriasProdutos";
import { BannerSlider } from "@/components/produtos/BannerSlider";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { PromoStrip, PROMO_ICONS } from "@/components/produtos/PromoStrip";
import { SetoresMenu } from "@/components/produtos/SetoresMenu";
import { PageHeader } from "@/components/admin/PageHeader";
import { podeVerPainel } from "@/lib/painel";
import { createAdminClient } from "@/lib/supabase/admin";
import { CatalogoAdmin, type ItemCatalogoAdmin } from "@/components/catalogo/CatalogoAdmin";

type LinhaCatalogo = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  active: boolean;
  grupo_pai: string | null;
  em_oferta: boolean;
  em_destaque: boolean;
  foto_url: string | null;
  item_stock: unknown;
  item_commercial_data: unknown;
  item_prices: unknown;
  item_images: unknown;
};

function primeiro<T>(v: unknown): T | null {
  return Array.isArray(v) ? ((v[0] ?? null) as T | null) : ((v ?? null) as T | null);
}

// Catálogo do painel: inclui inativos (a loja filtra; o admin vê tudo).
async function carregarCatalogoAdmin(): Promise<ItemCatalogoAdmin[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .select(
      "id, sku, name, category, active, grupo_pai, em_oferta, em_destaque, foto_url, item_stock(stock_available, stock_on_hand), item_commercial_data(min_stock), item_prices(price, min_quantity, valid_from, valid_until, channel), item_images(url, position)"
    )
    .order("sku", { ascending: true });
  if (error) throw new Error(`Catálogo: ${error.message}`);
  const agora = Date.now();
  const linhas = (data ?? []) as unknown as LinhaCatalogo[];
  return linhas.map((r) => {
    const est = primeiro<{ stock_available: number; stock_on_hand: number }>(r.item_stock);
    const com = primeiro<{ min_stock: number }>(r.item_commercial_data);
    const imagens = (Array.isArray(r.item_images) ? r.item_images : []) as { url: string; position: number }[];
    const precos = (Array.isArray(r.item_prices) ? r.item_prices : []) as {
      price: number | string;
      min_quantity: number;
      valid_from: string;
      valid_until: string | null;
      channel: string;
    }[];
    const vigentes = precos
      .filter(
        (p) =>
          p.channel === "varejo" &&
          new Date(p.valid_from).getTime() <= agora &&
          (!p.valid_until || new Date(p.valid_until).getTime() > agora)
      )
      .sort((a, b) => a.min_quantity - b.min_quantity);
    return {
      id: r.id,
      sku: r.sku,
      nome: r.name,
      categoria: r.category,
      ativo: r.active,
      grupoPai: r.grupo_pai,
      emOferta: r.em_oferta,
      emDestaque: r.em_destaque,
      foto: r.foto_url ?? imagens.find((i) => i.position === 0)?.url ?? null,
      minimo: com ? Number(com.min_stock) : 0,
      fisico: est ? Number(est.stock_on_hand) : null,
      disponivel: est ? Number(est.stock_available) : null,
      venda: vigentes[0] ? Number(vigentes[0].price) : null,
    };
  });
}

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
  // Operacional logado vê o catálogo administrativo dentro do menu lateral do painel;
  // visitante e revenda seguem na loja.
  if (await podeVerPainel()) {
    return <CatalogoAdmin itens={await carregarCatalogoAdmin()} />;
  }
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
