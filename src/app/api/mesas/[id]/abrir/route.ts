import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { abrirMesa } from "@/lib/mesas";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin");
    const { id } = await params;
    const mesa = await abrirMesa(user.restauranteId, id, user.usuarioId);
    return NextResponse.json(mesa);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
