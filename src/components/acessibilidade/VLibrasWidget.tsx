"use client";

import Script from "next/script";

// VLibras (tradutor oficial de Libras do governo federal) - padrao comum
// 20/11/2026, ver I:\Projetos\_libras\PADRAO-ACESSIBILIDADE-VLIBRAS.md.
// So roda no navegador. O loader atual (v7) cria o proprio botao num shadow
// DOM (#vlibras-access-wrapper) e so baixa o app do avatar no clique; a
// marcacao [vw] abaixo e a do guia oficial e fica por compatibilidade com o
// loader antigo. Desde 21/11/2026 o botao oficial fica escondido (CSS
// #vlibras-access-wrapper) e quem abre o avatar e o botao azul "Libras" da
// barra do topo (Header.tsx), que clica no #vlibras-button do shadow DOM.

declare global {
  interface Window {
    VLibras?: { Widget: new (rootPath: string, personalization?: unknown, avatar?: unknown, position?: string) => unknown };
  }
}

const RAIZ = "https://vlibras.gov.br/app";

export function VLibrasWidget() {
  return (
    <>
      <div {...{ vw: "" }} className="enabled">
        <div {...{ "vw-access-button": "" }} className="active" />
        <div {...{ "vw-plugin-wrapper": "" }}>
          <div className="vw-plugin-top-wrapper" />
        </div>
      </div>
      <Script
        src={`${RAIZ}/vlibras-plugin.js`}
        strategy="afterInteractive"
        onReady={() => {
          // o loader ignora chamadas repetidas (navegacao entre paginas)
          if (window.VLibras) new window.VLibras.Widget(RAIZ, undefined, undefined, "L");
        }}
      />
    </>
  );
}
