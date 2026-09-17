import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { resumenTurno } from "@/lib/turnos";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;
    const resumen = await resumenTurno(user.restauranteId, id);
    return NextResponse.json(resumen);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
