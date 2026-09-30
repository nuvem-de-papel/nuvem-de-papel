import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export default function VendasLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
