// 19/11/2026 (pedido do Joaquim): 3 fotos de papelaria se alternando atras do
// conteudo (home do hero para baixo, /produtos e /login), cor original, com
// crossfade + zoom lento (Ken Burns). So CSS: classes .fundo-rotativo* em
// globals.css. As camadas sao position:fixed recortadas pelo clip-path do
// pai, entao a foto fica parada na tela enquanto a pagina rola.
const FOTOS = ["/fundos/fundo-1.jpg", "/fundos/fundo-2.jpg", "/fundos/fundo-3.jpg"];

export function CamadasFundo() {
  return (
    <div className="fundo-rotativo-camadas" aria-hidden="true">
      {FOTOS.map((src, i) => (
        <span key={src} style={{ backgroundImage: `url("${src}")`, animationDelay: `${i * 8}s` }} />
      ))}
    </div>
  );
}
