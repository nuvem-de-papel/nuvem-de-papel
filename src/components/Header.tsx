"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/carrinho/CartProvider";
import { BuscaProdutos } from "@/components/busca/BuscaProdutos";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logado, setLogado] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const { totalItens } = useCart();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogado(!!session?.user);
      if (session?.user) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle()
          .then(({ data }) => setRole(data?.role ?? null));
      } else {
        setRole(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cada papel entra pela propria area: revenda compra, fornecedor ao portal.
  const destinoPainel = logado
    ? role === "revenda"
      ? "/produtos"
      : role === "fornecedor"
        ? "/portal/fornecedor"
        : "/crm"
    : "/login";

  const navLinks = [
    { href: "/", label: "Home", bold: true },
    { href: "/produtos", label: "Produtos", bold: false },
    { href: "/publicacoes", label: "Publicações", bold: false },
    ...(logado ? [{ href: "/conta/pedidos", label: "Meus pedidos", bold: false }] : []),
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "linear-gradient(90deg, #F4C7D8 0%, #D9C8F2 100%)",
        borderBottom: "1px solid rgba(61,61,61,0.12)",
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
          <Image
            src="/logo/nuvem-de-papel.png"
            alt="Nuvem de Papel"
            width={400}
            height={267}
            priority
            style={{ height: 52, width: "auto" }}
          />
          <span className="display" style={{ fontSize: 20, color: "#3D3D3D" }}>
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3D3D3D" strokeWidth="2">
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
                fontSize: 16,
                color: "#3D3D3D",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#E084AC")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#3D3D3D")}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setBuscaAberta((v) => !v)}
            aria-label="Buscar produto"
            aria-expanded={buscaAberta}
            style={{ display: "flex", padding: 4, background: "none", border: "none", cursor: "pointer" }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" />
          </svg>
          <a href="/carrinho" aria-label={`Carrinho com ${totalItens} itens`} style={{ position: "relative", display: "flex", padding: 4 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1.4" />
              <circle cx="18" cy="21" r="1.4" />
              <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
            </svg>
            {totalItens > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -8,
                  background: "#FFF9FC",
                  color: "#3D3D3D",
                  fontSize: 9,
                  fontWeight: 700,
                  minWidth: 14,
                  height: 14,
                  padding: "0 3px",
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {totalItens}
              </span>
            )}
          </a>
          <span aria-hidden="true" style={{ display: "flex", padding: 4, width: 27, height: 27 }} />
          <a
            href={destinoPainel}
            style={{
              background: "var(--cta)",
              border: "none",
              color: "#000000",
              width: 184,
              height: 40,
              boxSizing: "border-box",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: "var(--radius-control)",
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "none",
              textDecoration: "none",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
            className="cta-button"
          >
            {logado ? "Painel" : "Entrar / Criar Conta"}
          </a>
        </div>
      </div>

      {buscaAberta && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            background: "#FFFFFF",
            borderTop: "1px solid rgba(61,61,61,0.12)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
            padding: "16px 24px 20px",
            zIndex: 60,
          }}
        >
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            <BuscaProdutos aoEscolher={() => setBuscaAberta(false)} />
          </div>
        </div>
      )}

      {menuOpen && (
        <div
          className="mobile-nav"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "12px 24px 20px",
            borderTop: "1px solid rgba(61,61,61,0.12)",
            background: "linear-gradient(90deg, #F4C7D8 0%, #D9C8F2 100%)",
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
                color: "#3D3D3D",
                padding: "8px 0",
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href={destinoPainel}
            onClick={() => setMenuOpen(false)}
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#B5507F",
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
