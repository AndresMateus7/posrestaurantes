import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

// Solo numero/capacidad -- la forma/posicion vive en el layout del plano
// (PUT /api/plano) y el estado operativo lo cambian las acciones de mesero/
// cliente (abrir, llamados, entrega), no este endpoint.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    const { numero, capacidad } = (await req.json()) as { numero?: string; capacidad?: number };

    const mesa = await prisma.mesa.findUnique({ where: { id } });
    if (!mesa || mesa.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Mesa no existe" }, { status: 404 });
    }

    const actualizada = await prisma.mesa.update({
      where: { id },
      data: {
        ...(numero ? { numero } : {}),
        ...(capacidad ? { capacidad } : {}),
      },
    });
    emitirEvento(user.restauranteId, "mesa-actualizada", { mesaId: id, numero: actualizada.numero, estado: actualizada.estado });
    return NextResponse.json(actualizada);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
