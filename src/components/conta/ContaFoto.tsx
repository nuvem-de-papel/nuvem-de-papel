"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trocarFotoCliente } from "@/app/conta/foto-actions";

export function ContaFoto({ fotoUrl, nome }: { fotoUrl: string | null; nome: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState("");
  const [pend, start] = useTransition();
  const router = useRouter();

  function enviar(f: File | undefined) {
    if (!f) return;
    setErro("");
    const fd = new FormData();
    fd.append("foto", f);
    start(async () => {
      const r = await trocarFotoCliente(fd);
      if (!r.ok) setErro(r.erro ?? "Erro");
      else router.refresh();
    });
  }

  return (
    <div className="conta-foto">
      <button type="button" className="conta-foto-btn" onClick={() => input.current?.click()} aria-label="Trocar foto" disabled={pend}>
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt={`Foto de ${nome}`} />
        ) : (
          <span>{(nome[0] ?? "?").toUpperCase()}</span>
        )}
        <small>{pend ? "enviando..." : fotoUrl ? "trocar foto" : "inserir foto"}</small>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => enviar(e.target.files?.[0])} />
      {erro && <p className="conta-foto-erro">{erro}</p>}
    </div>
  );
}
