import { requireRol } from "@/lib/session";
import { CocinaPanel } from "@/components/cocina/CocinaPanel";

export default async function CocinaPage() {
  await requireRol("cocina", "admin", "caja");
  return <CocinaPanel />;
}
