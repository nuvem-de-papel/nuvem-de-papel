"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";

// Galeria da pagina do produto (19/11/2026): clicar na miniatura troca a foto
// do quadro grande. A capa (foto do item escolhido) entra como 1a opcao.
export function GaleriaProduto({
  category,
  name,
  fotoUrl,
  galeria,
}: {
  category: string | null;
  name: string;
  fotoUrl: string | null;
  galeria: string[];
}) {
  const fotos = Array.from(new Set([fotoUrl, ...galeria].filter((f): f is string => !!f))).slice(0, 5);
  const [ativa, setAtiva] = useState(fotos[0] ?? null);

  return (
    <div>
      <ProductImage
        key={ativa ?? "sem-foto"}
        category={category}
        name={name}
        fotoUrl={ativa}
        style={{ aspectRatio: "1 / 1", height: "auto", border: "1px solid var(--cta)" }}
      />
      {fotos.length > 1 && (
        <div className="galeria-miniaturas" style={{ display: "grid", gridTemplateColumns: `repeat(${fotos.length}, 1fr)`, gap: 10, marginTop: 12 }}>
          {fotos.map((f, i) => (
            <button
              key={f}
              type="button"
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={f === ativa}
              onClick={() => setAtiva(f)}
              onMouseEnter={() => setAtiva(f)}
              style={{
                padding: 0,
                cursor: "pointer",
                borderRadius: 10,
                background: "#fff",
                border: f === ativa ? "2px solid var(--cta)" : "1px solid var(--ink-faint)",
                overflow: "hidden",
              }}
            >
              <img src={f} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
