import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { detalleArqueo, errorDeArqueo } from "@/lib/arqueos";

// Informe de un conteo, solo para el administrador: como estaba el inventario cuando se conto, lo
// contado, la diferencia y como esta ahora.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    return NextResponse.json(await detalleArqueo(user.restauranteId, id));
  } catch (error) {
    const conocido = errorDeArqueo(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
