import { prisma } from "@/lib/prisma";

export type EventoTiempoReal = { tipo: string; payload: unknown };

/**
 * /api/eventos difunde a todo el restaurante; aqui se decide que le llega a un
 * mesero para que no vea lo que piden las mesas de otros meseros (los detalles
 * tampoco viajan por el canal en vivo, no solo por la API). Devuelve null si
 * el evento no debe llegarle.
 */
export async function filtrarEventoParaMesero(usuarioId: string, evento: EventoTiempoReal): Promise<EventoTiempoReal | null> {
  switch (evento.tipo) {
    case "llamado-creado": {
      const { mesaId } = evento.payload as { mesaId?: string };
      if (!mesaId) return null;
      const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { meseroId: true } });
      return mesa && (mesa.meseroId === null || mesa.meseroId === usuarioId) ? evento : null;
    }
    // El panel del mesero solo usa este evento para refrescar el mapa: llega la
    // señal, sin el detalle de los items pedidos.
    case "pedido-creado":
      return { tipo: evento.tipo, payload: {} };
    // Cosas de cobro: el mesero no las maneja ni debe verlas.
    case "cuenta-actualizada":
    case "cuenta-cerrada":
      return null;
    // Pedidos que los clientes mandan por el link (llevan nombre y telefono): solo caja y administracion.
    case "solicitud-creada":
    case "solicitud-actualizada":
      return null;
    default:
      return evento;
  }
}

// Eventos que el menu del cliente (sin sesion) realmente necesita para
// refrescarse. Van sin contenido: el cliente solo vuelve a pedir el menu.
const EVENTOS_PUBLICOS = new Set(["mesa-actualizada", "tema-actualizado", "producto-actualizado", "inventario-actualizado", "restaurante-actualizado"]);

export function filtrarEventoPublico(evento: EventoTiempoReal): EventoTiempoReal | null {
  return EVENTOS_PUBLICOS.has(evento.tipo) ? { tipo: evento.tipo, payload: {} } : null;
}
