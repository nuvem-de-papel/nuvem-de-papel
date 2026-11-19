import { Fragment, type ReactNode } from "react";
import { getStoreProducts } from "@/lib/products";
import { agruparPorGrupo } from "@/lib/categoriasProdutos";
import { createClient } from "@/lib/supabase/server";
import { BannerSlider } from "@/components/produtos/BannerSlider";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { PromoStrip, PROMO_ICONS } from "@/components/produtos/PromoStrip";
import { podeVerPainel } from "@/lib/painel";
import { ehLancamento } from "@/lib/lancamento";
import { createAdminClient } from "@/lib/supabase/admin";
import { CatalogoAdmin, type ItemCatalogoAdmin } from "@/components/catalogo/CatalogoAdmin";
import { carregarGrupos } from "@/lib/gruposSetores";
import { CamadasFundo } from "@/components/FundoRotativo";

type LinhaCatalogo = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  active: boolean;
  grupo_pai: string | null;
  em_oferta: boolean;
  em_destaque: boolean;
  lancamento_ate: string | null;
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
      "id, sku, name, category, active, grupo_pai, em_oferta, em_destaque, lancamento_ate, foto_url, item_stock(stock_available, stock_on_hand), item_commercial_data(min_stock), item_prices(price, min_quantity, valid_from, valid_until, channel), item_images(url, position)"
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
      // 0055: so a data ativa chega na tela (vencido = produto normal).
      lancamentoAte: ehLancamento(r.lancamento_ate) ? String(r.lancamento_ate).slice(0, 10) : null,
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

// Barra do topo sticky (2 linhas, ~118px) + respiro
const OFFSET_SECAO = 130;

export default async function ProdutosPage() {
  // Operacional logado vê o catálogo administrativo dentro do menu lateral do painel;
  // visitante e revenda seguem na loja.
  if (await podeVerPainel()) {
    const [itens, grupos] = await Promise.all([carregarCatalogoAdmin(), carregarGrupos(createAdminClient())]);
    return <CatalogoAdmin itens={itens} grupos={grupos} />;
  }
  // 0057: secoes por GRUPO do banco; o menu "Todas as Categorias" lista so os
  // grupos com produto (sem "Outros"), com o icone de cada um.
  const [produtos, grupos] = await Promise.all([getStoreProducts(), carregarGrupos(createClient())]);
  const groups = agruparPorGrupo(produtos, grupos);

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
    <main className="fundo-rotativo" style={{ paddingBottom: 72, overflowX: "clip" }}>
      <CamadasFundo />
      {/* 19/11/2026: menu antigo (barra fixa + "Todas as Categorias") removido -
          o menu de setores agora mora na barra do topo. O banner comeca
          logo abaixo da barra (sticky, ja ocupa espaco no fluxo). */}
      <div className="faixa-carrossel" style={{ ...PONTA_A_PONTA, paddingTop: 18 }}>
        <BannerSlider />
      </div>

      {groups.map((group, i) => (
        <Fragment key={group.slug}>
          <div id={group.slug} className="faixa-carrossel" style={{ ...PONTA_A_PONTA, padding: i === 0 ? "34px 56px 0" : "18px 56px 0", scrollMarginTop: OFFSET_SECAO }}>
            <CategoryCarousel title={group.title} products={group.items} cor={group.cor} corTitulo={group.corTitulo} intensidadeCor={10} encaixar />
          </div>
          {midBanners[i] && (
            <div className="faixa-carrossel" style={PONTA_A_PONTA}>
              <PromoStrip {...midBanners[i]} />
            </div>
          )}
        </Fragment>
      ))}

      <div className="faixa-carrossel" style={{ ...PONTA_A_PONTA, paddingTop: 38 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
          <h2 className="display" style={{ fontSize: 23 }}>
            Promoções imperdíveis
          </h2>
          <span style={{ flex: 1, height: 2, background: "var(--pink-300)", borderRadius: 2 }} />
        </div>
      </div>

      <div className="faixa-carrossel" style={{ ...PONTA_A_PONTA, display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
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
