import { prisma } from "@/lib/prisma";
import { conReintentos } from "@/lib/transacciones";
import { emitirEvento } from "@/lib/realtime";
import { calcularImpacto, valorInventario } from "@/lib/costos";

export class FacturaProveedorError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

/**
 * Una linea de la factura: `cantidad` en la unidad del inventario (g, ml, unidades) y lo que se PAGO
 * por ella (`valorTotal`, en pesos). `costoUnitario` (valor por unidad) se acepta como alternativa.
 */
export type ItemFacturaProveedor = { ingredienteId: string; cantidad: number; valorTotal?: number; costoUnitario?: number };

const incluirDetalle = {
  items: { include: { ingrediente: { select: { nombre: true, unidadMedida: true } } } },
  registradoPor: { select: { nombre: true } },
} as const;

/**
 * Registra una compra real a un proveedor: el valor y la cantidad los digita
 * el usuario (no una formula automatica como el viejo boton "Reabastecer").
 * Actualiza stock y el costo promedio ponderado (CPP) de cada ingrediente en
 * una sola transaccion, igual que sistema-pos (ver factura_compra_items).
 * Devuelve ademas el valor del inventario antes y despues, y los platos cuyo
 * costo cambio con esta compra.
 */
export async function registrarFacturaProveedor(
  restauranteId: string,
  usuarioId: string,
  data: { proveedor: string; numeroFactura?: string; fecha?: Date; items: ItemFacturaProveedor[] }
) {
  if (!data.proveedor.trim()) throw new FacturaProveedorError("proveedor_requerido", "El proveedor es requerido");
  if (data.items.length === 0) throw new FacturaProveedorError("sin_items", "La factura no tiene items");

  // Valor pagado por linea, en pesos enteros.
  const lineas = data.items.map((it) => {
    if (!(it.cantidad > 0)) throw new FacturaProveedorError("cantidad_invalida", "La cantidad debe ser mayor a 0");
    const valor = it.valorTotal ?? (it.costoUnitario !== undefined ? it.cantidad * it.costoUnitario : NaN);
    if (!(valor >= 0)) throw new FacturaProveedorError("valor_invalido", "Falta el valor pagado de cada producto (puede ser 0, no negativo)");
    return { ingredienteId: it.ingredienteId, cantidad: it.cantidad, valor: Math.round(valor) };
  });

  const valorAntes = await valorInventario(restauranteId);
  const costosAntes = new Map<string, number>();

  // Siempre en el mismo orden (por insumo) y reintentando si choca con un pedido que descuenta lo mismo.
  lineas.sort((a, b) => (a.ingredienteId < b.ingredienteId ? -1 : a.ingredienteId > b.ingredienteId ? 1 : 0));
  const facturaId = await conReintentos(() => prisma.$transaction(async (tx) => {
    const itemsData: { ingredienteId: string; cantidad: number; costoUnitario: number; costoPorUnidad: number; subtotal: number }[] = [];
    let total = 0;

    for (const it of lineas) {
      // Bloqueado: el costo promedio se calcula con el stock real del momento (un pedido simultaneo espera).
      await tx.$queryRaw`SELECT "id" FROM "ingredientes" WHERE "id" = ${it.ingredienteId} FOR UPDATE`;
      const ingrediente = await tx.ingrediente.findUnique({ where: { id: it.ingredienteId } });
      if (!ingrediente || ingrediente.restauranteId !== restauranteId) {
        throw new FacturaProveedorError("ingrediente_no_existe", `Ingrediente ${it.ingredienteId} no existe`);
      }
      if (!costosAntes.has(ingrediente.id)) costosAntes.set(ingrediente.id, ingrediente.costoUnidad);

      // Un stock negativo (se vendio sin inventario) no pesa en el promedio.
      const stockAnterior = Math.max(0, ingrediente.stockActual.toNumber());
      const costoPorUnidad = it.valor / it.cantidad;
      // CPP: promedio ponderado entre lo que ya habia en bodega y lo recien comprado.
      const nuevoCosto = (stockAnterior * ingrediente.costoUnidad + it.valor) / (stockAnterior + it.cantidad);
      total += it.valor;

      await tx.ingrediente.update({
        where: { id: it.ingredienteId },
        // costoPromedio (entero) sigue escribiendose por compatibilidad; el que se lee es costoUnidad.
        data: { stockActual: { increment: it.cantidad }, costoUnidad: nuevoCosto, costoPromedio: Math.round(nuevoCosto) },
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

      itemsData.push({ ingredienteId: it.ingredienteId, cantidad: it.cantidad, costoUnitario: Math.round(costoPorUnidad), costoPorUnidad, subtotal: it.valor });
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
  }));

  for (const it of lineas) {
    const actualizado = await prisma.ingrediente.findUniqueOrThrow({ where: { id: it.ingredienteId } });
    emitirEvento(restauranteId, "inventario-actualizado", { ingredienteId: it.ingredienteId, stockActual: actualizado.stockActual });
  }

  const [factura, valorDespues, impacto] = await Promise.all([
    prisma.facturaProveedor.findUniqueOrThrow({ where: { id: facturaId }, include: incluirDetalle }),
    valorInventario(restauranteId),
    calcularImpacto(restauranteId, costosAntes),
  ]);
  return { factura, valorInventarioAntes: valorAntes, valorInventario: valorDespues, impacto };
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

  const [facturasTotales, sumaTotal, sumaMes, proveedores, valor] = await Promise.all([
    prisma.facturaProveedor.count({ where: { restauranteId } }),
    prisma.facturaProveedor.aggregate({ where: { restauranteId }, _sum: { total: true } }),
    prisma.facturaProveedor.aggregate({ where: { restauranteId, fecha: { gte: inicioMes } }, _sum: { total: true } }),
    prisma.facturaProveedor.findMany({ where: { restauranteId }, select: { proveedor: true }, distinct: ["proveedor"] }),
    valorInventario(restauranteId),
  ]);

  return {
    facturasTotales,
    totalHistorico: sumaTotal._sum.total ?? 0,
    totalEsteMes: sumaMes._sum.total ?? 0,
    proveedoresDistintos: proveedores.length,
    valorInventario: valor,
  };
}
