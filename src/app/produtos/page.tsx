import { Fragment } from "react";
import { getStoreProducts, type VarejoProduct } from "@/lib/products";
import { BannerSlider } from "@/components/produtos/BannerSlider";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { PromoStrip, PROMO_ICONS } from "@/components/produtos/PromoStrip";

const GROUP_DEFS: { title: string; test: RegExp }[] = [
  { title: "Cadernos & agendas", test: /caderno|agenda|planner|fichari|bloco|bloqu/ },
  { title: "Papelaria criativa", test: /criativ|adesiv|papel|arma|cola|tesoura|artesan|presente|acessor/ },
  { title: "Material escolar", test: /escolar|l[áa]pis|caneta|material/ },
];

type Group = { title: string; items: VarejoProduct[] };

function groupProducts(produtos: VarejoProduct[]): Group[] {
  const groups: Group[] = GROUP_DEFS.map((g) => ({ title: g.title, items: [] }));
  const extras: Group[] = [];

  for (const p of produtos) {
    const key = (p.category ?? "").toLowerCase();
    const idx = GROUP_DEFS.findIndex((g) => g.test.test(key));
    if (idx >= 0) {
      groups[idx].items.push(p);
    } else {
      let extra = extras.find((e) => e.title === (p.category ?? "Outros"));
      if (!extra) {
        extra = { title: p.category ?? "Outros", items: [] };
        extras.push(extra);
      }
      extra.items.push(p);
    }
  }

  return [...groups.filter((g) => g.items.length > 0), ...extras];
}

export default async function ProdutosPage() {
  const produtos = await getStoreProducts();
  const groups = groupProducts(produtos);

  const midBanners = [
    {
      variant: "pink" as const,
      icon: PROMO_ICONS.scissors,
      title: "Armaria & criatividade",
      text: "Cola, tesoura, papel colorido e muito mais.",
      tag: "Ver tudo",
    },
    {
      variant: "green" as const,
      icon: PROMO_ICONS.backpack,
      title: "Escolar 2027",
      text: "Tudo para o ano letivo com preços de lançamento.",
      tag: "40% OFF",
    },
  ];

  return (
    <main style={{ paddingBottom: 72 }}>
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 24px" }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 8 }}>
          Produtos
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>
          {produtos.length} produtos no catálogo — direto do banco de dados.
        </p>
      </section>

      <BannerSlider />

      {groups.length === 0 && (
        <p style={{ maxWidth: 1240, margin: "0 auto", padding: "34px 32px 0", color: "var(--ink-soft)" }}>
          Nenhum produto encontrado.
        </p>
      )}

      {groups.map((group, i) => (
        <Fragment key={group.title}>
          <div
            style={{
              maxWidth: 1240,
              margin: "0 auto",
              padding: i === 0 ? "34px 32px 0" : "18px 32px 0",
            }}
          >
            <CategoryCarousel title={group.title} products={group.items} />
          </div>
          {i < groups.length - 1 && midBanners[i] && <PromoStrip {...midBanners[i]} />}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
