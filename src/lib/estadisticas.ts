import { prisma } from "@/lib/prisma";

export type RangoFechas = { desde: Date; hasta: Date };

// El servidor corre en UTC pero el restaurante opera en hora de Colombia
// (sin horario de verano) -- agrupar ventas por dia con toISOString().slice()
// desplazaria las ventas de la noche (7pm-11:59pm) al dia siguiente.
const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const diaBogota = (fecha: Date) => formatoDiaBogota.format(fecha);

export type PlatoEstadistica = {
  productoId: string;
  nombre: string;
  categoria: string;
  cantidadVendida: number;
  ingresos: number;
};

/**
 * Ventas = cuentas ya pagadas (no abiertas/divididas sin cobrar ni anuladas),
 * filtradas por cerrado_en -- es la misma nocion de "venta" que usa el arqueo
 * de caja (ver src/lib/turnos.ts), asi las estadisticas nunca contradicen el
 * dinero que efectivamente entro.
 */
export async function obtenerEstadisticasVentas(restauranteId: string, { desde, hasta }: RangoFechas) {
  const cuentas = await prisma.cuenta.findMany({
    where: { restauranteId, estado: "pagada", cerradoEn: { gte: desde, lte: hasta } },
    select: { id: true, subtotal: true, propina: true, total: true, cerradoEn: true },
  });

  const cantidadVentas = cuentas.length;
  const totalVendido = cuentas.reduce((acc, c) => acc + c.subtotal, 0);
  const totalPropinas = cuentas.reduce((acc, c) => acc + c.propina, 0);
  const totalCobrado = cuentas.reduce((acc, c) => acc + c.total, 0);
  const ticketPromedio = cantidadVentas > 0 ? Math.round(totalCobrado / cantidadVentas) : 0;

  const porDia = new Map<string, number>();
  for (const c of cuentas) {
    const fecha = diaBogota(c.cerradoEn!);
    porDia.set(fecha, (porDia.get(fecha) ?? 0) + c.total);
  }
  const ventasPorDia = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha, total }));

  const pagos = await prisma.pago.findMany({
    where: { cuenta: { restauranteId, estado: "pagada", cerradoEn: { gte: desde, lte: hasta } } },
    select: { metodo: true, monto: true },
  });
  const ventasPorMetodo = pagos.reduce<Record<string, number>>((acc, p) => {
    acc[p.metodo] = (acc[p.metodo] ?? 0) + p.monto;
    return acc;
  }, {});

  const items = await prisma.itemPedido.findMany({
    where: {
      estado: { not: "cancelado" },
      pedido: { restauranteId, cuenta: { estado: "pagada", cerradoEn: { gte: desde, lte: hasta } } },
    },
    select: {
      productoId: true,
      cantidad: true,
      precioUnitario: true,
      producto: { select: { nombre: true, categoria: { select: { nombre: true } } } },
    },
  });

  const porProducto = new Map<string, PlatoEstadistica>();
  for (const it of items) {
    const actual = porProducto.get(it.productoId) ?? {
      productoId: it.productoId,
      nombre: it.producto.nombre,
      categoria: it.producto.categoria.nombre,
      cantidadVendida: 0,
      ingresos: 0,
    };
    actual.cantidadVendida += it.cantidad;
    actual.ingresos += it.cantidad * it.precioUnitario;
    porProducto.set(it.productoId, actual);
  }

  // Los productos activos sin ventas en el rango entran con cantidad 0, para
  // que "menos vendidos" tambien saque a la luz los platos que nadie pide.
  const productosActivos = await prisma.producto.findMany({
    where: { restauranteId, disponible: true },
    select: { id: true, nombre: true, categoria: { select: { nombre: true } } },
  });
  for (const p of productosActivos) {
    if (!porProducto.has(p.id)) {
      porProducto.set(p.id, { productoId: p.id, nombre: p.nombre, categoria: p.categoria.nombre, cantidadVendida: 0, ingresos: 0 });
    }
  }

  const todos = [...porProducto.values()];
  const masVendidos = [...todos].sort((a, b) => b.cantidadVendida - a.cantidadVendida || a.nombre.localeCompare(b.nombre)).slice(0, 8);
  const menosVendidos = [...todos].sort((a, b) => a.cantidadVendida - b.cantidadVendida || a.nombre.localeCompare(b.nombre)).slice(0, 8);

  return {
    cantidadVentas,
    totalVendido,
    totalPropinas,
    totalCobrado,
    ticketPromedio,
    ventasPorDia,
    ventasPorMetodo,
    masVendidos,
    menosVendidos,
  };
}

/** Historial de ventas (una fila por cuenta pagada) para la pestaña de Historial. */
export async function listarHistorialVentas(restauranteId: string, { desde, hasta }: RangoFechas) {
  const cuentas = await prisma.cuenta.findMany({
    where: { restauranteId, estado: "pagada", cerradoEn: { gte: desde, lte: hasta } },
    orderBy: { cerradoEn: "desc" },
    include: {
      mesa: { select: { numero: true } },
      pedidos: { include: { items: { include: { producto: { select: { nombre: true } } } } } },
      pagos: { include: { usuario: { select: { nombre: true } } } },
    },
  });

  return cuentas.map((c) => ({
    id: c.id,
    mesaNumero: c.mesa.numero,
    cerradoEn: c.cerradoEn,
    subtotal: c.subtotal,
    propina: c.propina,
    total: c.total,
    items: c.pedidos.flatMap((p) => p.items.filter((it) => it.estado !== "cancelado").map((it) => ({ nombreProducto: it.producto.nombre, cantidad: it.cantidad }))),
    pagos: c.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibidoPor: p.usuario?.nombre ?? null })),
  }));
}
