import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { crearLlamado } from "@/lib/llamados";

// Version autenticada de POST /api/public/mesas/:token/solicitar-cuenta:
// el mesero la dispara a mano en vez de que el cliente la pida desde su celular.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin");
    const { id } = await params;
    const llamado = await crearLlamado(user.restauranteId, id, "solicitar_cuenta");
    return NextResponse.json(llamado);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
