import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { disponibleEfectivo } from "@/lib/disponibilidad";
import { emitirEvento } from "@/lib/realtime";
import { recalcularCuenta } from "@/lib/cuentas";
import { contarItemsPorEntregar } from "@/lib/mesas";

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

    // Un pedido nuevo en una mesa que ya estaba servida vuelve a dejarla "ocupada"
    // (hay algo por llevar otra vez).
    if (mesa.estado === "libre" || mesa.estado === "pedido_servido") {
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
 * El mesero lleva platos a la mesa: pasan de "listo" a "entregado". Puede
 * entregar platos sueltos (itemIds) o todo lo que este listo del pedido. El
 * pedido queda "entregado" cuando ya no le falta ningun plato, y la mesa pasa
 * a "pedido_servido" solo cuando no queda nada por llevar en toda su cuenta --
 * si otro plato sigue en cocina, la mesa sigue "ocupada".
 */
export async function entregarItems(restauranteId: string, pedidoId: string, itemIds?: string[]) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { mesa: true, items: { include: { producto: { select: { nombre: true } } } } },
  });
  if (!pedido || pedido.restauranteId !== restauranteId) throw new PedidoError("pedido_no_existe", "Pedido no existe");

  let porEntregar = pedido.items.filter((it) => it.estado === "listo");
  if (itemIds) {
    const solicitados = new Set(itemIds);
    const elegidos = pedido.items.filter((it) => solicitados.has(it.id));
    if (elegidos.length !== solicitados.size) throw new PedidoError("item_no_existe", "Ese plato no pertenece al pedido");
    const noListo = elegidos.find((it) => it.estado !== "listo");
    if (noListo) {
      const motivo = noListo.estado === "entregado" ? "ya fue entregado" : "todavía no está listo en cocina";
      throw new PedidoError("item_no_listo", `${noListo.producto.nombre} ${motivo}`);
    }
    porEntregar = elegidos;
  }
  if (porEntregar.length === 0) throw new PedidoError("nada_por_entregar", "No hay platos listos por entregar en este pedido");

  const ids = porEntregar.map((it) => it.id);
  await prisma.itemPedido.updateMany({ where: { id: { in: ids }, estado: "listo" }, data: { estado: "entregado" } });

  const faltan = await prisma.itemPedido.count({ where: { pedidoId, estado: { in: ["pendiente", "en_preparacion", "listo"] } } });
  if (faltan === 0) await prisma.pedido.update({ where: { id: pedidoId }, data: { estado: "entregado" } });

  // Solo una mesa "ocupada" pasa a servida: si ya pidieron la cuenta, sigue "cuenta solicitada".
  let mesaServida = false;
  if ((await contarItemsPorEntregar(pedido.mesaId)) === 0) {
    const { count } = await prisma.mesa.updateMany({ where: { id: pedido.mesaId, estado: "ocupada" }, data: { estado: "pedido_servido" } });
    mesaServida = count > 0;
  }

  emitirEvento(restauranteId, "pedido-entregado", { pedidoId, mesaId: pedido.mesaId, itemIds: ids });
  if (mesaServida) emitirEvento(restauranteId, "mesa-actualizada", { mesaId: pedido.mesaId, numero: pedido.mesa.numero, estado: "pedido_servido" });

  return { entregados: ids.length, pedidoCompleto: faltan === 0, mesaServida };
}
