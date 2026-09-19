import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";

export class InventarioError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

type VenderEnMenu = {
  nombre?: string;
  categoriaId: string;
  precio: number;
  estacion?: "bar" | "parrilla" | "cocina_general";
  cantidadPorVenta?: number;
};

/**
 * Agrega un item nuevo al inventario. Si el stock inicial es mayor a 0 deja el
 * movimiento de "entrada" para que el historial (y la fecha de ingreso) sea
 * coherente. Con `venderEnMenu` tambien crea el plato/bebida vendible con una
 * receta de un solo ingrediente (util para bebidas o productos que se compran
 * ya listos: cada venta descuenta `cantidadPorVenta` unidades), todo en una
 * sola transaccion.
 */
export async function crearIngrediente(
  restauranteId: string,
  usuarioId: string,
  data: { nombre: string; unidadMedida?: string; stockActual?: number; stockMinimo?: number; ubicacion?: string; venderEnMenu?: VenderEnMenu }
) {
  const nombre = data.nombre.trim();
  if (!nombre) throw new InventarioError("nombre_requerido", "El nombre es requerido");

  const stock = data.stockActual ?? 0;
  const minimo = data.stockMinimo ?? 0;
  if (!(stock >= 0) || !(minimo >= 0)) throw new InventarioError("cantidad_invalida", "El stock no puede ser negativo");

  const duplicado = await prisma.ingrediente.findUnique({ where: { restauranteId_nombre: { restauranteId, nombre } } });
  if (duplicado) throw new InventarioError("nombre_duplicado", `Ya existe "${nombre}" en el inventario`);

  const menu = data.venderEnMenu;
  if (menu) {
    if (!(menu.precio > 0)) throw new InventarioError("precio_invalido", "El precio de venta debe ser mayor a 0");
    const categoria = await prisma.categoriaMenu.findUnique({ where: { id: menu.categoriaId } });
    if (!categoria || categoria.restauranteId !== restauranteId) throw new InventarioError("categoria_no_existe", "La categoría no existe");
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const ingrediente = await tx.ingrediente.create({
      data: {
        restauranteId,
        nombre,
        unidadMedida: data.unidadMedida || "g",
        stockActual: stock,
        stockMinimo: minimo,
        ubicacion: data.ubicacion?.trim() || null,
      },
    });

    if (stock > 0) {
      await tx.movimientoInventario.create({
        data: { ingredienteId: ingrediente.id, tipo: "entrada", cantidad: stock, motivo: "Stock inicial", usuarioId },
      });
    }

    const producto = menu
      ? await tx.producto.create({
          data: {
            restauranteId,
            categoriaId: menu.categoriaId,
            nombre: menu.nombre?.trim() || nombre,
            precio: Math.round(menu.precio),
            estacion: menu.estacion ?? "cocina_general",
            ingredientes: {
              create: { ingredienteId: ingrediente.id, cantidadUsada: menu.cantidadPorVenta && menu.cantidadPorVenta > 0 ? menu.cantidadPorVenta : 1 },
            },
          },
        })
      : null;

    return { ingrediente, producto };
  });

  emitirEvento(restauranteId, "inventario-actualizado", { ingredienteId: resultado.ingrediente.id, stockActual: resultado.ingrediente.stockActual });
  if (resultado.producto) emitirEvento(restauranteId, "producto-actualizado", { productoId: resultado.producto.id });
  return resultado;
}
