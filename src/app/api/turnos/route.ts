import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { abrirTurno, obtenerTurnoAbierto, resumenTurno } from "@/lib/turnos";

// El turno abierto del usuario actual (o null si debe abrir uno antes de cobrar).
export async function GET() {
  try {
    const user = await requireApiUser("caja", "admin");
    const turno = await obtenerTurnoAbierto(user.restauranteId, user.usuarioId);
    if (!turno) return NextResponse.json(null);
    return NextResponse.json(await resumenTurno(user.restauranteId, turno.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("caja", "admin");
    const body = (await req.json()) as { montoInicial?: number };
    if (body.montoInicial == null || body.montoInicial < 0) {
      return NextResponse.json({ error: "montoInicial es requerido" }, { status: 400 });
    }
    const turno = await abrirTurno(user.restauranteId, user.usuarioId, body.montoInicial);
    return NextResponse.json(turno, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
