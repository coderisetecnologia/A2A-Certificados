import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { Dashboard } from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Segunda camada: não confia apenas no proxy.ts nem no layout.
  if (!(await getAdminEmail())) redirect("/login");
  return <Dashboard />;
}
