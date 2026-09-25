"use client";

const WHATSAPP_URL = "https://wa.me/5519993631145";
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Travessa+Colonial+56+Jardim+Algodoal+Piracicaba+SP+13405-404";

const socialLinks = [
  { href: "https://www.instagram.com/", label: "Instagram", icon: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1.1-1.5.2-1.9.3-.5.2-.8.4-1.1.7-.3.3-.5.6-.7 1.1-.1.4-.3.8-.3 1.9-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c.1 1.1.2 1.5.3 1.9.2.5.4.8.7 1.1.3.3.6.5 1.1.7.4.1.8.3 1.9.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1.1-.1 1.5-.2 1.9-.3.5-.2.8-.4 1.1-.7.3-.3.5-.6.7-1.1.1-.4.3-.8.3-1.9.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c-.1-1.1-.2-1.5-.3-1.9-.2-.5-.4-.8-.7-1.1-.3-.3-.6-.5-1.1-.7-.4-.1-.8-.3-1.9-.3-1.3-.1-1.7-.1-4.8-.1zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 1.8a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2zm5.1-2.1a1.1 1.1 0 1 1 0 2.3 1.1 1.1 0 0 1 0-2.3z" },
  { href: "https://www.facebook.com/", label: "Facebook", icon: "M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.8h2.5V21h3z" },
  { href: "https://www.youtube.com/", label: "YouTube", icon: "M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8 1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15.2V8.8l5.2 3.2-5.2 3.2z" },
];

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

function SocialButton({ href, label, icon, size = 18 }: { href: string; label: string; icon: string; size?: number }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      style={{
        width: size + 18,
        height: size + 18,
        borderRadius: 999,
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.2s, transform 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#E084AC";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.1)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <svg {...iconProps} width={size} height={size}>
        <path d={icon} />
      </svg>
    </a>
  );
}

export function FloatingSocial() {
  return (
    <div
      className="floating-social"
      style={{
        position: "fixed",
        left: 16,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {socialLinks.map((s) => (
        <SocialButton key={s.label} {...s} />
      ))}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        title="WhatsApp: +55 19 99363-1145"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "#25D366",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(37,211,102,0.4)",
          transition: "transform 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-3px)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.8-2.8-1.5-3.9-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
        </svg>
      </a>
    </div>
  );
}

export function Footer() {
  return (
    <footer
      style={{
        background: "linear-gradient(180deg, #073B4C 0%, #062E3A 100%)",
        color: "rgba(255,255,255,0.75)",
        marginTop: 80,
        padding: "56px 32px 28px",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 32,
          fontSize: 13,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
              <path
                d="M10 27c-4.4 0-8-3.6-8-8 0-4.1 3.1-7.5 7.1-7.9C10.4 7 14.6 4 19.5 4c5.6 0 10.3 3.9 11.4 9.1 4.3.6 7.6 4.3 7.6 8.7 0 4.9-3.9 8.8-8.8 8.8H10z"
                fill="#FFD166"
              />
            </svg>
            <span className="display" style={{ fontSize: 16, color: "#FFFFFF" }}>
              Nuvem de Papel
            </span>
          </div>
          <p style={{ margin: 0, fontStyle: "italic", color: "#FFD166", fontSize: 12 }}>
            Organização e Criatividade que transforma a rotina
          </p>
          <p style={{ maxWidth: 240, lineHeight: 1.5, margin: "10px 0 0" }}>
            Papelaria criativa e organizada — direto para sua casa ou empresa.
          </p>
        </div>

        <div>
          <h4 style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            Institucional
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            <li>Sobre nós</li>
            <li>Trabalhe conosco</li>
            <li>Blog</li>
            <li>Central de ajuda</li>
            <li>Trocas e devoluções</li>
            <li>Rastrear pedido</li>
          </ul>
        </div>

        <div style={{ maxWidth: 340 }}>
          <h4 style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            Endereço Comercial
          </h4>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Travessa Colonial, 56 – Jardim Algodoal
            <br />
            Piracicaba - SP – Brasil – CEP 13405-404
          </p>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
              padding: "7px 14px",
              borderRadius: "var(--radius-control)",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
            </svg>
            Ver no Google Maps
          </a>

          <h4 style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, margin: "22px 0 14px" }}>
            Depósito e Expedição
          </h4>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Travessa Adelino Berto, 26 – Vila Rezende
            <br />
            Piracicaba - SP – Brasil – CEP 13405-363
          </p>
        </div>

        <div>
          <h4 style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            Contato
          </h4>
          <p style={{ margin: 0 }}>contato@nuvemdepapel.com.br</p>
          <p style={{ margin: "6px 0 0" }}>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#FFFFFF", textDecoration: "none", fontWeight: 700 }}
            >
              +55 19 99363-1145
            </a>
          </p>

          <h4 style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, margin: "22px 0 12px" }}>
            Redes sociais
          </h4>
          <div style={{ display: "flex", gap: 10 }}>
            {socialLinks.map((s) => (
              <SocialButton key={s.label} {...s} />
            ))}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              title="WhatsApp: +55 19 99363-1145"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: "#25D366",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(37,211,102,0.4)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.8-2.8-1.5-3.9-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1240,
          margin: "40px auto 0",
          paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.12)",
          fontSize: 11,
          color: "rgba(255,255,255,0.55)",
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        © 2026 Nuvem de Papel — CR Comércio e Exportação LTDA
        <br />
        CNPJ: 49.163.008/0001-68 — Nome fantasia: Nuvem de Papel
      </div>
    </footer>
  );
}
