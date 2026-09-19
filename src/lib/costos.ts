import type { Ingrediente } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Costos de platos y adicionales a partir del costo promedio de cada insumo (el que dejan las
// facturas de proveedor) y del valor total del inventario. Solo lo ve el administrador (y caja
// al registrar facturas): meseros y cocina nunca reciben costos ni margenes.

export type LineaCosto = { ingredienteId: string; nombre: string; unidadMedida: string; cantidad: number; costoUnidad: number; subtotal: number };

export type CostoProducto = {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  /** Suma de la receta (parcial si a algun insumo aun no se le conoce el costo); null si el plato no tiene receta. */
  costo: number | null;
  completo: boolean;
  /** Insumos sin costo todavia, o "Sin receta". */
  faltantes: string[];
  receta: LineaCosto[];
};

export type CostoAdicional = {
  id: string;
  nombre: string;
  precio: number;
  costo: number | null;
  completo: boolean;
  faltante: string | null;
  ingrediente: { nombre: string; unidadMedida: string } | null;
  cantidad: number | null;
};

/** Quita el costo de un insumo antes de mandarlo a quien no debe verlo (meseros, cocina). */
export function sinCostos<T extends Pick<Ingrediente, "costoPromedio" | "costoUnidad">>(ingrediente: T): Omit<T, "costoPromedio" | "costoUnidad"> {
  const copia: Record<string, unknown> = { ...ingrediente };
  delete copia.costoPromedio;
  delete copia.costoUnidad;
  return copia as Omit<T, "costoPromedio" | "costoUnidad">;
}

/** Valor del inventario a costo: existencias por el costo promedio de cada insumo (el stock negativo no cuenta). */
export async function valorInventario(restauranteId: string): Promise<number> {
  const ingredientes = await prisma.ingrediente.findMany({ where: { restauranteId }, select: { stockActual: true, costoUnidad: true } });
  return ingredientes.reduce((acc, i) => acc + Math.max(0, i.stockActual.toNumber()) * i.costoUnidad, 0);
}

const conReceta = {
  categoria: { select: { nombre: true } },
  ingredientes: { include: { ingrediente: { select: { id: true, nombre: true, unidadMedida: true, costoUnidad: true } } } },
} as const;

function costearReceta(receta: { cantidad: number; ingrediente: { id: string; nombre: string; unidadMedida: string; costoUnidad: number } }[]) {
  const lineas: LineaCosto[] = receta.map((l) => ({
    ingredienteId: l.ingrediente.id,
    nombre: l.ingrediente.nombre,
    unidadMedida: l.ingrediente.unidadMedida,
    cantidad: l.cantidad,
    costoUnidad: l.ingrediente.costoUnidad,
    subtotal: l.cantidad * l.ingrediente.costoUnidad,
  }));
  const faltantes = lineas.filter((l) => !(l.costoUnidad > 0)).map((l) => l.nombre);
  return { lineas, faltantes, costo: lineas.length > 0 ? lineas.reduce((acc, l) => acc + l.subtotal, 0) : null };
}

/** Costo de cada plato (segun su receta) y de cada adicional (segun su insumo), para fijar precios y margenes. */
export async function obtenerCostos(restauranteId: string) {
  const [productos, adicionales] = await Promise.all([
    prisma.producto.findMany({
      where: { restauranteId },
      orderBy: [{ categoria: { orden: "asc" } }, { orden: "asc" }, { nombre: "asc" }],
      include: conReceta,
    }),
    prisma.adicional.findMany({
      where: { restauranteId },
      orderBy: { nombre: "asc" },
      include: { ingrediente: { select: { nombre: true, unidadMedida: true, costoUnidad: true } } },
    }),
  ]);

  const costosProductos: CostoProducto[] = productos.map((p) => {
    const { lineas, faltantes, costo } = costearReceta(p.ingredientes.map((pi) => ({ cantidad: pi.cantidadUsada.toNumber(), ingrediente: pi.ingrediente })));
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria.nombre,
      precio: p.precio,
      costo,
      completo: lineas.length > 0 && faltantes.length === 0,
      faltantes: lineas.length === 0 ? ["Sin receta"] : faltantes,
      receta: lineas,
    };
  });

  const costosAdicionales: CostoAdicional[] = adicionales.map((a) => {
    const cantidad = a.cantidadUsada?.toNumber() ?? null;
    const conCosto = !!a.ingrediente && cantidad !== null && cantidad > 0 && a.ingrediente.costoUnidad > 0;
    return {
      id: a.id,
      nombre: a.nombre,
      precio: a.precio,
      costo: a.ingrediente && cantidad !== null ? cantidad * a.ingrediente.costoUnidad : null,
      completo: conCosto,
      faltante: !a.ingrediente || cantidad === null || cantidad <= 0 ? "Sin insumo" : a.ingrediente.costoUnidad > 0 ? null : a.ingrediente.nombre,
      ingrediente: a.ingrediente ? { nombre: a.ingrediente.nombre, unidadMedida: a.ingrediente.unidadMedida } : null,
      cantidad,
    };
  });

  return { productos: costosProductos, adicionales: costosAdicionales };
}

export type ImpactoCosto = {
  id: string;
  nombre: string;
  precio: number;
  /** Costo antes de la compra; null si entonces aun faltaba el costo de algun insumo. */
  costoAntes: number | null;
  costoDespues: number;
};

/**
 * Platos y adicionales cuyo costo cambio por una compra: `costosAntes` trae el costo que tenia cada
 * insumo comprado ANTES de registrar la factura. Solo entran los que ya tienen costo completo;
 * `pendientes` cuenta los que siguen sin costo completo (les faltan otros insumos).
 */
export async function calcularImpacto(restauranteId: string, costosAntes: Map<string, number>) {
  const ids = [...costosAntes.keys()];
  const [productos, adicionales] = await Promise.all([
    prisma.producto.findMany({ where: { restauranteId, ingredientes: { some: { ingredienteId: { in: ids } } } }, include: conReceta }),
    prisma.adicional.findMany({
      where: { restauranteId, ingredienteId: { in: ids } },
      include: { ingrediente: { select: { id: true, nombre: true, unidadMedida: true, costoUnidad: true } } },
    }),
  ]);

  let pendientes = 0;
  const cambios: { productos: ImpactoCosto[]; adicionales: ImpactoCosto[] } = { productos: [], adicionales: [] };

  const evaluar = (
    destino: ImpactoCosto[],
    item: { id: string; nombre: string; precio: number },
    receta: { cantidad: number; ingrediente: { id: string; nombre: string; unidadMedida: string; costoUnidad: number } }[]
  ) => {
    const despues = costearReceta(receta);
    if (despues.faltantes.length > 0 || despues.costo === null) {
      pendientes++;
      return;
    }
    const antes = costearReceta(receta.map((l) => ({ cantidad: l.cantidad, ingrediente: { ...l.ingrediente, costoUnidad: costosAntes.get(l.ingrediente.id) ?? l.ingrediente.costoUnidad } })));
    const costoAntes = antes.faltantes.length === 0 ? antes.costo : null;
    if (costoAntes !== null && Math.abs(despues.costo - costoAntes) < 0.5) return;
    destino.push({ id: item.id, nombre: item.nombre, precio: item.precio, costoAntes, costoDespues: despues.costo });
  };

  for (const p of productos) {
    evaluar(cambios.productos, p, p.ingredientes.map((pi) => ({ cantidad: pi.cantidadUsada.toNumber(), ingrediente: pi.ingrediente })));
  }
  for (const a of adicionales) {
    if (!a.ingrediente || !a.cantidadUsada) continue;
    evaluar(cambios.adicionales, a, [{ cantidad: a.cantidadUsada.toNumber(), ingrediente: a.ingrediente }]);
  }

  return { ...cambios, pendientes };
}
