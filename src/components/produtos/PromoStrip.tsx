import type { ReactNode } from "react";

type Variant = "navy" | "pink" | "light" | "green";

const VARIANTS: Record<Variant, { bg: string; fg: string; text: string; tagBg: string; tagFg: string }> = {
  navy: { bg: "linear-gradient(120deg,#006BE1,#006BE1)", fg: "#FFFFFF", text: "rgba(255,255,255,0.9)", tagBg: "#FC99D3", tagFg: "#FFFFFF" },
  pink: { bg: "linear-gradient(120deg,#FC99D3,#FC99D3)", fg: "#3A1526", text: "rgba(58,21,38,0.85)", tagBg: "#006BE1", tagFg: "#FFFFFF" },
  light: { bg: "#FFE9B1", fg: "#006BE1", text: "#100D0D", tagBg: "#FC99D3", tagFg: "#FFFFFF" },
  green: { bg: "linear-gradient(120deg,#2C9C48,#8FC9B8)", fg: "#FFFFFF", text: "rgba(255,255,255,0.92)", tagBg: "#FFFFFF", tagFg: "#2C9C48" },
};

export function PromoStrip({
  variant,
  icon,
  imagem,
  title,
  text,
  tag,
}: {
  variant: Variant;
  icon: ReactNode;
  /** foto (public/banners). Sem foto = usa o icone */
  imagem?: string;
  title: string;
  text: string;
  tag: string;
}) {
  const v = VARIANTS[variant];

  return (
    <div style={{ background: v.bg, color: v.fg, padding: "26px 32px", borderRadius: 18, boxShadow: "0 6px 20px rgba(0, 107, 225,0.10)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {imagem ? (
          <img src={imagem} alt="" width={88} height={88} style={{ width: 88, height: 88, borderRadius: 16, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <svg
            width="72"
            height="72"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, opacity: 0.85 }}
            aria-hidden="true"
          >
            {icon}
          </svg>
        )}
        <div>
          <h3 className="display" style={{ fontSize: 20, margin: "0 0 4px", color: v.fg }}>
            {title}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: v.text }}>{text}</p>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontWeight: 700,
            fontSize: 13,
            padding: "8px 16px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            background: v.tagBg,
            color: v.tagFg,
          }}
        >
          {tag}
        </span>
      </div>
    </div>
  );
}

// Icones de linha (Lucide): caminhao, presente, lapis, tesoura, mochila.
export const PROMO_ICONS = {
  truck: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </>
  ),
  pencil: (
    <>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </>
  ),
  backpack: (
    <>
      <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M8 10h8" />
      <path d="M8 18h8" />
      <path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </>
  ),
};
