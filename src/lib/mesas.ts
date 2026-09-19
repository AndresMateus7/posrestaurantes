import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { ApiAuthError } from "@/lib/api-auth";
import type { Solicitante } from "@/lib/acceso-mesas";

/**
 * Abre una mesa libre/reservada, o la "toma" si ya esta ocupada pero nadie la
 * atiende. Un mesero queda como responsable de la mesa (Mesa.meseroId) hasta
 * que se cierre la cuenta, y ningun otro mesero puede verla ni operarla;
 * caja/admin la abren sin asignar mesero (cualquier mesero puede tomarla
 * despues). Las condiciones van en el UPDATE para que dos meseros que tocan
 * "abrir" a la vez no se pisen entre si.
 */
export async function abrirMesa(restauranteId: string, mesaId: string, usuario: Solicitante) {
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa || mesa.restauranteId !== restauranteId) throw new ApiAuthError(404, "Mesa no existe");

  const esMesero = usuario.rol === "mesero";
  let cambio = false;

  const abierta = await prisma.mesa.updateMany({
    where: { id: mesaId, estado: { in: ["libre", "reservada"] } },
    data: { estado: "ocupada", meseroId: esMesero ? usuario.usuarioId : null },
  });
  cambio = abierta.count > 0;

  if (!cambio && esMesero) {
    const tomada = await prisma.mesa.updateMany({ where: { id: mesaId, meseroId: null }, data: { meseroId: usuario.usuarioId } });
    cambio = tomada.count > 0;
    if (!cambio) {
      const actual = await prisma.mesa.findUniqueOrThrow({ where: { id: mesaId } });
      if (actual.meseroId !== usuario.usuarioId) throw new ApiAuthError(403, "Esta mesa la atiende otro mesero");
    }
  }

  const actualizada = await prisma.mesa.findUniqueOrThrow({ where: { id: mesaId } });
  if (cambio) emitirEvento(restauranteId, "mesa-actualizada", { mesaId, numero: actualizada.numero, estado: actualizada.estado });
  return actualizada;
}
