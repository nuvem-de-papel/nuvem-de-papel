import type { Metadata } from "next";
import Link from "next/link";

// Guia de navegacao (21/11/2026) escrito para o VLibras ler bem: perguntas em
// <h2>, respostas em <p> de texto puro, frases curtas em ordem direta, sem
// girias nem metaforas, sem texto partido em varios <span>. Para mudar o
// texto, mantenha essas regras (I:\Projetos\_libras\PADRAO-ACESSIBILIDADE-VLIBRAS.md).

export const metadata: Metadata = {
  title: "Como navegar no site — Nuvem de Papel",
  description: "Guia simples para usar a loja Nuvem de Papel: busca, setores, carrinho, pagamento, conta, Libras e acessibilidade.",
};

type Topico = { id: string; pergunta: string; respostas: string[]; link?: { href: string; texto: string } };

const TOPICOS: Topico[] = [
  {
    id: "libras",
    pergunta: "Como usar a Libras neste site?",
    respostas: [
      "No topo da página, do lado direito, existe um botão azul com uma mão.",
      "Clique nesse botão. O tradutor VLibras abre na tela.",
      "Depois, clique em um texto da página. O avatar traduz o texto para Libras.",
    ],
  },
  {
    id: "acessibilidade",
    pergunta: "Como aumentar a letra ou mudar as cores?",
    respostas: [
      "No topo da página, ao lado do botão de Libras, existe o botão Acessibilidade.",
      "Clique nele. Um painel abre com as opções.",
      "Você pode aumentar a letra, aumentar o espaço entre as linhas e ligar o alto contraste.",
      "Você também pode destacar os links, ligar a guia de leitura e parar as animações.",
      "O site guarda a sua escolha neste navegador.",
    ],
  },
  {
    id: "buscar",
    pergunta: "Como procurar um produto?",
    respostas: [
      "No meio da barra do topo existe o campo Buscar na loja.",
      "Escreva o nome, o código ou uma palavra da descrição do produto. Escreva pelo menos duas letras.",
      "Uma lista de produtos aparece embaixo do campo.",
      "Cada produto da lista mostra a foto, o nome e o preço.",
      "Clique no produto que você quer.",
    ],
  },
  {
    id: "setores",
    pergunta: "Como ver os produtos por setor?",
    respostas: [
      "Na segunda linha da barra do topo existe o botão Todos os setores.",
      "Clique nele. A lista de setores abre.",
      "Clique em um setor para ver os produtos dele.",
      "Na mesma linha também existem os atalhos Lançamentos, Datas comemorativas, Ofertas e Corporativo.",
    ],
    link: { href: "/produtos", texto: "Ver todos os produtos" },
  },
  {
    id: "produto",
    pergunta: "O que existe na página do produto?",
    respostas: [
      "A página do produto mostra a foto, o preço e a descrição.",
      "Clique em uma foto pequena para ver a foto grande.",
      "Use os botões de menos e de mais para escolher a quantidade.",
      "O botão Comprar coloca o produto no carrinho e abre o pagamento.",
      "O botão Adicionar ao carrinho guarda o produto e deixa você continuar comprando.",
    ],
  },
  {
    id: "carrinho",
    pergunta: "Como ver o meu carrinho?",
    respostas: [
      "No topo da página, do lado direito, existe o ícone do carrinho.",
      "O número no ícone mostra quantos itens estão no carrinho.",
      "Clique no ícone para ver os itens, mudar a quantidade ou remover um item.",
    ],
    link: { href: "/carrinho", texto: "Abrir o carrinho" },
  },
  {
    id: "pagar",
    pergunta: "Como finalizar a compra?",
    respostas: [
      "No carrinho, clique em Finalizar compra.",
      "A página de pagamento tem duas partes.",
      "Na parte 1, informe os seus dados e escolha entregar em casa ou retirar na loja.",
      "Na parte 2, escolha a forma de pagamento e confirme o pedido.",
      "O pagamento acontece no Mercado Pago. A loja não guarda o número do seu cartão.",
      "Se você não tem conta, a conta é criada nesse momento.",
    ],
  },
  {
    id: "conta",
    pergunta: "Como ver os meus pedidos?",
    respostas: [
      "No topo da página, clique em Entrar e depois em Minha conta.",
      "Entre com o seu e-mail e a sua senha, ou com a sua conta Google.",
      "No menu da sua conta, clique em Pedidos.",
      "Clique em Acompanhar para ver a situação do pedido.",
      "Na sua conta você também muda o seu cadastro e os seus endereços.",
      "Em Meu cadastro você também cria ou muda a sua senha.",
    ],
    link: { href: "/conta", texto: "Abrir a minha conta" },
  },
  {
    id: "corporativo",
    pergunta: "Como comprar para a minha empresa?",
    respostas: [
      "No topo da página, clique em Corporativo.",
      "Se a sua empresa ainda não tem conta, clique em Cadastrar e informe o CNPJ.",
      "Com a conta pronta, você faz pedidos com prazo para pagar.",
    ],
    link: { href: "/corporativo", texto: "Abrir a área corporativa" },
  },
  {
    id: "clube",
    pergunta: "O que é o Clube Nuvem de Papel?",
    respostas: [
      "O Clube é uma assinatura mensal.",
      "Quem assina o Clube recebe desconto em todas as compras.",
    ],
    link: { href: "/clube", texto: "Conhecer o Clube" },
  },
  {
    id: "atendimento",
    pergunta: "Como falar com a loja?",
    respostas: [
      "No canto de baixo da página, do lado direito, existe o botão de atendimento.",
      "Clique nele e escolha o assunto.",
      "Depois, clique em Continuar no WhatsApp para falar com uma pessoa da loja.",
      "O atendimento funciona de segunda a sábado, das 8 horas às 18 horas e 30 minutos.",
    ],
  },
];

export default function ComoNavegarPage() {
  return (
    <main className="guia-navegar">
      <h1>Como navegar no site</h1>
      <p>Este guia explica como usar a loja Nuvem de Papel.</p>
      <p>Clique em uma pergunta para ir direto para a resposta.</p>

      <nav aria-label="Perguntas do guia" className="guia-indice">
        <ul>
          {TOPICOS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}>{t.pergunta}</a>
            </li>
          ))}
        </ul>
      </nav>

      {TOPICOS.map((t) => (
        <section key={t.id} id={t.id} aria-labelledby={`${t.id}-titulo`} className="guia-topico">
          <h2 id={`${t.id}-titulo`}>{t.pergunta}</h2>
          {t.respostas.map((r) => (
            <p key={r}>{r}</p>
          ))}
          {t.link && (
            <p>
              <Link href={t.link.href}>{t.link.texto}</Link>
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
