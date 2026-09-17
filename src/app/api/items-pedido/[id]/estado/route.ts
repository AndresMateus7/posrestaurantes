import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { actualizarEstadoItem } from "@/lib/pedidos";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("cocina", "admin", "caja");
    const { id } = await params;
    const { estado } = (await req.json()) as { estado?: "en_preparacion" | "listo" };
    if (estado !== "en_preparacion" && estado !== "listo") {
      return NextResponse.json({ error: "estado invalido" }, { status: 400 });
    }
    await actualizarEstadoItem(user.restauranteId, id, estado);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
