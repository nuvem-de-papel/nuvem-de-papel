"use client";

// Cabeçalho padrão das telas do painel: título e subtítulo na MESMA linha,
// com o botão "Voltar" na extremidade direita (o usuário não precisa da
// seta do navegador). O <h1> é único por página (conteúdo acessível igual
// ao anterior: o papel continua "titulo - subtitulo").

export function PageHeader({
  titulo,
  subtitulo,
  voltarPara = "/crm",
}: {
  titulo: string;
  subtitulo: React.ReactNode;
  voltarPara?: string;
}) {
  function voltar() {
    if (window.history.length > 1) window.history.back();
    else window.location.href = voltarPara;
  }

  return (
    <div className="page-header">
      <h1 className="display">
        {titulo}
        <span className="page-header-sub"> - {subtitulo}</span>
      </h1>
      <button type="button" className="page-header-back" onClick={voltar}>
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Voltar
      </button>
    </div>
  );
}
