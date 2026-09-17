import { requireRol } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CajaPanel } from "@/components/caja/CajaPanel";

export default async function CajaPage() {
  const user = await requireRol("caja", "admin");
  const restaurante = await prisma.restaurante.findUniqueOrThrow({ where: { id: user.restauranteId } });
  return <CajaPanel restauranteNombre={restaurante.nombre} />;
}
