import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { disponibleEfectivo } from "@/lib/disponibilidad";
import { emitirEvento } from "@/lib/realtime";
import { recalcularCuentaTx } from "@/lib/cuentas";
import { contarItemsPorEntregar } from "@/lib/mesas";
import { bloquearMesa, conReintentos } from "@/lib/transacciones";

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

const redondear = (v: number) => Math.round(v * 100) / 100;

/**
 * Mueve el stock de varios ingredientes (negativo = sale, positivo = entra) con UNA sentencia por
 * ingrediente y siempre en el mismo orden (por id): dos pedidos que usan los mismos insumos se esperan
 * uno al otro en vez de bloquearse mutuamente. En las salidas, `controlado` es la parte que SI necesita
 * haber en bodega (platos sin "vender sin stock"): si no alcanza, la sentencia no toca la fila y se
 * devuelve ese ingrediente como agotado. La comprobacion y el descuento son la misma sentencia, asi
 * dos pedidos simultaneos nunca venden el mismo ultimo plato.
 */
export async function moverStock(tx: Prisma.TransactionClient, cambios: Map<string, { cantidad: number; controlado?: number }>) {
  for (const id of [...cambios.keys()].sort()) {
    const { cantidad, controlado = 0 } = cambios.get(id)!;
    const delta = redondear(cantidad);
    if (delta === 0) continue;
    const exigido = redondear(controlado);
    const filas = await tx.$executeRaw`
      UPDATE "ingredientes" SET "stock_actual" = "stock_actual" + ${delta}::numeric, "actualizado_en" = now()
      WHERE "id" = ${id} AND (${exigido}::numeric = 0 OR "stock_actual" >= ${exigido}::numeric)`;
    if (filas === 0) return id;
  }
  return null;
}

/**
 * Agrega los platos a un pedido ya creado (dentro de la transaccion): valida que existan y esten
 * disponibles, congela precio y estacion, y descuenta el stock de la receta y de los adicionales
 * que tengan un insumo ligado. Lo usan los pedidos de mesa y los de llevar / domicilio.
 * Trae productos y adicionales en una consulta cada uno y crea los platos en bloque: cada consulta
 * a la base cuesta un viaje de red, y antes eran varias por plato.
 */
export async function agregarItems(tx: Prisma.TransactionClient, restauranteId: string, pedidoId: string, items: ItemCarrito[]) {
  const productos = await tx.producto.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productoId))] }, restauranteId },
    include: { ingredientes: { include: { ingrediente: true } } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  const idsAdicionales = [...new Set(items.flatMap((i) => i.adicionales ?? []))];
  const adicionales = idsAdicionales.length ? await tx.adicional.findMany({ where: { id: { in: idsAdicionales }, restauranteId } }) : [];
  const adicionalPorId = new Map(adicionales.map((a) => [a.id, a]));

  // Cuanto sale de cada ingrediente y que plato lo usa (para decir cual se agoto).
  const salidas = new Map<string, { cantidad: number; controlado: number }>();
  const usadoPor = new Map<string, string>();
  const sacar = (ingredienteId: string, cantidad: number, controlado: boolean, nombre: string) => {
    const actual = salidas.get(ingredienteId) ?? { cantidad: 0, controlado: 0 };
    actual.cantidad -= cantidad;
    if (controlado) actual.controlado += cantidad;
    salidas.set(ingredienteId, actual);
    if (!usadoPor.has(ingredienteId) || controlado) usadoPor.set(ingredienteId, nombre);
  };

  const filasItems: Prisma.ItemPedidoCreateManyInput[] = [];
  const filasAdicionales: Prisma.ItemPedidoAdicionalCreateManyInput[] = [];
  for (const item of items) {
    const producto = porId.get(item.productoId);
    if (!producto) throw new PedidoError("producto_no_existe", `Producto ${item.productoId} no existe`);
    if (!disponibleEfectivo(producto)) throw new PedidoError("producto_agotado", `${producto.nombre} está agotado`);

    const removidos = new Set(item.ingredientesRemovidos ?? []);
    for (const pi of producto.ingredientes) {
      if (removidos.has(pi.ingredienteId)) continue;
      sacar(pi.ingredienteId, pi.cantidadUsada.toNumber() * item.cantidad, !producto.venderSinStock, producto.nombre);
    }

    const itemPedidoId = randomUUID();
    filasItems.push({
      id: itemPedidoId,
      pedidoId,
      productoId: producto.id,
      cantidad: item.cantidad,
      precioUnitario: producto.precio,
      estacion: producto.estacion,
      ingredientesRemovidos: item.ingredientesRemovidos ?? [],
    });

    for (const adicionalId of item.adicionales ?? []) {
      const adicional = adicionalPorId.get(adicionalId);
      if (!adicional) throw new PedidoError("adicional_no_existe", `Adicional ${adicionalId} no existe`);
      // Los adicionales nunca bloquearon la venta por stock: se sigue descontando sin exigir existencias.
      if (adicional.ingredienteId && adicional.cantidadUsada) sacar(adicional.ingredienteId, adicional.cantidadUsada.toNumber() * item.cantidad, false, adicional.nombre);
      filasAdicionales.push({ itemPedidoId, adicionalId: adicional.id, cantidad: item.cantidad, precioUnitario: adicional.precio });
    }
  }

  await tx.itemPedido.createMany({ data: filasItems });
  if (filasAdicionales.length) await tx.itemPedidoAdicional.createMany({ data: filasAdicionales });

  // El stock se descuenta al FINAL de la transaccion (quien llama ejecuta esta funcion justo antes de
  // terminar): la fila de un insumo muy pedido queda bloqueada solo un instante y los demas pedidos
  // que lo usan casi no esperan. Si no alcanza, el error deshace todo el pedido.
  return async function descontarStock() {
    const agotado = await moverStock(tx, salidas);
    if (agotado) throw new PedidoError("producto_agotado", `${usadoPor.get(agotado)} está agotado: no alcanza el inventario`);
  };
}

/** Avisa a cocina (y a quien escuche) que hay un pedido nuevo: de una mesa, para llevar o a domicilio. */
export function emitirPedidoCreado(
  restauranteId: string,
  pedido: { id: string; mesa: { numero: string } | null; items: { id: string; cantidad: number; estacion: string; producto: { nombre: string } }[] },
  destino: string
) {
  emitirEvento(restauranteId, "pedido-creado", {
    pedidoId: pedido.id,
    mesaNumero: pedido.mesa?.numero ?? null,
    destino,
    items: pedido.items.map((it) => ({ id: it.id, nombreProducto: it.producto.nombre, cantidad: it.cantidad, estacion: it.estacion })),
  });
}

/**
 * Crea un pedido completo: valida disponibilidad, congela precios/estacion,
 * descuenta stock de ingredientes (y de adicionales que tengan uno ligado),
 * abre la mesa si estaba libre y recalcula la cuenta. Todo en una sola
 * transaccion con la mesa bloqueada: dos pedidos a la misma mesa (o un pedido
 * y el cierre de su cuenta) van uno detras del otro, asi nunca se crean dos
 * cuentas para la mesa ni cae un plato en una cuenta que ya se cobro.
 */
export async function crearPedido(
  restauranteId: string,
  mesaId: string,
  items: ItemCarrito[],
  origen: "qr_cliente" | "mesero" | "mostrador",
  meseroId?: string
) {
  if (items.length === 0) throw new PedidoError("carrito_vacio", "El pedido no tiene items");

  const { pedidoId, cuentaId } = await conReintentos(() =>
    prisma.$transaction(
      async (tx) => {
        await bloquearMesa(tx, mesaId);
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

        const descontarStock = await agregarItems(tx, restauranteId, pedido.id, items);

        // Un pedido nuevo en una mesa libre o ya servida la deja "ocupada" (hay algo por llevar otra
        // vez). Si la cuenta se acababa de cerrar, la mesa queda a nombre del mesero que tomo el pedido.
        if (mesa.estado === "libre" || mesa.estado === "pedido_servido") {
          await tx.mesa.update({
            where: { id: mesa.id },
            data: { estado: "ocupada", ...(mesa.estado === "libre" && meseroId && !mesa.meseroId ? { meseroId } : {}) },
          });
        }

        await recalcularCuentaTx(tx, cuenta.id);
        await descontarStock();
        return { pedidoId: pedido.id, cuentaId: cuenta.id };
      },
      { timeout: 20000 }
    )
  );

  const pedidoCompleto = await prisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: { mesa: true, items: { include: { producto: true, adicionales: { include: { adicional: true } } } } },
  });

  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  emitirPedidoCreado(restauranteId, pedidoCompleto, `Mesa ${pedidoCompleto.mesa?.numero ?? "?"}`);

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
  // Los pedidos para llevar / domicilio no tienen mesa que actualizar.
  let mesaServida = false;
  if (pedido.mesaId && (await contarItemsPorEntregar(pedido.mesaId)) === 0) {
    const { count } = await prisma.mesa.updateMany({ where: { id: pedido.mesaId, estado: "ocupada" }, data: { estado: "pedido_servido" } });
    mesaServida = count > 0;
  }

  emitirEvento(restauranteId, "pedido-entregado", { pedidoId, mesaId: pedido.mesaId, itemIds: ids });
  if (mesaServida && pedido.mesa) emitirEvento(restauranteId, "mesa-actualizada", { mesaId: pedido.mesa.id, numero: pedido.mesa.numero, estado: "pedido_servido" });

  return { entregados: ids.length, pedidoCompleto: faltan === 0, mesaServida };
}
