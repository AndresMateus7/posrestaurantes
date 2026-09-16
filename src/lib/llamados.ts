import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import type { TipoLlamado } from "@prisma/client";

export async function crearLlamado(restauranteId: string, mesaId: string, tipo: TipoLlamado) {
  const [llamado] = await prisma.$transaction([
    prisma.llamadoMesa.create({ data: { restauranteId, mesaId, tipo }, include: { mesa: true } }),
    ...(tipo === "solicitar_cuenta"
      ? [prisma.mesa.update({ where: { id: mesaId }, data: { estado: "cuenta_solicitada" } })]
      : []),
  ]);

  emitirEvento(restauranteId, "llamado-creado", {
    id: llamado.id,
    tipo: llamado.tipo,
    mesaNumero: llamado.mesa.numero,
    creadoEn: llamado.creadoEn,
  });

  return llamado;
}
