import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { crearLlamado } from "@/lib/llamados";

// Version autenticada de POST /api/public/mesas/:token/solicitar-cuenta:
// el mesero la dispara a mano en vez de que el cliente la pida desde su celular.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { id } = await params;
    await asegurarAccesoMesa(user.restauranteId, user, id);
    const llamado = await crearLlamado(user.restauranteId, id, "solicitar_cuenta");
    return NextResponse.json(llamado);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
