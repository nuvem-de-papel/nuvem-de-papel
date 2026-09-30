import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { podeVerPainel } from "@/lib/painel";

export default async function ProdutosLayout({ children }: { children: ReactNode }) {
  if (!(await podeVerPainel())) return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}
