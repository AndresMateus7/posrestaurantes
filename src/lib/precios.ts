// Calculos de costo, precio y margen. No dependen del servidor: los usan tanto la API como
// los editores del panel. Igual que en el sistema del micromercado, el margen es la ganancia
// sobre el PRECIO de venta: precio = costo / (1 - margen) y margen = 1 - costo / precio.

/** Sube al siguiente $100 (los precios del menu no llevan decenas). */
export function redondearPrecio(valor: number): number {
  return Math.ceil(valor / 100 - 1e-9) * 100;
}

/** Precio de venta que deja `margenPct` % de ganancia sobre el precio; null si no se puede calcular. */
export function precioPorMargen(costo: number, margenPct: number): number | null {
  if (!(costo > 0) || !(margenPct >= 0 && margenPct < 100)) return null;
  return redondearPrecio(costo / (1 - margenPct / 100));
}

/** Margen real (%) de un precio dado el costo; null si falta el costo o el precio. Negativo = se vende con perdida. */
export function margenPorPrecio(costo: number, precio: number): number | null {
  if (!(costo > 0) || !(precio > 0)) return null;
  return (1 - costo / precio) * 100;
}

export const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

/** Costo por unidad: con decimales cuando es chico (ej. $3,5 por gramo), sin ellos cuando es grande. */
export function formatoCosto(v: number): string {
  if (v >= 100) return formatoCOP(v);
  return "$" + v.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

export const formatoMargen = (m: number | null) => (m === null ? "—" : `${Math.round(m)}%`);

/**
 * Los insumos se cuentan en gramos o mililitros pero se compran por kilo o por litro:
 * `factor` pasa de la unidad de compra a la unidad del inventario.
 */
export type UnidadCompra = { valor: string; etiqueta: string; factor: number };

export function unidadesDeCompra(base: string): UnidadCompra[] {
  if (base === "g") {
    return [
      { valor: "kg", etiqueta: "kg", factor: 1000 },
      { valor: "g", etiqueta: "g", factor: 1 },
    ];
  }
  if (base === "ml") {
    return [
      { valor: "l", etiqueta: "litros", factor: 1000 },
      { valor: "ml", etiqueta: "ml", factor: 1 },
    ];
  }
  return [{ valor: base, etiqueta: base, factor: 1 }];
}

/** Unidad "grande" para mostrar el costo (por kilo / por litro); null si el insumo se cuenta por unidades. */
export function unidadGrande(base: string): { factor: number; etiqueta: string } | null {
  if (base === "g") return { factor: 1000, etiqueta: "kg" };
  if (base === "ml") return { factor: 1000, etiqueta: "L" };
  return null;
}

/** "7.671 g (7,7 kg)" — la cantidad con su equivalente en kilos/litros cuando pasa de 1.000. */
export function formatoCantidad(cantidad: number, base: string): string {
  const grande = unidadGrande(base);
  const num = (v: number, dec = 2) => v.toLocaleString("es-CO", { maximumFractionDigits: dec });
  if (grande && Math.abs(cantidad) >= grande.factor) return `${num(cantidad, 0)} ${base} (${num(cantidad / grande.factor, 2)} ${grande.etiqueta})`;
  if (base === "unidad") return `${num(cantidad)} ${cantidad === 1 ? "unidad" : "unidades"}`;
  return `${num(cantidad)} ${base}`;
}

/** Texto del costo de un insumo: "$12/g · $12.000/kg" (o "$3.500/u" si se cuenta por unidades). */
export function textoCostoInsumo(costoUnidad: number, base: string): string {
  const grande = unidadGrande(base);
  if (!grande) return `${formatoCosto(costoUnidad)}/${base === "unidad" ? "u" : base}`;
  return `${formatoCosto(costoUnidad)}/${base} · ${formatoCOP(costoUnidad * grande.factor)}/${grande.etiqueta}`;
}
