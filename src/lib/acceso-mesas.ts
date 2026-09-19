import type { RolUsuario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiAuthError } from "@/lib/api-auth";

export type Solicitante = { usuarioId: string; rol: RolUsuario };

/**
 * Regla de privacidad entre meseros: un mesero solo ve (pedidos, llamados,
 * cuenta) las mesas que el mismo abrio/tomo, o las que aun nadie atiende
 * (para que alguien pueda tomarlas). Caja, administrador y cocina no tienen
 * esa restriccion.
 */
export function puedeVerMesa(usuario: Solicitante, mesa: { meseroId: string | null }): boolean {
  if (usuario.rol !== "mesero") return true;
  return mesa.meseroId === null || mesa.meseroId === usuario.usuarioId;
}

/** Filtro de Prisma equivalente a puedeVerMesa, para listar solo lo visible. */
export function filtroMesasVisibles(usuario: Solicitante) {
  if (usuario.rol !== "mesero") return {};
  return { OR: [{ meseroId: null }, { meseroId: usuario.usuarioId }] };
}

/** Lanza 404/403 si la mesa no existe en el restaurante o el mesero no puede verla. */
export async function asegurarAccesoMesa(restauranteId: string, usuario: Solicitante, mesaId: string) {
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa || mesa.restauranteId !== restauranteId) throw new ApiAuthError(404, "Mesa no existe");
  if (!puedeVerMesa(usuario, mesa)) throw new ApiAuthError(403, "Esta mesa la atiende otro mesero");
  return mesa;
}
