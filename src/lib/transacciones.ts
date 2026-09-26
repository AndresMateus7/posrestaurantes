import { Prisma } from "@prisma/client";

// Utilidades para operaciones que pueden correr al mismo tiempo (dos cajeros, dos meseros, el cliente
// por QR...). Regla para no bloquearse entre si: dentro de una transaccion se bloquea siempre en este
// orden -> mesa, cuenta, ingredientes (ordenados por id).

export class OcupadoError extends Error {
  codigo = "ocupado";
  constructor() {
    super("Hay muchas operaciones al mismo tiempo: intenta de nuevo");
  }
}

const esConflicto = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";

/**
 * Corre la transaccion y la repite (hasta 4 veces, con una espera corta al azar) si Postgres la
 * cancela por un conflicto de escritura o un bloqueo mutuo. Si aun asi no pasa, lanza OcupadoError.
 */
export async function conReintentos<T>(fn: () => Promise<T>, intentos = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      // P2028: no alcanzo a conseguir conexion o se paso de tiempo. Reintentar solo sumaria carga.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") throw new OcupadoError();
      if (!esConflicto(e)) throw e;
      if (i >= intentos) throw new OcupadoError();
      await new Promise((r) => setTimeout(r, 40 * i + Math.random() * 120));
    }
  }
}

/** Bloquea la fila de la mesa hasta que termine la transaccion (el resto espera su turno). */
export async function bloquearMesa(tx: Prisma.TransactionClient, mesaId: string) {
  await tx.$queryRaw`SELECT "id" FROM "mesas" WHERE "id" = ${mesaId} FOR UPDATE`;
}

/** Bloquea la fila de la cuenta hasta que termine la transaccion. */
export async function bloquearCuenta(tx: Prisma.TransactionClient, cuentaId: string) {
  await tx.$queryRaw`SELECT "id" FROM "cuentas" WHERE "id" = ${cuentaId} FOR UPDATE`;
}
