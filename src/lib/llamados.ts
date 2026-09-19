import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import type { TipoLlamado } from "@prisma/client";

export const MAX_COMENTARIO_LLAMADO = 300;

export async function crearLlamado(restauranteId: string, mesaId: string, tipo: TipoLlamado, comentario?: string | null) {
  const texto = comentario?.trim().slice(0, MAX_COMENTARIO_LLAMADO) || null;

  const [llamado] = await prisma.$transaction([
    prisma.llamadoMesa.create({
      data: { restauranteId, mesaId, tipo, comentario: texto },
      include: { mesa: { include: { mesero: { select: { nombre: true } } } } },
    }),
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
    meseroNombre: llamado.mesa.mesero?.nombre ?? null,
    comentario: llamado.comentario,
    creadoEn: llamado.creadoEn,
  });
  // La mesa pasa a "cuenta solicitada": el mapa del mesero y Caja deben enterarse.
  if (tipo === "solicitar_cuenta") {
    emitirEvento(restauranteId, "mesa-actualizada", { mesaId, numero: llamado.mesa.numero, estado: "cuenta_solicitada" });
  }

  return llamado;
}

/** Marca como atendidos los llamados pendientes de una mesa (al liberarla o cerrar su cuenta). */
export async function resolverLlamadosDeMesa(restauranteId: string, mesaId: string, usuarioId?: string) {
  const pendientes = await prisma.llamadoMesa.findMany({ where: { restauranteId, mesaId, atendido: false }, select: { id: true } });
  if (pendientes.length === 0) return;

  await prisma.llamadoMesa.updateMany({
    where: { id: { in: pendientes.map((l) => l.id) } },
    data: { atendido: true, atendidoEn: new Date(), atendidoPor: usuarioId ?? null },
  });
  for (const { id } of pendientes) emitirEvento(restauranteId, "llamado-atendido", { id });
}
