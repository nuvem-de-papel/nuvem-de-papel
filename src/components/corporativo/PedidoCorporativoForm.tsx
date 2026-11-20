"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fazerPedidoCorporativo } from "@/app/corporativo/actions";

// Novo pedido corporativo (0060 - etapa 3, 20/11/2026). O preco mostrado e a
// base do atacado (faixa 1) so como estimativa: o valor final, o credito e o
// estoque sao conferidos no servidor (corporate_place_order).

export type ProdutoCorporativo = { id: string; sku: string; nome: string; preco: number; estoque: number | null };
export type EnderecoPadrao = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const novaChave = () => crypto.randomUUID();

export function PedidoCorporativoForm({
  produtos,
  disponivel,
  bloqueado,
  endereco,
}: {
  produtos: ProdutoCorporativo[];
  disponivel: number;
  bloqueado: string | null;
  endereco: EnderecoPadrao;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [entregar, setEntregar] = useState(false);
  const [end, setEnd] = useState<EnderecoPadrao>(endereco);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const chave = useRef(novaChave());

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const achados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (q.length < 2) return [];
    return produtos.filter((p) => semAcento(p.nome).includes(q) || semAcento(p.sku).includes(q)).slice(0, 12);
  }, [busca, produtos]);

  const linhas = Object.entries(carrinho)
    .map(([id, qtd]) => ({ p: porId.get(id), qtd }))
    .filter((l): l is { p: ProdutoCorporativo; qtd: number } => !!l.p && l.qtd > 0);
  const total = linhas.reduce((s, l) => s + Math.round(l.p.preco * l.qtd * 100) / 100, 0);
  const estoura = total > disponivel + 0.001;

  function mudar(id: string, qtd: number) {
    setOk(null);
    setCarrinho((c) => {
      const n = { ...c };
      if (!Number.isFinite(qtd) || qtd <= 0) delete n[id];
      else n[id] = Math.min(99999, Math.floor(qtd));
      return n;
    });
  }

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j?.erro) return;
      setEnd((e) => ({
        ...e,
        logradouro: j.logradouro || e.logradouro,
        bairro: j.bairro || e.bairro,
        cidade: j.localidade || e.cidade,
        uf: j.uf || e.uf,
      }));
    } catch {
      /* sem rede: o comprador digita */
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    startTransition(async () => {
      const r = await fazerPedidoCorporativo({
        itens: linhas.map((l) => ({ itemId: l.p.id, quantidade: l.qtd })),
        entrega: entregar ? end : null,
        observacao,
        chave: chave.current,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      chave.current = novaChave();
      setCarrinho({});
      setObservacao("");
      setOk(
        `Pedido ${r.orderId.slice(0, 8).toUpperCase()} registrado: ${brl(r.total)}` +
          (r.vencimento ? `, vence em ${new Date(`${r.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}.` : ".")
      );
      router.refresh();
    });
  }

  if (bloqueado) return <p className="conta-erro" role="alert">{bloqueado}</p>;

  return (
    <form onSubmit={enviar} aria-label="Novo pedido corporativo" className="corp-pedido">
      <label className="conta-campo">
        Buscar produto
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="nome ou código (mínimo 2 letras)"
          aria-label="Buscar produto do pedido"
        />
      </label>
      {achados.length > 0 && (
        <ul className="corp-achados">
          {achados.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.sku}</b> · {p.nome}
              </span>
              <span>{brl(p.preco)}</span>
              <button
                type="button"
                className="conta-botao-sec"
                aria-label={`Adicionar ${p.sku}`}
                onClick={() => mudar(p.id, (carrinho[p.id] ?? 0) + 1)}
              >
                + adicionar
              </button>
            </li>
          ))}
        </ul>
      )}

      {linhas.length > 0 && (
        <table className="corp-tabela" aria-label="Itens do pedido">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Unit.</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ p, qtd }) => (
              <tr key={p.id}>
                <td>
                  <b>{p.sku}</b> · {p.nome}
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={99999}
                    value={qtd}
                    aria-label={`Quantidade ${p.sku}`}
                    onChange={(e) => mudar(p.id, Number(e.target.value))}
                  />
                </td>
                <td>{brl(p.preco)}</td>
                <td>{brl(p.preco * qtd)}</td>
                <td>
                  <button type="button" className="corp-remover" aria-label={`Remover ${p.sku}`} onClick={() => mudar(p.id, 0)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <fieldset className="corp-entrega">
        <legend>Entrega</legend>
        <label>
          <input type="radio" name="entrega" checked={!entregar} onChange={() => setEntregar(false)} /> Retirar na loja
        </label>
        <label>
          <input type="radio" name="entrega" checked={entregar} onChange={() => setEntregar(true)} /> Entregar
        </label>
        {entregar && (
          <div className="conta-form">
            <label className="conta-campo">
              CEP
              <input
                value={end.cep}
                inputMode="numeric"
                maxLength={9}
                aria-label="CEP de entrega"
                onChange={(e) => setEnd({ ...end, cep: e.target.value })}
                onBlur={(e) => buscarCep(e.target.value)}
              />
            </label>
            <label className="conta-campo">
              Rua
              <input value={end.logradouro} aria-label="Rua de entrega" onChange={(e) => setEnd({ ...end, logradouro: e.target.value })} />
            </label>
            <label className="conta-campo">
              Número
              <input value={end.numero} aria-label="Número de entrega" onChange={(e) => setEnd({ ...end, numero: e.target.value })} />
            </label>
            <label className="conta-campo">
              Complemento
              <input value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} />
            </label>
            <label className="conta-campo">
              Bairro
              <input value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} />
            </label>
            <label className="conta-campo">
              Cidade / UF
              <input value={`${end.cidade}${end.uf ? ` - ${end.uf}` : ""}`} readOnly aria-label="Cidade de entrega" />
            </label>
          </div>
        )}
      </fieldset>

      <label className="conta-campo">
        Observação
        <textarea
          value={observacao}
          maxLength={500}
          rows={2}
          aria-label="Observação do pedido"
          onChange={(e) => setObservacao(e.target.value)}
        />
      </label>

      <div className="corp-resumo" aria-label="Resumo do pedido">
        <span>
          Total estimado: <strong>{brl(total)}</strong>
        </span>
        <span>
          Crédito disponível: <strong>{brl(disponivel)}</strong>
        </span>
      </div>
      {estoura && linhas.length > 0 && (
        <p className="conta-erro">O total passa do crédito disponível. Reduza o pedido ou fale com o atendimento.</p>
      )}
      <div className="conta-form-acoes">
        <button type="submit" className="conta-botao" disabled={pendente || linhas.length === 0}>
          {pendente ? "Registrando..." : "Fazer pedido"}
        </button>
      </div>
      {erro && (
        <p className="conta-erro" role="alert">
          {erro}
        </p>
      )}
      {ok && (
        <p className="conta-ok" role="status">
          {ok}
        </p>
      )}
    </form>
  );
}
