import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { disponibleEfectivo } from "@/lib/disponibilidad";
import { emitirEvento } from "@/lib/realtime";
import { recalcularCuenta } from "@/lib/cuentas";

export type ItemCarrito = {
  productoId: string;
  cantidad: number;
  ingredientesRemovidos?: string[];
  adicionales?: string[];
};

export class PedidoError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

/**
 * Crea un pedido completo: valida disponibilidad, congela precios/estacion,
 * descuenta stock de ingredientes (y de adicionales que tengan uno ligado),
 * y abre la mesa si estaba libre. Todo en una sola transaccion -- si algo
 * falla (ej. el CHECK stock_actual >= 0 por una condicion de carrera), se
 * revierte completo. Ver arquitectura-backend.md sec. 7 y 9.
 */
export async function crearPedido(
  restauranteId: string,
  mesaId: string,
  items: ItemCarrito[],
  origen: "qr_cliente" | "mesero" | "mostrador",
  meseroId?: string
) {
  if (items.length === 0) throw new PedidoError("carrito_vacio", "El pedido no tiene items");

  const pedidoId = await prisma.$transaction(async (tx) => {
    const mesa = await tx.mesa.findUnique({ where: { id: mesaId }, include: { restaurante: true } });
    if (!mesa || mesa.restauranteId !== restauranteId) throw new PedidoError("mesa_no_existe", "Mesa no existe");
    if (!mesa.restaurante.rotaQr && mesa.estado === "libre" && origen !== "mesero") {
      throw new PedidoError("mesa_cerrada", "Un mesero debe abrir la mesa antes de enviar el pedido");
    }

    // "dividida" tambien cuenta como abierta para este fin: si llega un pedido
    // nuevo tras dividir la cuenta, se suma a la misma cuenta (el cajero debe
    // volver a dividirla) en vez de crear una segunda cuenta huerfana para la mesa.
    let cuenta = await tx.cuenta.findFirst({ where: { mesaId, estado: { in: ["abierta", "dividida"] } } });
    if (!cuenta) {
      cuenta = await tx.cuenta.create({ data: { restauranteId, mesaId, estado: "abierta" } });
    }

    const pedido = await tx.pedido.create({
      data: { restauranteId, mesaId, cuentaId: cuenta.id, origen, meseroId, estado: "recibido" },
    });

    for (const item of items) {
      const producto = await tx.producto.findUnique({
        where: { id: item.productoId },
        include: { ingredientes: { include: { ingrediente: true } } },
      });
      if (!producto || producto.restauranteId !== restauranteId) {
        throw new PedidoError("producto_no_existe", `Producto ${item.productoId} no existe`);
      }
      if (!disponibleEfectivo(producto)) {
        throw new PedidoError("producto_agotado", `${producto.nombre} está agotado`);
      }

      const removidos = new Set(item.ingredientesRemovidos ?? []);
      for (const pi of producto.ingredientes) {
        if (removidos.has(pi.ingredienteId)) continue;
        await tx.ingrediente.update({
          where: { id: pi.ingredienteId },
          data: { stockActual: { decrement: pi.cantidadUsada.toNumber() * item.cantidad } },
        });
      }

      const itemPedido = await tx.itemPedido.create({
        data: {
          pedidoId: pedido.id,
          productoId: producto.id,
          cantidad: item.cantidad,
          precioUnitario: producto.precio,
          estacion: producto.estacion,
          ingredientesRemovidos: item.ingredientesRemovidos ?? [],
        },
      });

      for (const adicionalId of item.adicionales ?? []) {
        const adicional = await tx.adicional.findUnique({ where: { id: adicionalId } });
        if (!adicional || adicional.restauranteId !== restauranteId) {
          throw new PedidoError("adicional_no_existe", `Adicional ${adicionalId} no existe`);
        }
        if (adicional.ingredienteId && adicional.cantidadUsada) {
          await tx.ingrediente.update({
            where: { id: adicional.ingredienteId },
            data: { stockActual: { decrement: adicional.cantidadUsada.toNumber() * item.cantidad } },
          });
        }
        await tx.itemPedidoAdicional.create({
          data: { itemPedidoId: itemPedido.id, adicionalId: adicional.id, cantidad: item.cantidad, precioUnitario: adicional.precio },
        });
      }
    }

    if (mesa.estado === "libre") {
      await tx.mesa.update({ where: { id: mesa.id }, data: { estado: "ocupada" } });
    }

    return pedido.id;
  });

  const { cuentaId } = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { cuentaId: true } });
  if (cuentaId) await recalcularCuenta(cuentaId);

  const pedidoCompleto = await prisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: { mesa: true, items: { include: { producto: true, adicionales: { include: { adicional: true } } } } },
  });

  emitirEvento(restauranteId, "pedido-creado", {
    pedidoId: pedidoCompleto.id,
    mesaNumero: pedidoCompleto.mesa.numero,
    items: pedidoCompleto.items.map((it) => ({
      id: it.id,
      nombreProducto: it.producto.nombre,
      cantidad: it.cantidad,
      estacion: it.estacion,
    })),
  });

  return pedidoCompleto;
}

export function esErrorDePrisma(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Cocina avanza el estado de UN item (pendiente -> en_preparacion -> listo).
 * Cuando todos los items de un pedido llegan a listo/entregado, el pedido
 * completo pasa a "listo" -- pero la MESA no se toca aqui (ver
 * marcarPedidoEntregado): que cocina termine un plato no significa que el
 * mesero ya lo llevo a la mesa.
 */
export async function actualizarEstadoItem(restauranteId: string, itemId: string, nuevoEstado: "en_preparacion" | "listo") {
  const item = await prisma.itemPedido.findUnique({ where: { id: itemId }, include: { pedido: true } });
  if (!item || item.pedido.restauranteId !== restauranteId) throw new PedidoError("item_no_existe", "Item no existe");

  await prisma.itemPedido.update({
    where: { id: itemId },
    data: { estado: nuevoEstado, listoEn: nuevoEstado === "listo" ? new Date() : undefined },
  });

  if (nuevoEstado === "listo") {
    const hermanos = await prisma.itemPedido.findMany({ where: { pedidoId: item.pedidoId } });
    const todosListos = hermanos.every((h) => h.id === itemId || h.estado === "listo" || h.estado === "entregado");
    if (todosListos) {
      await prisma.pedido.update({ where: { id: item.pedidoId }, data: { estado: "listo" } });
    }
  }

  emitirEvento(restauranteId, "item-actualizado", { itemId, pedidoId: item.pedidoId, estado: nuevoEstado });
}

/**
 * El mesero marca un pedido como entregado (items listos -> entregado). La
 * mesa solo pasa a "pedido_servido" cuando TODOS sus pedidos activos ya se
 * entregaron -- si queda otro pedido cocinandose, sigue "ocupada".
 */
export async function marcarPedidoEntregado(restauranteId: string, pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.restauranteId !== restauranteId) throw new PedidoError("pedido_no_existe", "Pedido no existe");

  await prisma.$transaction([
    prisma.itemPedido.updateMany({ where: { pedidoId, estado: "listo" }, data: { estado: "entregado" } }),
    prisma.pedido.update({ where: { id: pedidoId }, data: { estado: "entregado" } }),
  ]);

  const otrosPendientes = await prisma.pedido.count({
    where: { mesaId: pedido.mesaId, id: { not: pedidoId }, estado: { notIn: ["entregado", "cancelado"] } },
  });
  if (otrosPendientes === 0) {
    await prisma.mesa.update({ where: { id: pedido.mesaId }, data: { estado: "pedido_servido" } });
  }

  emitirEvento(restauranteId, "pedido-entregado", { pedidoId, mesaId: pedido.mesaId });
}
