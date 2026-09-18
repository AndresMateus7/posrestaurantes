import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";

export class FacturaProveedorError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

export type ItemFacturaProveedor = { ingredienteId: string; cantidad: number; costoUnitario: number };

const incluirDetalle = {
  items: { include: { ingrediente: { select: { nombre: true, unidadMedida: true } } } },
  registradoPor: { select: { nombre: true } },
} as const;

/**
 * Registra una compra real a un proveedor: el valor y la cantidad los digita
 * el usuario (no una formula automatica como el viejo boton "Reabastecer").
 * Actualiza stock y el costo promedio ponderado (CPP) de cada ingrediente en
 * una sola transaccion, igual que sistema-pos (ver factura_compra_items).
 */
export async function registrarFacturaProveedor(
  restauranteId: string,
  usuarioId: string,
  data: { proveedor: string; numeroFactura?: string; fecha?: Date; items: ItemFacturaProveedor[] }
) {
  if (!data.proveedor.trim()) throw new FacturaProveedorError("proveedor_requerido", "El proveedor es requerido");
  if (data.items.length === 0) throw new FacturaProveedorError("sin_items", "La factura no tiene items");
  for (const it of data.items) {
    if (!(it.cantidad > 0)) throw new FacturaProveedorError("cantidad_invalida", "La cantidad debe ser mayor a 0");
    if (!(it.costoUnitario >= 0)) throw new FacturaProveedorError("costo_invalido", "El costo unitario no puede ser negativo");
  }

  const facturaId = await prisma.$transaction(async (tx) => {
    const itemsData: { ingredienteId: string; cantidad: number; costoUnitario: number; subtotal: number }[] = [];
    let total = 0;

    for (const it of data.items) {
      const ingrediente = await tx.ingrediente.findUnique({ where: { id: it.ingredienteId } });
      if (!ingrediente || ingrediente.restauranteId !== restauranteId) {
        throw new FacturaProveedorError("ingrediente_no_existe", `Ingrediente ${it.ingredienteId} no existe`);
      }

      const stockAnterior = ingrediente.stockActual.toNumber();
      const nuevoStock = stockAnterior + it.cantidad;
      // CPP: promedio ponderado entre lo que ya habia en bodega y lo recien comprado.
      const nuevoCosto =
        nuevoStock > 0 ? Math.round((stockAnterior * ingrediente.costoPromedio + it.cantidad * it.costoUnitario) / nuevoStock) : it.costoUnitario;
      const subtotal = Math.round(it.cantidad * it.costoUnitario);
      total += subtotal;

      await tx.ingrediente.update({
        where: { id: it.ingredienteId },
        data: { stockActual: { increment: it.cantidad }, costoPromedio: nuevoCosto },
      });
      await tx.movimientoInventario.create({
        data: {
          ingredienteId: it.ingredienteId,
          tipo: "entrada",
          cantidad: it.cantidad,
          motivo: `Factura proveedor: ${data.proveedor}${data.numeroFactura ? " #" + data.numeroFactura : ""}`,
          usuarioId,
        },
      });

      itemsData.push({ ingredienteId: it.ingredienteId, cantidad: it.cantidad, costoUnitario: it.costoUnitario, subtotal });
    }

    const factura = await tx.facturaProveedor.create({
      data: {
        restauranteId,
        proveedor: data.proveedor.trim(),
        numeroFactura: data.numeroFactura?.trim() || null,
        fecha: data.fecha ?? new Date(),
        total,
        registradoPorId: usuarioId,
        items: { createMany: { data: itemsData } },
      },
    });
    return factura.id;
  });

  for (const it of data.items) {
    const actualizado = await prisma.ingrediente.findUniqueOrThrow({ where: { id: it.ingredienteId } });
    emitirEvento(restauranteId, "inventario-actualizado", { ingredienteId: it.ingredienteId, stockActual: actualizado.stockActual });
  }

  return prisma.facturaProveedor.findUniqueOrThrow({ where: { id: facturaId }, include: incluirDetalle });
}

export async function listarFacturasProveedor(restauranteId: string, rango?: { desde: Date; hasta: Date }) {
  return prisma.facturaProveedor.findMany({
    where: { restauranteId, ...(rango ? { fecha: { gte: rango.desde, lte: rango.hasta } } : {}) },
    include: incluirDetalle,
    orderBy: { fecha: "desc" },
  });
}

// El servidor puede correr en UTC -- calcular "inicio de mes" con fecha del
// servidor correria el corte de mes hasta 5h respecto a la hora de Colombia.
function inicioMesBogota(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = partes.find((p) => p.type === "year")!.value;
  const month = partes.find((p) => p.type === "month")!.value;
  return new Date(`${year}-${month}-01T00:00:00-05:00`);
}

export async function resumenFacturasProveedor(restauranteId: string) {
  const inicioMes = inicioMesBogota();

  const [facturasTotales, sumaTotal, sumaMes, proveedores] = await Promise.all([
    prisma.facturaProveedor.count({ where: { restauranteId } }),
    prisma.facturaProveedor.aggregate({ where: { restauranteId }, _sum: { total: true } }),
    prisma.facturaProveedor.aggregate({ where: { restauranteId, fecha: { gte: inicioMes } }, _sum: { total: true } }),
    prisma.facturaProveedor.findMany({ where: { restauranteId }, select: { proveedor: true }, distinct: ["proveedor"] }),
  ]);

  return {
    facturasTotales,
    totalHistorico: sumaTotal._sum.total ?? 0,
    totalEsteMes: sumaMes._sum.total ?? 0,
    proveedoresDistintos: proveedores.length,
  };
}
