import type { ReactNode } from "react";
import { AdminMenu } from "@/components/AdminMenu";

export default function EmailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminMenu />
      {children}
    </>
  );
}
