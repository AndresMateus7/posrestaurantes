import { NextResponse } from "next/server";
import type { MetodoPago } from "@prisma/client";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { registrarPago } from "@/lib/cuentas";

const METODOS: MetodoPago[] = ["efectivo", "tarjeta_credito", "tarjeta_debito", "nequi", "daviplata", "transferencia"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const body = (await req.json()) as { metodo?: MetodoPago; monto?: number; referenciaTransaccion?: string; subCuentaId?: string };

    if (!body.metodo || !METODOS.includes(body.metodo) || !body.monto) {
      return NextResponse.json({ error: "metodo y monto son requeridos" }, { status: 400 });
    }

    const pago = await registrarPago(
      user.restauranteId,
      id,
      { metodo: body.metodo, monto: body.monto, referenciaTransaccion: body.referenciaTransaccion, subCuentaId: body.subCuentaId },
      user.usuarioId
    );
    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
