"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

// Menu lateral do painel (substitui a barra superior AdminMenu):
//   * grupos ("Vendas" reúne PDV + Vendas Detalhada);
//   * rodapé com a engrenagem "Configurações" (abre Usuários e Auditoria);
//   * Ver loja / Sair sempre à vista.
// Os ícones são os mesmos da barra antiga para não mudar a linguagem visual.

type Link = { href: string; label: string; icon: ReactNode };

const ICONE_PADRAO = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

const GRUPOS: { label?: string; links: Link[] }[] = [
  {
    label: "Vendas",
    links: [
      {
        href: "/pdv",
        label: "PDV",
        icon: (
          <>
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <line x1="7" y1="20" x2="17" y2="20" />
            <line x1="12" y1="16" x2="12" y2="20" />
            <line x1="7" y1="8" x2="13" y2="8" />
          </>
        ),
      },
      {
        href: "/vendas",
        label: "Vendas Detalhada",
        icon: (
          <>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="9" y1="12" x2="15" y2="12" />
          </>
        ),
      },
    ],
  },
  {
    links: [
      {
        href: "/financeiro",
        label: "Financeiro",
        icon: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="7" y1="15" x2="12" y2="15" />
          </>
        ),
      },
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
        href: "/logistica",
        label: "Logística",
        icon: (
          <>
            <path d="M3 7h11v8H3z" />
            <path d="M14 10h4l3 3v2h-7" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
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
        href: "/email",
        label: "E-mail",
        icon: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <polyline points="3,7 12,13 21,7" />
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
    ],
  },
];

const CONFIG: Link[] = [
  {
    href: "/configuracoes/usuarios",
    label: "Usuários",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <line x1="17" y1="11" x2="17" y2="17" />
        <line x1="14" y1="14" x2="20" y2="14" />
      </>
    ),
  },
  {
    href: "/configuracoes/auditoria",
    label: "Auditoria",
    icon: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <line x1="9" y1="9" x2="15" y2="9" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="12" y2="17" />
      </>
    ),
  },
];

function ativo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function Item({ link, pathname }: { link: Link; pathname: string }) {
  const on = ativo(pathname, link.href);
  return (
    <a
      href={link.href}
      className={on ? "admin-link admin-link--on" : "admin-link"}
      aria-current={on ? "page" : undefined}
    >
      <svg {...ICONE_PADRAO}>{link.icon}</svg>
      {link.label}
    </a>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const configFocado = CONFIG.some((c) => ativo(pathname, c.href));
  const [configAberto, setConfigAberto] = useState(configFocado);

  // navegação dentro de /configuracoes mantém este componente montado:
  // reabre a engrenagem quando o destino é Usuários/Auditoria.
  useEffect(() => {
    if (CONFIG.some((c) => ativo(pathname, c.href))) setConfigAberto(true);
  }, [pathname]);

  async function sair() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side-inner">
          <div className="admin-brand">
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path
                d="M10 27c-4.4 0-8-3.6-8-8 0-4.1 3.1-7.5 7.1-7.9C10.4 7 14.6 4 19.5 4c5.6 0 10.3 3.9 11.4 9.1 4.3.6 7.6 4.3 7.6 8.7 0 4.9-3.9 8.8-8.8 8.8H10z"
                fill="var(--pink-600)"
              />
            </svg>
            <span>
              <span className="admin-brand-name">
                Nuvem de Papel
              </span>
              <span className="admin-brand-sub">Painel</span>
            </span>
          </div>

          <nav className="admin-nav" aria-label="Navegação do painel">
            {GRUPOS.map((grupo, gi) => (
              <div key={grupo.label ?? `g${gi}`}>
                {grupo.label && <div className="admin-group-label">{grupo.label}</div>}
                {grupo.links.map((link) => (
                  <Item key={link.href} link={link} pathname={pathname} />
                ))}
                {gi < GRUPOS.length - 1 && <div className="admin-gap" />}
              </div>
            ))}
          </nav>

          <div className="admin-spacer" />

          <button
            type="button"
            className={configAberto ? "admin-gear admin-gear--on" : "admin-gear"}
            aria-expanded={configAberto}
            aria-controls="admin-config-sub"
            onClick={() => setConfigAberto((v) => !v)}
          >
            <svg {...ICONE_PADRAO} width={17} height={17}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            <span className="admin-gear-label">Configurações</span>
            <svg
              className="gear-chevron"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {configAberto && (
            <div className="admin-sub" id="admin-config-sub">
              {CONFIG.map((link) => (
                <Item key={link.href} link={link} pathname={pathname} />
              ))}
            </div>
          )}

          <div className="admin-foot">
            <a href="/">
              <svg {...ICONE_PADRAO} width={14} height={14}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Ver loja
            </a>
            <button type="button" className="admin-sair" onClick={sair}>
              <svg {...ICONE_PADRAO} width={14} height={14}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">{children}</div>
    </div>
  );
}
