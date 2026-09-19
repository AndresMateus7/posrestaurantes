import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { recalcularCuenta } from "@/lib/cuentas";
import { agregarItems, emitirPedidoCreado, entregarItems, PedidoError, type ItemCarrito } from "@/lib/pedidos";
import { estadoEntrega, etiquetaConCliente, etiquetaServicio, type TipoServicio } from "@/lib/servicio";

// Pedidos para llevar y a domicilio: los saca caja, sin mesa. Cada uno es una cuenta propia (con el
// consecutivo del dia y los datos del cliente) que se cobra en Caja como cualquier otra.

export class PedidoExternoError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

export type DatosPedidoExterno = {
  tipo: "llevar" | "domicilio";
  clienteNombre: string;
  clienteTelefono?: string;
  direccion?: string;
  costoDomicilio?: number;
  domiciliario?: string;
  notas?: string;
};

// El servidor corre en UTC y el restaurante en Colombia: el consecutivo cambia de dia a medianoche de Colombia.
const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });

const texto = (v?: string) => v?.trim() || null;

const conPlatos = {
  pedidos: {
    orderBy: { creadoEn: "asc" },
    include: { items: { include: { producto: { select: { nombre: true } }, adicionales: { include: { adicional: { select: { nombre: true } } } } } } },
  },
  pagos: { select: { monto: true } },
} as const;

/** Crea la cuenta (con el numero del dia y los datos del cliente) y su primer pedido, todo en una transaccion. */
export async function crearPedidoExterno(restauranteId: string, datos: DatosPedidoExterno, items: ItemCarrito[]) {
  const nombre = datos.clienteNombre?.trim();
  if (!nombre) throw new PedidoExternoError("cliente_requerido", "Falta el nombre del cliente");
  if (datos.tipo === "domicilio" && !datos.direccion?.trim()) throw new PedidoExternoError("direccion_requerida", "Falta la dirección del domicilio");
  const costoDomicilio = datos.tipo === "domicilio" ? Math.round(datos.costoDomicilio ?? 0) : 0;
  if (!(costoDomicilio >= 0)) throw new PedidoExternoError("costo_invalido", "El valor del domicilio no puede ser negativo");
  if (items.length === 0) throw new PedidoError("carrito_vacio", "El pedido no tiene items");

  const dia = formatoDiaBogota.format(new Date());
  const { cuentaId, pedidoId } = await prisma.$transaction(
    async (tx) => {
      // Consecutivo del dia, en una sola sentencia para que dos cajeros a la vez nunca reciban el mismo numero.
      const [{ numero }] = await tx.$queryRaw<{ numero: number }[]>`
        UPDATE "restaurantes"
        SET "contador_pedidos_externos" = CASE WHEN "contador_dia" = ${dia} THEN "contador_pedidos_externos" + 1 ELSE 1 END,
            "contador_dia" = ${dia}
        WHERE "id" = ${restauranteId}
        RETURNING "contador_pedidos_externos" AS numero`;

      const cuenta = await tx.cuenta.create({
        data: {
          restauranteId,
          tipo: datos.tipo,
          numero,
          clienteNombre: nombre,
          clienteTelefono: texto(datos.clienteTelefono),
          direccion: datos.tipo === "domicilio" ? texto(datos.direccion) : null,
          domiciliario: datos.tipo === "domicilio" ? texto(datos.domiciliario) : null,
          notas: texto(datos.notas),
          costoDomicilio,
          estado: "abierta",
        },
      });
      const pedido = await tx.pedido.create({ data: { restauranteId, cuentaId: cuenta.id, origen: "mostrador", estado: "recibido" } });
      await agregarItems(tx, restauranteId, pedido.id, items);
      return { cuentaId: cuenta.id, pedidoId: pedido.id };
    },
    { timeout: 20000 }
  );

  const cuenta = await recalcularCuenta(cuentaId);
  await avisarPedidoNuevo(restauranteId, pedidoId, cuenta);
  return { cuentaId, pedidoId, numero: cuenta.numero! };
}

/** Agrega otro pedido (mas platos) a un pedido para llevar / domicilio que sigue abierto. */
export async function agregarPedidoAExterno(restauranteId: string, cuentaId: string, items: ItemCarrito[]) {
  if (items.length === 0) throw new PedidoError("carrito_vacio", "El pedido no tiene items");
  const existente = await buscarExterno(restauranteId, cuentaId);
  if (existente.estado !== "abierta" && existente.estado !== "dividida") {
    throw new PedidoExternoError("cuenta_cerrada", "Ese pedido ya está cobrado o anulado: crea uno nuevo");
  }

  const pedidoId = await prisma.$transaction(
    async (tx) => {
      const pedido = await tx.pedido.create({ data: { restauranteId, cuentaId, origen: "mostrador", estado: "recibido" } });
      await agregarItems(tx, restauranteId, pedido.id, items);
      return pedido.id;
    },
    { timeout: 20000 }
  );

  const cuenta = await recalcularCuenta(cuentaId);
  await avisarPedidoNuevo(restauranteId, pedidoId, cuenta);
  return { pedidoId };
}

async function avisarPedidoNuevo(
  restauranteId: string,
  pedidoId: string,
  cuenta: { tipo: TipoServicio; numero: number | null; clienteNombre: string | null }
) {
  const pedido = await prisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: { mesa: true, items: { include: { producto: true } } },
  });
  emitirPedidoCreado(restauranteId, pedido, etiquetaConCliente({ ...cuenta, mesaNumero: null }));
}

async function buscarExterno(restauranteId: string, cuentaId: string) {
  const cuenta = await prisma.cuenta.findUnique({ where: { id: cuentaId }, include: conPlatos });
  if (!cuenta || cuenta.restauranteId !== restauranteId || cuenta.tipo === "mesa") throw new PedidoExternoError("pedido_no_existe", "El pedido no existe");
  return cuenta;
}

/** El domiciliario sale con el pedido: solo domicilios y cuando cocina ya termino todo. */
export async function despacharExterno(restauranteId: string, cuentaId: string) {
  const cuenta = await buscarExterno(restauranteId, cuentaId);
  if (cuenta.tipo !== "domicilio") throw new PedidoExternoError("no_es_domicilio", "Solo los domicilios salen con domiciliario");
  if (cuenta.estado === "anulada") throw new PedidoExternoError("anulado", "El pedido está anulado");
  if (cuenta.despachadoEn) throw new PedidoExternoError("ya_despachado", "Ese pedido ya salió");
  const estados = cuenta.pedidos.flatMap((p) => p.items.map((i) => i.estado));
  const estado = estadoEntrega(estados, false);
  if (estado !== "listo") {
    throw new PedidoExternoError("no_esta_listo", estado === "entregado" ? "Ese pedido ya fue entregado" : "Cocina todavía no termina todos los platos");
  }

  await prisma.cuenta.update({ where: { id: cuentaId }, data: { despachadoEn: new Date() } });
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
}

/** Se entrega al cliente (o sale de la puerta en un para llevar): todos los platos listos pasan a entregados. */
export async function entregarExterno(restauranteId: string, cuentaId: string) {
  const cuenta = await buscarExterno(restauranteId, cuentaId);
  if (cuenta.estado === "anulada") throw new PedidoExternoError("anulado", "El pedido está anulado");
  const estados = cuenta.pedidos.flatMap((p) => p.items.map((i) => i.estado));
  const estado = estadoEntrega(estados, !!cuenta.despachadoEn);
  if (estado === "entregado") throw new PedidoExternoError("ya_entregado", "Ese pedido ya fue entregado");
  if (estado === "en_cocina" || estado === "sin_platos") throw new PedidoExternoError("no_esta_listo", "Cocina todavía no termina todos los platos");

  for (const pedido of cuenta.pedidos) {
    if (pedido.items.some((i) => i.estado === "listo")) await entregarItems(restauranteId, pedido.id);
  }
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
}

/**
 * Anula un pedido que todavia no se entrega ni se cobro: los platos pasan a cancelados y se devuelve al
 * inventario lo que cocina aun no habia empezado a preparar (lo que ya estaba en preparacion o listo se
 * hizo de verdad, no se devuelve).
 */
export async function anularExterno(restauranteId: string, cuentaId: string) {
  const cuenta = await prisma.cuenta.findUnique({
    where: { id: cuentaId },
    include: {
      pagos: { select: { monto: true } },
      pedidos: {
        include: {
          items: { include: { producto: { include: { ingredientes: true } }, adicionales: { include: { adicional: true } } } },
        },
      },
    },
  });
  if (!cuenta || cuenta.restauranteId !== restauranteId || cuenta.tipo === "mesa") throw new PedidoExternoError("pedido_no_existe", "El pedido no existe");
  if (cuenta.estado !== "abierta" && cuenta.estado !== "dividida") throw new PedidoExternoError("cuenta_cerrada", "Ese pedido ya está cobrado o anulado");
  if (cuenta.pagos.length > 0) throw new PedidoExternoError("tiene_pagos", "Ya tiene pagos registrados: no se puede anular");
  const items = cuenta.pedidos.flatMap((p) => p.items).filter((i) => i.estado !== "cancelado");
  if (cuenta.despachadoEn || items.some((i) => i.estado === "entregado")) {
    throw new PedidoExternoError("ya_entregado", "Ese pedido ya salió o se entregó: no se puede anular");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const it of items) {
        if (it.estado === "pendiente") {
          const removidos = new Set(it.ingredientesRemovidos as string[]);
          for (const pi of it.producto.ingredientes) {
            if (removidos.has(pi.ingredienteId)) continue;
            await tx.ingrediente.update({ where: { id: pi.ingredienteId }, data: { stockActual: { increment: pi.cantidadUsada.toNumber() * it.cantidad } } });
          }
          for (const ad of it.adicionales) {
            if (ad.adicional.ingredienteId && ad.adicional.cantidadUsada) {
              await tx.ingrediente.update({
                where: { id: ad.adicional.ingredienteId },
                data: { stockActual: { increment: ad.adicional.cantidadUsada.toNumber() * it.cantidad } },
              });
            }
          }
        }
        await tx.itemPedido.update({ where: { id: it.id }, data: { estado: "cancelado" } });
      }
      await tx.pedido.updateMany({ where: { cuentaId }, data: { estado: "cancelado" } });
      await tx.cuenta.update({ where: { id: cuentaId }, data: { estado: "anulada", cerradoEn: new Date() } });
    },
    { timeout: 20000 }
  );

  // Cocina saca de su pantalla los platos cancelados.
  emitirEvento(restauranteId, "item-actualizado", { cuentaId, estado: "cancelado" });
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
}

/** Los pedidos para llevar / domicilio que siguen en marcha: sin entregar todavia, o sin cobrar. */
export async function listarPedidosExternos(restauranteId: string) {
  const cuentas = await prisma.cuenta.findMany({
    where: {
      restauranteId,
      tipo: { in: ["llevar", "domicilio"] },
      OR: [
        { estado: { in: ["abierta", "dividida"] } },
        { pedidos: { some: { items: { some: { estado: { in: ["pendiente", "en_preparacion", "listo"] } } } } } },
      ],
    },
    include: conPlatos,
    orderBy: { creadoEn: "asc" },
  });

  return cuentas.map((c) => {
    const platos = c.pedidos.flatMap((p) => p.items).filter((i) => i.estado !== "cancelado");
    return {
      id: c.id,
      tipo: c.tipo as Exclude<TipoServicio, "mesa">,
      numero: c.numero,
      etiqueta: etiquetaServicio({ tipo: c.tipo, numero: c.numero, mesaNumero: null }),
      clienteNombre: c.clienteNombre,
      clienteTelefono: c.clienteTelefono,
      direccion: c.direccion,
      domiciliario: c.domiciliario,
      notas: c.notas,
      costoDomicilio: c.costoDomicilio,
      subtotal: c.subtotal,
      propina: c.propina,
      total: c.total,
      totalPagado: c.pagos.reduce((acc, p) => acc + p.monto, 0),
      estadoCuenta: c.estado,
      despachadoEn: c.despachadoEn,
      creadoEn: c.creadoEn,
      estadoEntrega: estadoEntrega(platos.map((i) => i.estado), !!c.despachadoEn),
      platos: platos.map((i) => ({
        id: i.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        estado: i.estado,
        adicionales: i.adicionales.map((a) => a.adicional.nombre),
      })),
    };
  });
}

/** Convierte los errores de pedidos (agotado, ya entregado...) en respuesta HTTP; null si es otro tipo de error. */
export function errorDePedido(error: unknown): { status: number; body: { error: string; codigo: string } } | null {
  if (!(error instanceof PedidoExternoError) && !(error instanceof PedidoError)) return null;
  const conflicto = ["producto_agotado", "no_esta_listo", "ya_despachado", "ya_entregado", "cuenta_cerrada", "tiene_pagos", "anulado"];
  const status = error.codigo === "pedido_no_existe" ? 404 : conflicto.includes(error.codigo) ? 409 : 400;
  return { status, body: { error: error.message, codigo: error.codigo } };
}

/** Los platos que llegan del cliente web: cada uno con un producto y una cantidad entera entre 1 y 99. */
export function itemsValidos(items: unknown): items is ItemCarrito[] {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every((it) => typeof it?.productoId === "string" && Number.isInteger(it.cantidad) && it.cantidad >= 1 && it.cantidad <= 99)
  );
}
