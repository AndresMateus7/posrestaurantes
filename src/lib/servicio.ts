// Pedidos en mesa, para llevar y a domicilio: nombres, iconos y estado de la entrega. No depende del
// servidor (lo usan la API y los paneles), asi todos hablan igual.

export type TipoServicio = "mesa" | "llevar" | "domicilio";

export const NOMBRE_SERVICIO: Record<TipoServicio, string> = { mesa: "Mesa", llevar: "Para llevar", domicilio: "Domicilio" };
export const ICONO_SERVICIO: Record<TipoServicio, string> = { mesa: "🍽️", llevar: "🥡", domicilio: "🛵" };

type DatosServicio = { tipo: TipoServicio; numero: number | null; mesaNumero: string | null };

/** "Mesa 5", "Para llevar #7" o "Domicilio #12". */
export function etiquetaServicio(d: DatosServicio): string {
  if (d.tipo === "mesa") return `Mesa ${d.mesaNumero ?? "?"}`;
  return `${NOMBRE_SERVICIO[d.tipo]} #${d.numero ?? "?"}`;
}

/** Igual, con el nombre del cliente en los pedidos para llevar / domicilio: "Domicilio #12 · Juan Pérez". */
export function etiquetaConCliente(d: DatosServicio & { clienteNombre: string | null }): string {
  const base = etiquetaServicio(d);
  return d.tipo !== "mesa" && d.clienteNombre ? `${base} · ${d.clienteNombre}` : base;
}

/**
 * En que va un pedido para llevar / a domicilio, segun sus platos:
 * en cocina -> listo -> (solo domicilio) en camino -> entregado.
 */
export type EstadoEntrega = "sin_platos" | "en_cocina" | "listo" | "en_camino" | "entregado";

export function estadoEntrega(estadosPlatos: string[], despachado: boolean): EstadoEntrega {
  const activos = estadosPlatos.filter((e) => e !== "cancelado");
  if (activos.length === 0) return "sin_platos";
  if (activos.every((e) => e === "entregado")) return "entregado";
  if (activos.every((e) => e === "listo" || e === "entregado")) return despachado ? "en_camino" : "listo";
  return "en_cocina";
}

export const ETIQUETA_ENTREGA: Record<EstadoEntrega, string> = {
  sin_platos: "Sin platos",
  en_cocina: "En cocina",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
};
