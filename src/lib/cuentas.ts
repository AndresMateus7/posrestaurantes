import type { MetodoPago } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { resolverLlamadosDeMesa } from "@/lib/llamados";

export class CuentaError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

/** Reutiliza la cuenta abierta (o dividida, aun sin pagar) de la mesa si existe, o crea una nueva. */
export async function obtenerOCrearCuentaAbierta(restauranteId: string, mesaId: string) {
  const existente = await prisma.cuenta.findFirst({ where: { mesaId, estado: { in: ["abierta", "dividida"] } } });
  if (existente) return existente;
  return prisma.cuenta.create({ data: { restauranteId, mesaId, estado: "abierta" } });
}

/** Recalcula subtotal/total sumando todos los pedidos ligados a la cuenta. */
export async function recalcularCuenta(cuentaId: string) {
  const cuenta = await prisma.cuenta.findUniqueOrThrow({ where: { id: cuentaId } });
  const items = await prisma.itemPedido.findMany({
    where: { pedido: { cuentaId } },
    include: { adicionales: true },
  });
  const subtotal = items.reduce((acc, it) => {
    const extras = it.adicionales.reduce((a, ad) => a + ad.precioUnitario * ad.cantidad, 0);
    return acc + it.precioUnitario * it.cantidad + extras;
  }, 0);
  const total = subtotal + cuenta.propina;
  const actualizada = await prisma.cuenta.update({ where: { id: cuentaId }, data: { subtotal, total } });
  emitirEvento(cuenta.restauranteId, "cuenta-actualizada", { cuentaId });
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
  const cuenta = await prisma.cuenta.findUnique({ where: { id: cuentaId } });
  if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");

  const propina = valor.porcentaje != null ? Math.round(cuenta.subtotal * (valor.porcentaje / 100)) : Math.round(valor.monto ?? 0);
  const actualizada = await prisma.cuenta.update({ where: { id: cuentaId }, data: { propina, total: cuenta.subtotal + propina } });
  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  return actualizada;
}

export async function registrarPago(
  restauranteId: string,
  cuentaId: string,
  data: { metodo: MetodoPago; monto: number; referenciaTransaccion?: string; subCuentaId?: string },
  usuarioId: string
) {
  const cuenta = await prisma.cuenta.findUnique({ where: { id: cuentaId } });
  if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");
  if (data.monto <= 0) throw new CuentaError("monto_invalido", "El monto debe ser mayor a 0");

  const turno = await prisma.turnoCaja.findFirst({ where: { restauranteId, usuarioId, estado: "abierto" } });

  const pago = await prisma.pago.create({
    data: {
      cuentaId,
      subCuentaId: data.subCuentaId,
      metodo: data.metodo,
      monto: data.monto,
      referenciaTransaccion: data.referenciaTransaccion,
      recibidoPor: usuarioId,
      turnoId: turno?.id,
    },
  });

  if (data.subCuentaId) {
    const subCuenta = await prisma.subCuenta.findUnique({ where: { id: data.subCuentaId } });
    const pagosSubCuenta = await prisma.pago.aggregate({ where: { subCuentaId: data.subCuentaId }, _sum: { monto: true } });
    if (subCuenta && (pagosSubCuenta._sum.monto ?? 0) >= subCuenta.monto) {
      await prisma.subCuenta.update({ where: { id: data.subCuentaId }, data: { pagado: true } });
    }
  }

  emitirEvento(restauranteId, "cuenta-actualizada", { cuentaId });
  return pago;
}

export async function cerrarCuenta(restauranteId: string, cuentaId: string) {
  const cuenta = await prisma.cuenta.findUnique({ where: { id: cuentaId }, include: { pagos: true } });
  if (!cuenta || cuenta.restauranteId !== restauranteId) throw new CuentaError("cuenta_no_existe", "Cuenta no existe");
  // Si ya estaba cerrada no se vuelve a liberar la mesa: podria tener clientes nuevos.
  if (cuenta.estado === "pagada") return;
  if (cuenta.estado === "anulada") throw new CuentaError("cuenta_anulada", "La cuenta está anulada");

  const totalPagado = cuenta.pagos.reduce((acc, p) => acc + p.monto, 0);
  if (totalPagado < cuenta.total) {
    throw new CuentaError("pago_incompleto", `Faltan ${cuenta.total - totalPagado} por pagar`);
  }

  await prisma.$transaction([
    prisma.cuenta.update({ where: { id: cuentaId }, data: { estado: "pagada", cerradoEn: new Date() } }),
    // Al liberar la mesa tambien se libera al mesero: la siguiente ocupacion
    // la asigna quien la abra (ver src/lib/mesas.ts).
    prisma.mesa.update({ where: { id: cuenta.mesaId }, data: { estado: "libre", meseroId: null } }),
  ]);
  // Ya cobrada: los "Piden la cuenta"/"Llaman al mesero" de esa mesa dejan de estar pendientes.
  await resolverLlamadosDeMesa(restauranteId, cuenta.mesaId);

  emitirEvento(restauranteId, "mesa-actualizada", { mesaId: cuenta.mesaId, estado: "libre" });
  emitirEvento(restauranteId, "cuenta-cerrada", { cuentaId, mesaId: cuenta.mesaId });
}
