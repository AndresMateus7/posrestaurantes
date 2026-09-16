import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

// Toggle MANUAL (independiente del stock, ver src/lib/disponibilidad.ts) --
// staff en general puede usarlo (ej. cocina lo apaga si se le acabo algo
// que no se modela como ingrediente todavia), no solo admin.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const { disponible } = (await req.json()) as { disponible?: boolean };
    if (typeof disponible !== "boolean") return NextResponse.json({ error: "disponible debe ser boolean" }, { status: 400 });

    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || producto.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
    }

    const actualizado = await prisma.producto.update({ where: { id }, data: { disponible } });
    emitirEvento(user.restauranteId, "producto-actualizado", { productoId: id, disponible: actualizado.disponible });
    return NextResponse.json(actualizado);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
