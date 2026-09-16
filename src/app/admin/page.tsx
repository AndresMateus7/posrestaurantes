import { requireRol } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default async function AdminPage() {
  const user = await requireRol("admin");
  const restaurante = await prisma.restaurante.findUniqueOrThrow({ where: { id: user.restauranteId } });
  return <AdminPanel restauranteNombre={restaurante.nombre} />;
}
