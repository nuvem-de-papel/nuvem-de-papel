import type { ReactNode } from "react";
import { AdminMenu } from "@/components/AdminMenu";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminMenu />
      {children}
    </>
  );
}
