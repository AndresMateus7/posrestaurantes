import type { Ingrediente, Producto, ProductoIngrediente } from "@prisma/client";

type ProductoConReceta = Producto & {
  ingredientes: (ProductoIngrediente & { ingrediente: Ingrediente })[];
};

/**
 * Misma logica que la vista productos_disponibilidad de schema.sql:
 * disponible manual AND stock suficiente en TODOS los ingredientes de la
 * receta (no solo los no removibles -- ver el comentario en schema.sql).
 * Un producto sin receta cargada se considera siempre disponible por stock.
 * `venderSinStock` es un escape manual: el restaurante decide vender igual
 * aunque el inventario no alcance (el stock se sigue descontando y puede
 * quedar en negativo -- es solo la señal visual/bloqueo lo que se salta).
 */
export function disponibleEfectivo(producto: ProductoConReceta): boolean {
  if (!producto.disponible) return false;
  if (producto.venderSinStock) return true;
  if (producto.ingredientes.length === 0) return true;
  return producto.ingredientes.every((pi) => pi.ingrediente.stockActual.gte(pi.cantidadUsada));
}
