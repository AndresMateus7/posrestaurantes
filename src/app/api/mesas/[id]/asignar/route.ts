import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

// Caja/admin ponen, cambian o quitan el mesero de una mesa que ya esta abierta.
// Desde ese momento el mesero elegido la ve y la opera como si la hubiera
// abierto el (pedidos, cuenta, llamados) y los demas meseros dejan de verla.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin", "caja");
    const { id } = await params;
    const { meseroId } = (await req.json()) as { meseroId?: string | null };
    if (meseroId === undefined) {
      return NextResponse.json({ error: "meseroId es requerido (o null para dejarla sin mesero)" }, { status: 400 });
    }

    const mesa = await prisma.mesa.findUnique({ where: { id } });
    if (!mesa || mesa.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Mesa no existe" }, { status: 404 });
    }
    if (mesa.estado === "libre" || mesa.estado === "reservada") {
      return NextResponse.json({ error: "La mesa no está abierta: ábrela primero" }, { status: 409 });
    }

    if (meseroId) {
      const mesero = await prisma.usuario.findUnique({ where: { id: meseroId } });
      if (!mesero || mesero.restauranteId !== user.restauranteId || mesero.rol !== "mesero" || !mesero.activo) {
        return NextResponse.json({ error: "Ese mesero no existe o está inactivo" }, { status: 400 });
      }
    }

    const actualizada = await prisma.mesa.update({
      where: { id },
      data: { meseroId: meseroId ?? null },
      include: { mesero: { select: { nombre: true } } },
    });
    // meseroId en el evento: el mesero asignado recibe el aviso "te asignaron la mesa X".
    emitirEvento(user.restauranteId, "mesa-actualizada", {
      mesaId: id,
      numero: actualizada.numero,
      estado: actualizada.estado,
      meseroId: actualizada.meseroId,
    });
    return NextResponse.json(actualizada);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
