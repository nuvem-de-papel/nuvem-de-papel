"use client";

// Botao de atendimento (pacote WhatsChat adaptado 19/11/2026): balao
// "Posso ajudar?", conversa roteirizada e saida para o WhatsApp. Escondido no
// painel pelo CSS (body:has(.admin-shell)). Sem Tailwind: classes .wchat-*.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MARCA_CHAT,
  OPCOES_CHAT,
  SAUDACAO,
  emAtendimento,
  linkWhatsChat,
  urlDoProduto,
  type OpcaoChat,
} from "@/lib/whats-chat";

type Msg = { id: number; de: "bot" | "eu"; texto: string };
const CHAVE_AVISO = "chat-aviso";

const IconeX = ({ t = 16 }: { t?: number }) => (
  <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
// Fone de atendimento (nao e o logo do WhatsApp: aqui so direciona o assunto).
const IconeBalao = () => (
  <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
    <path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
    <path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
    <path d="M18 17v1a3 3 0 0 1-3 3h-3" />
  </svg>
);
const IconeSeta = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export function WhatsChat() {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const [escolha, setEscolha] = useState<OpcaoChat | null>(null);
  const iniciado = useRef(false);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  const depois = useCallback((fn: () => void, ms: number) => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timers.current.push(window.setTimeout(fn, reduz ? Math.min(ms, 60) : ms));
  }, []);

  const empurrar = useCallback((de: Msg["de"], texto: string) => {
    seq.current += 1;
    setMsgs((m) => [...m, { id: seq.current, de, texto }]);
  }, []);

  const falar = useCallback(
    (textos: readonly string[], aoFim: () => void) => {
      const passo = (i: number) => {
        const t = textos[i];
        if (t === undefined) return aoFim();
        setDigitando(true);
        depois(() => {
          setDigitando(false);
          empurrar("bot", t);
          depois(() => passo(i + 1), 350);
        }, Math.min(1400, 600 + t.length * 12));
      };
      passo(0);
    },
    [depois, empurrar],
  );

  useEffect(() => {
    const tOnline = window.setTimeout(() => setOnline(emAtendimento(new Date())), 0);
    let dispensado = false;
    try {
      dispensado = window.sessionStorage.getItem(CHAVE_AVISO) === "1";
    } catch {
      /* sem storage */
    }
    const t = dispensado ? 0 : window.setTimeout(() => setAviso(true), 7000);
    const lista = timers.current;
    return () => {
      window.clearTimeout(tOnline);
      if (t) window.clearTimeout(t);
      lista.forEach((x) => window.clearTimeout(x));
    };
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs, digitando, opcoes, escolha]);

  function abrir() {
    setAberto(true);
    setAviso(false);
    if (!iniciado.current) {
      iniciado.current = true;
      falar(SAUDACAO, () => setOpcoes(true));
    }
  }

  function fecharAviso() {
    setAviso(false);
    try {
      window.sessionStorage.setItem(CHAVE_AVISO, "1");
    } catch {
      /* ignora */
    }
  }

  function escolher(o: OpcaoChat) {
    setOpcoes(false);
    empurrar("eu", o.rotulo);
    depois(() => falar([o.resposta], () => setEscolha(o)), 400);
  }

  const url = urlDoProduto(typeof window === "undefined" ? "" : window.location.origin, caminho ?? "");

  return (
    <div
      className="wchat"
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) setAberto(false);
      }}
    >
      {aviso && !aberto && (
        <div className="wchat-aviso">
          <button type="button" onClick={abrir} className="wchat-aviso-texto">
            <span>{MARCA_CHAT.nome} · agora</span>
            Posso ajudar você a encontrar o que procura?
          </button>
          <button type="button" onClick={fecharAviso} aria-label="Fechar aviso" className="wchat-aviso-x">
            <IconeX t={14} />
          </button>
        </div>
      )}

      {aberto && (
        <section role="dialog" aria-label={`Atendimento ${MARCA_CHAT.nome}`} className="wchat-janela">
          <header className="wchat-topo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/nuvem-de-papel.png" alt="" className="wchat-logo" />
            <div className="wchat-topo-txt">
              <p>Atendimento {MARCA_CHAT.nome}</p>
              <small>{online === null ? " " : online ? "Equipe online agora" : `Fora do horário · ${MARCA_CHAT.horario}`}</small>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar conversa" className="wchat-fechar">
              <IconeX />
            </button>
          </header>

          <div className="wchat-log" role="log" aria-live="polite">
            {msgs.map((m) => (
              <p key={m.id} className={m.de === "bot" ? "wchat-msg wchat-bot" : "wchat-msg wchat-eu"}>
                {m.texto}
              </p>
            ))}
            {digitando && (
              <p className="wchat-msg wchat-bot wchat-digitando" aria-label="Digitando">
                <i />
                <i />
                <i />
              </p>
            )}
            {opcoes && (
              <div className="wchat-opcoes">
                {OPCOES_CHAT.map((o) => (
                  <button key={o.id} type="button" onClick={() => escolher(o)}>
                    {o.rotulo}
                  </button>
                ))}
              </div>
            )}
            {escolha && (
              <div className="wchat-saida">
                <a href={linkWhatsChat(escolha.assunto, url)} target="_blank" rel="noopener noreferrer" className="wchat-continuar">
                  Continuar no WhatsApp
                  <span>
                    <IconeSeta />
                  </span>
                </a>
                {escolha.interno && (
                  <Link href={escolha.interno.href} onClick={() => setAberto(false)} className="wchat-interno">
                    {escolha.interno.rotulo}
                  </Link>
                )}
              </div>
            )}
            <div ref={fim} />
          </div>

          <p className="wchat-rodape">Atendimento automático. A conversa continua no WhatsApp com a nossa equipe. Não pedimos dados aqui.</p>
        </section>
      )}

      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-expanded={aberto}
        aria-label={aberto ? "Fechar atendimento" : "Abrir atendimento"}
        className="wchat-botao"
      >
        {aberto ? <IconeX t={24} /> : <IconeBalao />}
        {aviso && !aberto && <span className="wchat-badge">1</span>}
      </button>
    </div>
  );
}
