import type { MetodoPago, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { resolverLlamadosDeMesa } from "@/lib/llamados";
import { bloquearCuenta, bloquearMesa, conReintentos } from "@/lib/transacciones";

export class CuentaError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");

/** Reutiliza la cuenta abierta (o dividida, aun sin pagar) de la mesa si existe, o crea una nueva. */
export async function obtenerOCrearCuentaAbierta(restauranteId: string, mesaId: string) {
  return conReintentos(() =>
    prisma.$transaction(async (tx) => {
      await bloquearMesa(tx, mesaId);
      const existente = await tx.cuenta.findFirst({ where: { mesaId, estado: { in: ["abierta", "dividida"] } } });
      return existente ?? tx.cuenta.create({ data: { restauranteId, mesaId, estado: "abierta" } });
    })
  );
}

/**
 * Recalcula subtotal/total con los platos (no cancelados) y adicionales de la cuenta, en UNA sentencia
 * dentro de la transaccion que llama: asi el total nunca queda con una foto vieja aunque lleguen varios
 * pedidos a la vez. La transaccion debe tener la cuenta bloqueada (o recien creada).
 */
export async function recalcularCuentaTx(tx: Prisma.TransactionClient, cuentaId: string) {
  await tx.$executeRaw`
    UPDATE "cuentas" c
    SET "subtotal" = s.v, "total" = s.v + c."propina" + c."costo_domicilio"
    FROM (
      SELECT COALESCE(SUM(i."precio_unitario" * i."cantidad" + COALESCE(ad.v, 0)), 0)::int AS v
      FROM "items_pedido" i
      JOIN "pedidos" p ON p."id" = i."pedido_id"
      LEFT JOIN (
        SELECT "item_pedido_id", SUM("precio_unitario" * "cantidad") AS v FROM "item_pedido_adicionales" GROUP BY 1
      ) ad ON ad."item_pedido_id" = i."id"
      WHERE p."cuenta_id" = ${cuentaId} AND i."estado" <> 'cancelado'
    ) s
    WHERE c."id" = ${cuentaId}`;
  return tx.cuenta.findUniqueOrThrow({ where: { id: cuentaId } });
}

/** Recalcula subtotal/total sumando todos los pedidos ligados a la cuenta. */
export async function recalcularCuenta(cuentaId: string) {
  const actualizada = await conReintentos(() =>
    prisma.$transaction(async (tx) => {
      await bloquearCuenta(tx, cuentaId);
      return recalcularCuentaTx(tx, cuentaId);
    })
  );
  emitirEvento(actualizada.restauranteId, "cuenta-actualizada", { cuentaId });
  return actualizada;
}

type AsignacionPorItems = { etiqueta: string; itemPedidoId: string; cantidad: number }[];

export async function dividirCuenta(
  restauranteId: string,
  cuentaId: string,
  payload: { tipo: "partes_iguales"; numeroPartes: number } | { tipo: "por_items"; asignaciones: AsignacionPorItems }
) {
  const cuenta = await prisma.cuenta.findUnique({ where: { id: cuentaId } });
  if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");

  await prisma.subCuenta.deleteMany({ where: { cuentaId } });

  if (payload.tipo === "partes_iguales") {
    if (payload.numeroPartes < 1) throw new CuentaError("partes_invalidas", "numeroPartes debe ser >= 1");
    // La ultima persona absorbe lo que sobra del redondeo: las partes suman exactamente
    // el total (si no, ej. $25.000 entre 3 dejaba $1 sin cubrir y la cuenta no se podia cerrar).
    const montoPorParte = Math.floor(cuenta.total / payload.numeroPartes);
    const resto = cuenta.total - montoPorParte * payload.numeroPartes;
    await prisma.subCuenta.createMany({
      data: Array.from({ length: payload.numeroPartes }, (_, i) => ({
        cuentaId,
        tipoDivision: "partes_iguales" as const,
        etiqueta: `Persona ${i + 1}`,
        monto: i === payload.numeroPartes - 1 ? montoPorParte + resto : montoPorParte,
      })),
    });
  } else {
    const itemsPedidoIds = [...new Set(payload.asignaciones.map((a) => a.itemPedidoId))];
    // Se restringe a items de ESTA cuenta -- evita que se asignen items de otra
    // cuenta/restaurante (el id llega del cliente).
    const items = await prisma.itemPedido.findMany({ where: { id: { in: itemsPedidoIds }, pedido: { cuentaId } }, include: { adicionales: true } });
    const porEtiqueta = new Map<string, { monto: number; asignaciones: { itemPedidoId: string; cantidad: number }[] }>();
    const asignadoPorItem = new Map<string, number>();

    for (const asign of payload.asignaciones) {
      const item = items.find((i) => i.id === asign.itemPedidoId);
      if (!item) throw new CuentaError("item_no_existe", `Item ${asign.itemPedidoId} no existe en esta cuenta`);
      if (asign.cantidad <= 0) continue;

      const yaAsignado = asignadoPorItem.get(item.id) ?? 0;
      if (yaAsignado + asign.cantidad > item.cantidad) {
        throw new CuentaError("cantidad_excedida", `Se asigno mas cantidad de "${item.id}" de la pedida`);
      }
      asignadoPorItem.set(item.id, yaAsignado + asign.cantidad);

      const extraUnitario = item.adicionales.reduce((a, ad) => a + (ad.precioUnitario * ad.cantidad) / item.cantidad, 0);
      const monto = Math.round((item.precioUnitario + extraUnitario) * asign.cantidad);
      const actual = porEtiqueta.get(asign.etiqueta) ?? { monto: 0, asignaciones: [] };
      actual.monto += monto;
      actual.asignaciones.push({ itemPedidoId: asign.itemPedidoId, cantidad: asign.cantidad });
      porEtiqueta.set(asign.etiqueta, actual);
    }

    for (const [etiqueta, { monto, asignaciones }] of porEtiqueta) {
      const subCuenta = await prisma.subCuenta.create({ data: { cuentaId, tipoDivision: "por_items", etiqueta, monto } });
      await prisma.subCuentaItem.createMany({
        data: asignaciones.map((a) => ({ subCuentaId: subCuenta.id, itemPedidoId: a.itemPedidoId, cantidadAsignada: a.cantidad })),
      });
    }
  }

  await prisma.cuenta.update({ where: { id: cuentaId }, data: { estado: "dividida" } });
  const subCuentas = await prisma.subCuenta.findMany({ where: { cuentaId } });
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  return subCuentas;
}

export async function registrarPropina(restauranteId: string, cuentaId: string, valor: { monto?: number; porcentaje?: number }) {
  const actualizada = await conReintentos(() =>
    prisma.$transaction(async (tx) => {
      await bloquearCuenta(tx, cuentaId);
      const cuenta = await tx.cuenta.findUnique({ where: { id: cuentaId } });
      if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");
      if (cuenta.estado === "pagada" || cuenta.estado === "anulada") throw new CuentaError("cuenta_cerrada", "La cuenta ya está cerrada");
      const propina = valor.porcentaje != null ? Math.round(cuenta.subtotal * (valor.porcentaje / 100)) : Math.round(valor.monto ?? 0);
      if (!(propina >= 0)) throw new CuentaError("propina_invalida", "La propina no puede ser negativa");
      return tx.cuenta.update({ where: { id: cuentaId }, data: { propina, total: cuenta.subtotal + propina + cuenta.costoDomicilio } });
    })
  );
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  return actualizada;
}

/**
 * Registra un pago con la cuenta bloqueada: dos cajeros (o un doble clic) sobre la misma cuenta se
 * atienden uno detras del otro, y el segundo ve lo que ya se pago. No se acepta pagar una cuenta
 * cerrada, pagar mas de lo que falta (de la cuenta o de la parte dividida) ni cobrar sin turno abierto:
 * todo pago debe quedar en un turno para que el arqueo lo cuente.
 */
export async function registrarPago(
  restauranteId: string,
  cuentaId: string,
  data: { metodo: MetodoPago; monto: number; referenciaTransaccion?: string; subCuentaId?: string },
  usuarioId: string
) {
  const monto = Math.round(data.monto);
  if (!(monto > 0)) throw new CuentaError("monto_invalido", "El monto debe ser mayor a 0");

  const turno = await prisma.turnoCaja.findFirst({ where: { restauranteId, usuarioId, estado: "abierto" } });
  if (!turno) throw new CuentaError("sin_turno", "Abre tu turno de caja antes de cobrar");

  const pago = await conReintentos(() =>
    prisma.$transaction(async (tx) => {
      await bloquearCuenta(tx, cuentaId);
      const cuenta = await tx.cuenta.findUnique({ where: { id: cuentaId }, include: { pagos: { select: { monto: true, subCuentaId: true } } } });
      if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");
      if (cuenta.estado === "pagada") throw new CuentaError("cuenta_pagada", "Esta cuenta ya está cobrada");
      if (cuenta.estado === "anulada") throw new CuentaError("cuenta_anulada", "La cuenta está anulada");

      const pendiente = cuenta.total - cuenta.pagos.reduce((a, p) => a + p.monto, 0);
      if (pendiente <= 0) throw new CuentaError("cuenta_saldada", "Esta cuenta ya está saldada");
      if (monto > pendiente) throw new CuentaError("pago_excede", `El pago supera lo que falta por cobrar (${formatoCOP(pendiente)})`);

      let subCuentaSaldada = false;
      if (data.subCuentaId) {
        const sub = await tx.subCuenta.findUnique({ where: { id: data.subCuentaId } });
        if (!sub || sub.cuentaId !== cuentaId) throw new CuentaError("subcuenta_no_existe", "Esa parte no pertenece a la cuenta");
        const faltaSub = sub.monto - cuenta.pagos.filter((p) => p.subCuentaId === sub.id).reduce((a, p) => a + p.monto, 0);
        if (faltaSub <= 0) throw new CuentaError("subcuenta_pagada", `${sub.etiqueta} ya pagó su parte`);
        if (monto > faltaSub) throw new CuentaError("pago_excede", `El pago supera lo que le falta a ${sub.etiqueta} (${formatoCOP(faltaSub)})`);
        subCuentaSaldada = monto === faltaSub;
      }

      const creado = await tx.pago.create({
        data: {
          cuentaId,
          subCuentaId: data.subCuentaId,
          metodo: data.metodo,
          monto,
          referenciaTransaccion: data.referenciaTransaccion,
          recibidoPor: usuarioId,
          turnoId: turno.id,
        },
      });
      if (subCuentaSaldada) await tx.subCuenta.update({ where: { id: data.subCuentaId }, data: { pagado: true } });
      return creado;
    })
  );

  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  return pago;
}

/**
 * Cierra la cuenta ya pagada y libera la mesa. Bloquea mesa y cuenta (en ese orden, igual que al crear un
 * pedido) y recalcula el total con los platos reales: si justo entro un pedido, el cierre ve que falta
 * cobrarlo y no cierra; si el pedido llega despues, encuentra la cuenta cerrada y abre una nueva.
 */
export async function cerrarCuenta(restauranteId: string, cuentaId: string) {
  const previa = await prisma.cuenta.findUnique({ where: { id: cuentaId }, select: { restauranteId: true, mesaId: true } });
  if (!previa || previa.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");
  const { mesaId } = previa;

  const cerrada = await conReintentos(() =>
    prisma.$transaction(async (tx) => {
      if (mesaId) await bloquearMesa(tx, mesaId);
      await bloquearCuenta(tx, cuentaId);
      const actual = await tx.cuenta.findUniqueOrThrow({ where: { id: cuentaId }, select: { estado: true } });
      // Si ya estaba cerrada no se vuelve a liberar la mesa: podria tener clientes nuevos.
      if (actual.estado === "pagada") return false;
      if (actual.estado === "anulada") throw new CuentaError("cuenta_anulada", "La cuenta está anulada");

      const cuenta = await recalcularCuentaTx(tx, cuentaId);
      const pagado = (await tx.pago.aggregate({ where: { cuentaId }, _sum: { monto: true } }))._sum.monto ?? 0;
      if (pagado < cuenta.total) throw new CuentaError("pago_incompleto", `Faltan ${formatoCOP(cuenta.total - pagado)} por pagar`);

      await tx.cuenta.update({ where: { id: cuentaId }, data: { estado: "pagada", cerradoEn: new Date() } });
      // Al liberar la mesa tambien se libera al mesero: la siguiente ocupacion
      // la asigna quien la abra (ver src/lib/mesas.ts). Los pedidos para llevar /
      // domicilio no tienen mesa.
      if (mesaId) await tx.mesa.update({ where: { id: mesaId }, data: { estado: "libre", meseroId: null } });
      return true;
    })
  );
  if (!cerrada) return;

  if (mesaId) {
    // Ya cobrada: los "Piden la cuenta"/"Llaman al mesero" de esa mesa dejan de estar pendientes.
    await resolverLlamadosDeMesa(restauranteId, mesaId);
    emitirEvento(restauranteId, "mesa-actualizada", { mesaId, estado: "libre" });
  }
  emitirEvento(restauranteId, "cuenta-cerrada", { cuentaId, mesaId });
}
