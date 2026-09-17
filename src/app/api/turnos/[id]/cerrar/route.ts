import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { cerrarTurno } from "@/lib/turnos";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const body = (await req.json()) as { montoFinalDeclarado?: number };
    if (body.montoFinalDeclarado == null || body.montoFinalDeclarado < 0) {
      return NextResponse.json({ error: "montoFinalDeclarado es requerido" }, { status: 400 });
    }
    const turno = await cerrarTurno(user.restauranteId, id, body.montoFinalDeclarado);
    return NextResponse.json(turno);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
