"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/crm",
    label: "Painel CRM",
    icon: (
      <>
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="6" y="11" width="3" height="7" />
        <rect x="11" y="7" width="3" height="11" />
        <rect x="16" y="13" width="3" height="5" />
      </>
    ),
  },
  {
    href: "/configuracoes/cadastro",
    label: "Cadastros",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <line x1="17" y1="7" x2="17" y2="13" />
        <line x1="14" y1="10" x2="20" y2="10" />
      </>
    ),
  },
  {
    href: "/produtos",
    label: "Catálogo",
    icon: (
      <>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
        <path d="M3 8l9 5 9-5" />
        <line x1="12" y1="13" x2="12" y2="21" />
      </>
    ),
  },
  {
    href: "/publicacoes",
    label: "Publicações",
    icon: (
      <>
        <path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z" />
        <line x1="8" y1="8" x2="15" y2="8" />
        <line x1="8" y1="12" x2="15" y2="12" />
        <line x1="8" y1="16" x2="12" y2="16" />
      </>
    ),
  },
];

export function AdminMenu() {
  const pathname = usePathname();

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 8px rgba(7,59,76,0.06)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--navy)",
            whiteSpace: "nowrap",
            padding: "14px 0",
            borderRight: "1px solid var(--border)",
            paddingRight: 20,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pink-600)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Gerenciamento
        </span>

        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <a
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13.5,
                fontWeight: 600,
                color: active ? "var(--pink-600)" : "var(--ink-soft)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                padding: "14px 2px",
                borderBottom: `2.5px solid ${active ? "var(--pink-600)" : "transparent"}`,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {link.icon}
              </svg>
              {link.label}
            </a>
          );
        })}

        <a
          href="/"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--navy)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            padding: "14px 0",
          }}
        >
          Ver loja
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}
