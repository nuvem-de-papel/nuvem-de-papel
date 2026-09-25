import type { ReactNode } from "react";

type Variant = "navy" | "pink" | "light" | "green";

const VARIANTS: Record<Variant, { bg: string; fg: string; text: string; tagBg: string; tagFg: string }> = {
  navy: { bg: "linear-gradient(120deg,#073B4C,#0D5268)", fg: "#FFFFFF", text: "rgba(255,255,255,0.9)", tagBg: "#E084AC", tagFg: "#FFFFFF" },
  pink: { bg: "linear-gradient(120deg,#E084AC,#F2B8CE)", fg: "#3A1526", text: "rgba(58,21,38,0.85)", tagBg: "#073B4C", tagFg: "#FFFFFF" },
  light: { bg: "#FBE4ED", fg: "#073B4C", text: "#5A6577", tagBg: "#E084AC", tagFg: "#FFFFFF" },
  green: { bg: "linear-gradient(120deg,#2C9C48,#8FC9B8)", fg: "#FFFFFF", text: "rgba(255,255,255,0.92)", tagBg: "#FFFFFF", tagFg: "#2C9C48" },
};

export function PromoStrip({
  variant,
  icon,
  title,
  text,
  tag,
}: {
  variant: Variant;
  icon: ReactNode;
  title: string;
  text: string;
  tag: string;
}) {
  const v = VARIANTS[variant];

  return (
    <div style={{ background: v.bg, color: v.fg, padding: "26px 0", boxShadow: "0 6px 20px rgba(7,59,76,0.10)" }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: 0.85 }}
          aria-hidden="true"
        >
          {icon}
        </svg>
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

export const PROMO_ICONS = {
  truck: (
    <>
      <path d="M1.5 5h11v10H1.5z" />
      <path d="M12.5 8.5H17l3.5 3.5V15h-8z" />
      <circle cx="6" cy="17.5" r="2" />
      <circle cx="16.5" cy="17.5" r="2" />
    </>
  ),
  gift: (
    <>
      <path d="M20 12v9H4v-9" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="21" x2="12" y2="7" />
      <path d="M12 7a2.5 2.5 0 1 1 2.5-2.5A2.5 2.5 0 0 1 12 7Z" />
      <path d="M12 7a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 12 7Z" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l4-1L20 7a2.12 2.12 0 0 0-3-3L5 16l-1 4z" />
      <line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
      <line x1="4" y1="20" x2="8" y2="19" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </>
  ),
  backpack: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      <line x1="9.5" y1="15" x2="14.5" y2="15" />
    </>
  ),
};
