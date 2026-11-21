// Painel de acessibilidade + VLibras (padrao comum, 20/11/2026 - ver
// I:\Projetos\_libras\PADRAO-ACESSIBILIDADE-VLIBRAS.md). Regras puras aqui
// (testaveis no Node); a tela fica em src/components/acessibilidade/.
//
// As preferencias moram SO no navegador (localStorage, chave CHAVE_A11Y) e
// viram classes no <html>. O CSS do bloco "Acessibilidade" do globals.css
// le essas classes. Nada vai para o servidor.

export const CHAVE_A11Y = "np-a11y";

// Fonte por zoom (nao por font-size do html): o CSS do projeto e quase todo
// em px, entao mudar o font-size raiz nao aumentaria o texto.
export const ZOOM_MIN = 80;
export const ZOOM_MAX = 150;
export const ZOOM_PASSO = 10;

export type PrefsA11y = {
  zoom: number; // % (80..150)
  espacoLinhas: boolean;
  contraste: boolean;
  destacarLinks: boolean;
  guiaLeitura: boolean;
  semAnimacao: boolean;
};

export const PREFS_PADRAO: PrefsA11y = {
  zoom: 100,
  espacoLinhas: false,
  contraste: false,
  destacarLinks: false,
  guiaLeitura: false,
  semAnimacao: false,
};

// classe no <html> para cada chave booleana
export const CLASSES_A11Y = {
  espacoLinhas: "a11y-espaco-linhas",
  contraste: "a11y-contraste",
  destacarLinks: "a11y-links",
  guiaLeitura: "a11y-guia",
  semAnimacao: "a11y-sem-animacao",
} as const;

export type ChaveBool = keyof typeof CLASSES_A11Y;

export function limitarZoom(z: number): number {
  if (!Number.isFinite(z)) return 100;
  const passo = Math.round(z / ZOOM_PASSO) * ZOOM_PASSO;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, passo));
}

// Le o que estiver salvo; qualquer lixo volta ao padrao (nunca lanca).
export function lerPrefs(bruto: string | null | undefined): PrefsA11y {
  if (!bruto) return { ...PREFS_PADRAO };
  try {
    const o = JSON.parse(bruto) as Partial<Record<keyof PrefsA11y, unknown>>;
    if (!o || typeof o !== "object") return { ...PREFS_PADRAO };
    const p: PrefsA11y = { ...PREFS_PADRAO, zoom: limitarZoom(Number(o.zoom ?? 100)) };
    for (const k of Object.keys(CLASSES_A11Y) as ChaveBool[]) p[k] = o[k] === true;
    return p;
  } catch {
    return { ...PREFS_PADRAO };
  }
}

export function ehPadrao(p: PrefsA11y): boolean {
  return (Object.keys(PREFS_PADRAO) as (keyof PrefsA11y)[]).every((k) => p[k] === PREFS_PADRAO[k]);
}

// Aplica no <html>: classes + variavel --a11y-zoom (so quando != 100).
export function aplicarPrefs(p: PrefsA11y, raiz: HTMLElement): void {
  for (const k of Object.keys(CLASSES_A11Y) as ChaveBool[]) raiz.classList.toggle(CLASSES_A11Y[k], p[k]);
  raiz.classList.toggle("a11y-zoom", p.zoom !== 100);
  if (p.zoom !== 100) raiz.style.setProperty("--a11y-zoom", String(p.zoom / 100));
  else raiz.style.removeProperty("--a11y-zoom");
}

// Script inline do <head>: aplica as preferencias ANTES da primeira pintura
// (sem ele a pagina pisca no padrao e depois muda). Mesma regra de
// aplicarPrefs, escrita em JS puro e minimo. O <html> leva
// suppressHydrationWarning porque as classes chegam antes do React.
export const SCRIPT_PREFS_A11Y = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  CHAVE_A11Y
)})||"null");if(!p||typeof p!=="object")return;var h=document.documentElement,c=${JSON.stringify(
  CLASSES_A11Y
)};for(var k in c){if(p[k]===true)h.classList.add(c[k]);}var z=Math.round(Number(p.zoom)/${ZOOM_PASSO})*${ZOOM_PASSO};if(z>=${ZOOM_MIN}&&z<=${ZOOM_MAX}&&z!==100){h.classList.add("a11y-zoom");h.style.setProperty("--a11y-zoom",String(z/100));}}catch(e){}})();`;

// Evento que avisa componentes com animacao em JS (ex.: video do hero) que
// as preferencias mudaram.
export const EVENTO_A11Y = "a11y-mudou";

export function semAnimacaoAtivo(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains(CLASSES_A11Y.semAnimacao);
}
