"use client";

import { useEffect, useState } from "react";
import { EVENTO_A11Y, semAnimacaoAtivo } from "@/lib/acessibilidade";

// true quando o visitante ligou "Pausar animações" no painel de
// acessibilidade. Animacao feita em JS (timer de carrossel, video do hero)
// consulta este hook; a feita em CSS e parada pelo proprio globals.css.
export function useSemAnimacao(): boolean {
  const [sem, setSem] = useState(false);
  useEffect(() => {
    const ler = () => setSem(semAnimacaoAtivo());
    ler();
    window.addEventListener(EVENTO_A11Y, ler);
    return () => window.removeEventListener(EVENTO_A11Y, ler);
  }, []);
  return sem;
}
