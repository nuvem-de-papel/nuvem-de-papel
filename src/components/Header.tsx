export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,253,251,0.94)",
        borderBottom: "1px solid var(--lilac-100)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
            <path
              d="M10 27c-4.4 0-8-3.6-8-8 0-4.1 3.1-7.5 7.1-7.9C10.4 7 14.6 4 19.5 4c5.6 0 10.3 3.9 11.4 9.1 4.3.6 7.6 4.3 7.6 8.7 0 4.9-3.9 8.8-8.8 8.8H10z"
              fill="var(--pink-300)"
            />
          </svg>
          <span className="display" style={{ fontSize: 21, color: "var(--ink)" }}>
            Nuvem de Papel
          </span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <a href="/" className="navlink" style={{ fontWeight: 700, fontSize: 15 }}>
            Home
          </a>
          <a href="/produtos" className="navlink" style={{ fontWeight: 600, fontSize: 15 }}>
            Produtos
          </a>
          <a href="/publicacoes" className="navlink" style={{ fontWeight: 600, fontSize: 15 }}>
            Publicações
          </a>
          <a href="/conta" className="navlink" style={{ fontWeight: 600, fontSize: 15 }}>
            Área do Cliente
          </a>
          <a
            href="/crm"
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            CRM
            <span
              style={{
                background: "var(--lilac-100)",
                color: "var(--lilac-600)",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
              admin
            </span>
          </a>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" />
          </svg>
          <div style={{ position: "relative" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="21" r="1.4" />
              <circle cx="18" cy="21" r="1.4" />
              <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
            </svg>
            <span
              style={{
                position: "absolute",
                top: -8,
                right: -9,
                background: "var(--pink-600)",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                width: 16,
                height: 16,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              3
            </span>
          </div>
          <button
            style={{
              background: "var(--pink-600)",
              color: "white",
              padding: "11px 24px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 14,
              boxShadow: "var(--shadow-card)",
            }}
          >
            Entrar / Criar Conta
          </button>
        </div>
      </div>
    </header>
  );
}
