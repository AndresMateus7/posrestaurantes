import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

type LineaReceta = { ingredienteId: string; cantidadUsada: number; removible?: boolean };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || producto.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
    }
    const receta = await prisma.productoIngrediente.findMany({ where: { productoId: id }, include: { ingrediente: true } });
    return NextResponse.json(receta);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Reemplaza la receta completa (mismo patron que PUT /api/plano: el admin
// mantiene la lista en el cliente y manda el array entero al guardar).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    const { receta } = (await req.json()) as { receta?: LineaReceta[] };
    if (!Array.isArray(receta)) return NextResponse.json({ error: "receta debe ser un array" }, { status: 400 });

    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || producto.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.productoIngrediente.deleteMany({ where: { productoId: id } }),
      prisma.productoIngrediente.createMany({
        data: receta.map((r) => ({
          productoId: id,
          ingredienteId: r.ingredienteId,
          cantidadUsada: r.cantidadUsada,
          removible: r.removible ?? true,
        })),
      }),
    ]);

    emitirEvento(user.restauranteId, "producto-actualizado", { productoId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
