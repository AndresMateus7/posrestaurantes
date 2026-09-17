import { prisma } from "@/lib/prisma";

export class TurnoError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

export async function obtenerTurnoAbierto(restauranteId: string, usuarioId: string) {
  return prisma.turnoCaja.findFirst({ where: { restauranteId, usuarioId, estado: "abierto" } });
}

export async function abrirTurno(restauranteId: string, usuarioId: string, montoInicial: number) {
  const existente = await obtenerTurnoAbierto(restauranteId, usuarioId);
  if (existente) throw new TurnoError("turno_ya_abierto", "Ya tienes un turno de caja abierto");
  return prisma.turnoCaja.create({ data: { restauranteId, usuarioId, montoInicial: Math.round(montoInicial) } });
}

export async function registrarMovimientoCaja(
  restauranteId: string,
  turnoId: string,
  tipo: "retiro" | "ingreso_manual",
  monto: number,
  descripcion?: string
) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } });
  if (!turno || turno.restauranteId !== restauranteId) throw new TurnoError("turno_no_existe", "Turno no existe");
  if (turno.estado !== "abierto") throw new TurnoError("turno_cerrado", "El turno ya esta cerrado");
  if (monto <= 0) throw new TurnoError("monto_invalido", "El monto debe ser mayor a 0");

  return prisma.movimientoCaja.create({ data: { turnoId, tipo, monto: Math.round(monto), descripcion } });
}

/** Calcula cuanto efectivo deberia haber en caja segun el sistema (sin cerrar el turno). */
export async function calcularMontoSistema(turnoId: string) {
  const turno = await prisma.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } });

  const pagosEfectivo = await prisma.pago.aggregate({
    where: { turnoId, metodo: "efectivo" },
    _sum: { monto: true },
  });
  const movimientos = await prisma.movimientoCaja.findMany({ where: { turnoId } });
  const ingresos = movimientos.filter((m) => m.tipo === "ingreso_manual").reduce((a, m) => a + m.monto, 0);
  const retiros = movimientos.filter((m) => m.tipo === "retiro").reduce((a, m) => a + m.monto, 0);

  return turno.montoInicial + (pagosEfectivo._sum.monto ?? 0) + ingresos - retiros;
}

export async function cerrarTurno(restauranteId: string, turnoId: string, montoFinalDeclarado: number) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } });
  if (!turno || turno.restauranteId !== restauranteId) throw new TurnoError("turno_no_existe", "Turno no existe");
  if (turno.estado !== "abierto") throw new TurnoError("turno_cerrado", "El turno ya esta cerrado");

  const montoFinalSistema = await calcularMontoSistema(turnoId);
  const declarado = Math.round(montoFinalDeclarado);
  const diferencia = declarado - montoFinalSistema;

  return prisma.turnoCaja.update({
    where: { id: turnoId },
    data: {
      estado: "cerrado",
      montoFinalDeclarado: declarado,
      montoFinalSistema,
      diferencia,
      cerradoEn: new Date(),
    },
  });
}

export async function resumenTurno(restauranteId: string, turnoId: string) {
  const turno = await prisma.turnoCaja.findUnique({
    where: { id: turnoId },
    include: { movimientos: true, pagos: true, usuario: { select: { nombre: true } } },
  });
  if (!turno || turno.restauranteId !== restauranteId) throw new TurnoError("turno_no_existe", "Turno no existe");

  const porMetodo = turno.pagos.reduce<Record<string, number>>((acc, p) => {
    acc[p.metodo] = (acc[p.metodo] ?? 0) + p.monto;
    return acc;
  }, {});

  return {
    ...turno,
    totalPagos: turno.pagos.reduce((a, p) => a + p.monto, 0),
    pagosPorMetodo: porMetodo,
    montoSistemaActual: turno.estado === "abierto" ? await calcularMontoSistema(turnoId) : turno.montoFinalSistema,
  };
}
