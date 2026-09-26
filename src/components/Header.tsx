"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logado, setLogado] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogado(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const navLinks = [
    { href: "/", label: "Home", bold: true },
    { href: "/produtos", label: "Produtos", bold: false },
    { href: "/publicacoes", label: "Publicações", bold: false },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#3D3D3D",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path
              d="M10 27c-4.4 0-8-3.6-8-8 0-4.1 3.1-7.5 7.1-7.9C10.4 7 14.6 4 19.5 4c5.6 0 10.3 3.9 11.4 9.1 4.3.6 7.6 4.3 7.6 8.7 0 4.9-3.9 8.8-8.8 8.8H10z"
              fill="#FFD166"
            />
          </svg>
          <span className="display" style={{ fontSize: 20, color: "#FFFFFF" }}>
            Nuvem de Papel
          </span>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: "none",
            background: "none",
            padding: 8,
            marginLeft: "auto",
          }}
          className="menu-toggle"
          aria-label="Abrir menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
          className="nav-menu"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                fontWeight: link.bold ? 700 : 600,
                fontSize: 14,
                color: "#FFFFFF",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FFD166")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" />
          </svg>
          <div style={{ position: "relative" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1.4" />
              <circle cx="18" cy="21" r="1.4" />
              <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
            </svg>
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -8,
                background: "#E084AC",
                color: "#FFFFFF",
                fontSize: 9,
                fontWeight: 700,
                width: 14,
                height: 14,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              3
            </span>
          </div>
          <a
            href={logado ? "/crm" : "/login"}
            style={{
              background: "#E084AC",
              color: "#FFFFFF",
              padding: "10px 18px",
              borderRadius: "var(--radius-control)",
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "0 2px 8px rgba(224,132,172,0.35)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
            className="cta-button"
          >
            {logado ? "Painel" : "Entrar / Criar Conta"}
          </a>
        </div>
      </div>

      {menuOpen && (
        <div
          className="mobile-nav"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "12px 24px 20px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            background: "#073B4C",
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontWeight: link.bold ? 700 : 600,
                fontSize: 16,
                color: "#FFFFFF",
                padding: "8px 0",
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href={logado ? "/crm" : "/login"}
            onClick={() => setMenuOpen(false)}
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#E084AC",
              padding: "8px 0",
              textDecoration: "none",
            }}
          >
            {logado ? "Painel" : "Entrar / Criar Conta"}
          </a>
        </div>
      )}
    </header>
  );
}
