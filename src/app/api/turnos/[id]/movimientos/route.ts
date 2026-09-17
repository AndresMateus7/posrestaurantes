import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { registrarMovimientoCaja } from "@/lib/turnos";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const body = (await req.json()) as { tipo?: "retiro" | "ingreso_manual"; monto?: number; descripcion?: string };

    if (body.tipo !== "retiro" && body.tipo !== "ingreso_manual") {
      return NextResponse.json({ error: "tipo invalido" }, { status: 400 });
    }
    if (!body.monto || body.monto <= 0) {
      return NextResponse.json({ error: "monto debe ser mayor a 0" }, { status: 400 });
    }

    const movimiento = await registrarMovimientoCaja(user.restauranteId, id, body.tipo, body.monto, body.descripcion);
    return NextResponse.json(movimiento, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
