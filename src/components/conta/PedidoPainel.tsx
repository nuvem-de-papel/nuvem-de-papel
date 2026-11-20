"use client";

// Painel lateral do pedido (20/11/2026): linha do tempo, imprimir, pagar agora,
// comprar de novo e pedir nota. Nenhum botao muda status — so acaoPedido(),
// que audita e devolve link/ok.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acaoPedido, type AcaoPedido } from "@/app/conta/actions";
import { useCart } from "@/components/carrinho/CartProvider";

export type ItemPainel = { item_id: string | null; sku: string; name: string; unit_price: number; quantity: number };

const ETAPAS = [
  { k: "criado", r: "Pedido criado" },
  { k: "pago", r: "Pagamento aprovado" },
  { k: "processando", r: "Em separação" },
  { k: "em_rota", r: "Enviado" },
  { k: "entregue", r: "Entregue" },
];
const NIVEL: Record<string, number> = { aguardando_pagamento: 0, pago: 1, processando: 2, em_rota: 3, entregue: 4 };

export function PedidoPainel({
  id, codigo, status, criadoEm, itens, temLink, nfSolicitada,
}: {
  id: string; codigo: string; status: string; criadoEm: string; itens: ItemPainel[]; temLink: boolean; nfSolicitada: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState("");
  const [nf, setNf] = useState(nfSolicitada);
  const [pend, start] = useTransition();
  const { addItem } = useCart();
  const router = useRouter();
  const nivel = NIVEL[status] ?? -1;
  const pago = nivel >= 1;

  function rodar(a: AcaoPedido) {
    setMsg("");
    start(async () => {
      const r = await acaoPedido(id, a);
      if (!r.ok) return setMsg(r.erro ?? "Erro");
      if (a === "pagar" && r.url) window.location.href = r.url;
      if (a === "imprimir") window.print();
      if (a === "nota") { setNf(true); setMsg("Pedido de nota enviado à loja."); }
      if (a === "refazer") {
        for (const it of itens) if (it.item_id) addItem({ id: it.item_id, sku: it.sku, name: it.name, price: it.unit_price }, it.quantity);
        router.push("/checkout");
      }
    });
  }

  return (
    <>
      <button type="button" className="pedido-abrir-painel" aria-label={`Acompanhar pedido ${codigo}`} onClick={() => setAberto(true)}>
        Acompanhar
      </button>
      {aberto && (
        <div className="pedido-painel-fundo" onClick={() => setAberto(false)}>
          <aside role="dialog" aria-label={`Pedido ${codigo}`} className="pedido-painel doc-print" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Pedido {codigo}</h2>
              <button type="button" aria-label="Fechar painel" data-no-print onClick={() => setAberto(false)}>×</button>
            </header>
            {status === "cancelado" ? (
              <p className="pedido-cancelado">Pedido cancelado.</p>
            ) : (
              <ol className="pedido-tempo" aria-label="Linha do tempo">
                {ETAPAS.map((e, i) => (
                  <li key={e.k} className={i <= nivel || i === 0 ? "feito" : ""}>
                    {e.r}
                    {i === 0 && <small>{new Date(criadoEm).toLocaleString("pt-BR")}</small>}
                  </li>
                ))}
              </ol>
            )}
            <div className="pedido-painel-acoes" data-no-print>
              {status === "aguardando_pagamento" && temLink && (
                <button type="button" className="conta-botao" disabled={pend} onClick={() => rodar("pagar")}>Pagar agora</button>
              )}
              {status === "cancelado" && (
                <button type="button" className="conta-botao" disabled={pend} onClick={() => rodar("refazer")}>Comprar de novo</button>
              )}
              {pago && (
                <button type="button" className="conta-botao-sec" disabled={pend || nf} onClick={() => rodar("nota")}>
                  {nf ? "Nota fiscal solicitada" : "Pedir nota fiscal"}
                </button>
              )}
              <button type="button" className="conta-botao-sec" disabled={pend} onClick={() => rodar("imprimir")}>Imprimir</button>
            </div>
            <table className="pedido-itens" style={{ width: "100%", margin: "14px 0 0" }}>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i}>
                    <td>{it.quantity}× {it.name}</td>
                    <td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(it.unit_price * it.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {msg && <p role="status" className="conta-ok">{msg}</p>}
          </aside>
        </div>
      )}
    </>
  );
}
