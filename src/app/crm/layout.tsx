import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
