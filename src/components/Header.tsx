"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/carrinho/CartProvider";
import { BuscaProdutos } from "@/components/busca/BuscaProdutos";
import { IconeGrupo } from "@/components/catalogo/IconeGrupo";
import { CepEntrega } from "@/components/loja/CepEntrega";
import { carregarGrupos, tituloGrupo, type GrupoCatalogo } from "@/lib/gruposSetores";

// Barra do topo (18/11/2026, referencia enviada pelo Joaquim): logo + nome com
// "Papelaria" embaixo | busca no meio | icones + Entrar. Vidro degrade de ponta
// a ponta (CSS .site-header em globals.css). O logo leva para a Home no site;
// no painel (body:has(.admin-shell)) o CSS desliga o clique.
// 2a linha (19/11/2026, mockup aprovado): "Todos os setores" abre os grupos
// ativos; a direita, os grupos com catalog_grupos.na_barra (0058) e
// "Lancamentos". Quem aparece = tela /configuracoes/setores, sem codigo.
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [grupos, setGrupos] = useState<GrupoCatalogo[]>([]);
  const [setoresAberto, setSetoresAberto] = useState(false);
  const setoresRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    carregarGrupos(createClient()).then(setGrupos);
  }, []);

  useEffect(() => {
    if (!setoresAberto) return;
    const fora = (e: MouseEvent) => {
      if (setoresRef.current && !setoresRef.current.contains(e.target as Node)) setSetoresAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSetoresAberto(false);
    };
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [setoresAberto]);
  // "Entrar" deslogado abre a escolha: conta da loja ou corporativa (20/11/2026)
  const [entrarAberto, setEntrarAberto] = useState(false);
  const entrarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!entrarAberto) return;
    const fora = (e: MouseEvent) => {
      if (entrarRef.current && !entrarRef.current.contains(e.target as Node)) setEntrarAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEntrarAberto(false);
    };
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [entrarAberto]);
  const [logado, setLogado] = useState(false);
  // undefined = ainda carregando; null = logado sem profile (cliente da loja)
  const [role, setRole] = useState<string | null | undefined>(undefined);
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
        setRole(undefined);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const cliente = logado && role === null;

  // Cada papel entra pela propria area: revenda compra, fornecedor ao portal.
  const destinoPainel = !logado
    ? "/login"
    : cliente
      ? "/conta"
      : role === "revenda"
        ? "/produtos"
        : role === "fornecedor"
          ? "/portal/fornecedor"
          : "/crm";
  const iconePessoa = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
  const rotuloPainel = !logado ? "Entrar" : cliente ? "Minha conta" : "Painel";

  const naBarra = grupos.filter((g) => g.naBarra);
  const navLinks = [
    ...grupos.map((g) => ({ href: `/produtos#${g.slug}`, label: tituloGrupo(g.nome), bold: false })),
    { href: "/#lancamentos", label: "Lançamentos", bold: true },
    { href: "/produtos#datas-comemorativas", label: "Datas comemorativas", bold: false },
    { href: "/#ofertas", label: "Ofertas", bold: false },
    { href: "/corporativo", label: "Corporativo", bold: false },
    ...(logado ? [{ href: "/conta/pedidos", label: "Meus pedidos", bold: false }] : []),
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a href="/" className="logo-home" aria-label="Nuvem de Papel - página inicial">
          <Image
            src="/logo/nuvem-de-papel.png"
            alt=""
            width={400}
            height={267}
            priority
            className="logo-home-img"
          />
          <span className="marca">
            <span className="marca-nome">Nuvem de Papel</span>
            <span className="marca-sub">Papelaria</span>
          </span>
        </a>

        <BuscaProdutos />

        <CepEntrega />

        <div className="header-acoes">
          <svg className="header-icone" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" />
          </svg>
          <a href="/carrinho" aria-label={`Carrinho com ${totalItens} itens`} className="header-icone header-carrinho">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1.4" />
              <circle cx="18" cy="21" r="1.4" />
              <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
            </svg>
            {totalItens > 0 && <span className="header-carrinho-qtd">{totalItens}</span>}
          </a>
          {logado ? (
            <a href={destinoPainel} className="header-entrar">
              {iconePessoa}
              <span className="header-entrar-txt">{rotuloPainel}</span>
            </a>
          ) : (
            <div className="header-entrar-escolha" ref={entrarRef}>
              <button
                type="button"
                className="header-entrar"
                aria-expanded={entrarAberto}
                aria-controls="header-entrar-menu"
                onClick={() => setEntrarAberto((v) => !v)}
              >
                {iconePessoa}
                <span className="header-entrar-txt">Entrar</span>
              </button>
              {entrarAberto && (
                <nav id="header-entrar-menu" className="header-entrar-menu" aria-label="Tipo de conta">
                  <a href="/login">
                    <b>Minha conta</b>
                    <small>Compras na loja e no Clube</small>
                  </a>
                  <a href="/corporativo">
                    <b>Corporativo</b>
                    <small>Empresas: atacado e faturamento</small>
                  </a>
                </nav>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="menu-toggle"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <nav className="header-links" aria-label="Seções da loja">
        <div ref={setoresRef} className="header-setores">
          <button
            type="button"
            className="header-setores-botao"
            aria-haspopup="true"
            aria-expanded={setoresAberto}
            aria-controls="header-setores-lista"
            onClick={() => setSetoresAberto((v) => !v)}
          >
            <IconeGrupo icone="menu" tamanho={18} />
            <span>Todos os setores</span>
            <span aria-hidden="true" className="header-setores-seta">▾</span>
          </button>
          {setoresAberto && (
            <ul id="header-setores-lista" aria-label="Todos os setores" className="header-setores-lista">
              {grupos.map((g) => (
                <li key={g.slug}>
                  <a href={`/produtos#${g.slug}`} onClick={() => setSetoresAberto(false)}>
                    <IconeGrupo icone={g.icone} tamanho={20} />
                    {tituloGrupo(g.nome)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <a href="/produtos" className="header-atalho">
          Produtos
        </a>
        {naBarra.map((g) => (
          <a key={g.slug} href={`/produtos#${g.slug}`} className="header-atalho">
            <IconeGrupo icone={g.icone} tamanho={18} />
            {tituloGrupo(g.nome)}
          </a>
        ))}
        <span className="header-links-espaco" />
        <a href="/#lancamentos" className="header-atalho header-lancamentos">
          <IconeGrupo icone="estrela" tamanho={18} />
          Lançamentos
        </a>
        <a href="/produtos#datas-comemorativas" className="header-atalho">
          <IconeGrupo icone="estrela" tamanho={18} />
          Datas comemorativas
        </a>
        <a href="/#ofertas" className="header-atalho">
          <IconeGrupo icone="estrela" tamanho={18} />
          Ofertas
        </a>
        <a href="/corporativo" className="header-atalho">
          <IconeGrupo icone="menu" tamanho={18} />
          Corporativo
        </a>
      </nav>

      {menuOpen && (
        <div className="mobile-nav">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{ fontWeight: link.bold ? 700 : 600 }}
            >
              {link.label}
            </a>
          ))}
          <a href={destinoPainel} onClick={() => setMenuOpen(false)} className="mobile-nav-conta">
            {rotuloPainel}
          </a>
        </div>
      )}
    </header>
  );
}
