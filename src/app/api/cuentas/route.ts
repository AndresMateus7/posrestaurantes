import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

// Lista las cuentas activas (abiertas o divididas, aun sin pagar) del
// restaurante -- es la pantalla principal de caja: que mesas tienen cuenta
// pendiente de cobro ahora mismo.
export async function GET() {
  try {
    const user = await requireApiUser("caja", "admin");

    const cuentas = await prisma.cuenta.findMany({
      where: { restauranteId: user.restauranteId, estado: { in: ["abierta", "dividida"] } },
      include: {
        mesa: { select: { id: true, numero: true } },
        pagos: { select: { monto: true } },
      },
      orderBy: { creadoEn: "asc" },
    });

    return NextResponse.json(
      cuentas.map((c) => ({
        id: c.id,
        mesaId: c.mesa.id,
        mesaNumero: c.mesa.numero,
        estado: c.estado,
        subtotal: c.subtotal,
        propina: c.propina,
        total: c.total,
        totalPagado: c.pagos.reduce((a, p) => a + p.monto, 0),
        creadoEn: c.creadoEn,
      }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
