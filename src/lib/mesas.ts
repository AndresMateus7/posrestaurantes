import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";

export async function abrirMesa(restauranteId: string, mesaId: string, meseroId: string) {
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa || mesa.restauranteId !== restauranteId) throw new Error("Mesa no existe");

  const actualizada = await prisma.mesa.update({
    where: { id: mesaId },
    data: { estado: "ocupada", meseroId },
  });

  emitirEvento(restauranteId, "mesa-actualizada", { mesaId, numero: actualizada.numero, estado: actualizada.estado });
  return actualizada;
}
