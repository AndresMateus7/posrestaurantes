import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import type { TipoLlamado } from "@prisma/client";

export const MAX_COMENTARIO_LLAMADO = 300;

export async function crearLlamado(restauranteId: string, mesaId: string, tipo: TipoLlamado, comentario?: string | null) {
  const texto = comentario?.trim().slice(0, MAX_COMENTARIO_LLAMADO) || null;

  const [llamado] = await prisma.$transaction([
    prisma.llamadoMesa.create({ data: { restauranteId, mesaId, tipo, comentario: texto }, include: { mesa: true } }),
    ...(tipo === "solicitar_cuenta"
      ? [prisma.mesa.update({ where: { id: mesaId }, data: { estado: "cuenta_solicitada" } })]
      : []),
  ]);

  // mesaId viaja en el evento para que /api/eventos pueda entregarlo solo a
  // los meseros que atienden esa mesa (ver src/lib/eventos-acceso.ts).
  emitirEvento(restauranteId, "llamado-creado", {
    id: llamado.id,
    tipo: llamado.tipo,
    mesaId: llamado.mesaId,
    mesaNumero: llamado.mesa.numero,
    comentario: llamado.comentario,
    creadoEn: llamado.creadoEn,
  });

  return llamado;
}
