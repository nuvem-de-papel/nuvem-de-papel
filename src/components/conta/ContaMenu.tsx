"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SairButton } from "@/components/conta/SairButton";

// Menu lateral da area do cliente (19/11/2026). Mesma estrutura para conta PF,
// revenda (PJ) e Clube; o item Clube muda o rotulo quando ha assinatura.
export function ContaMenu({ clube }: { clube: boolean }) {
  const atual = usePathname();
  const itens = [
    { href: "/conta/cadastro", rotulo: "Meu cadastro" },
    { href: "/conta/enderecos", rotulo: "Endereços" },
    { href: "/conta/pedidos", rotulo: "Pedidos" },
    { href: "/conta/pedidos-antigos", rotulo: "Pedidos antigos" },
    { href: "/conta/cartoes", rotulo: "Cartões" },
    { href: "/conta/autenticacao", rotulo: "Autenticação" },
    { href: "/conta/favoritos", rotulo: "Favoritos" },
    { href: "/conta/assinatura", rotulo: clube ? "Meu Clube" : "Clube de assinantes" },
  ];
  return (
    <nav className="conta-menu" aria-label="Menu da conta">
      <ul>
        {itens.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={atual === i.href ? "page" : undefined}>
              {i.rotulo}
            </Link>
          </li>
        ))}
      </ul>
      <div className="conta-menu-sair">
        <SairButton />
      </div>
    </nav>
  );
}
