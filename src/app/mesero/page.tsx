import { requireRol } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MeseroPanel } from "@/components/mesero/MeseroPanel";

export default async function MeseroPage() {
  const user = await requireRol("mesero", "admin", "caja");
  const restaurante = await prisma.restaurante.findUniqueOrThrow({ where: { id: user.restauranteId } });
  return <MeseroPanel restauranteNombre={restaurante.nombre} rotaQr={restaurante.rotaQr} usuarioId={user.usuarioId} rol={user.rol} />;
}
