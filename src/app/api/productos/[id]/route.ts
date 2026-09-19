import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

async function verificarPropiedad(restauranteId: string, id: string) {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto || producto.restauranteId !== restauranteId) throw new Error("Producto no existe");
  return producto;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    const body = (await req.json()) as Partial<{
      nombre: string;
      descripcion: string;
      precio: number;
      categoriaId: string;
      estacion: "bar" | "parrilla" | "cocina_general";
      tiempoPreparacionMin: number;
      disponible: boolean;
      venderSinStock: boolean;
      imagenUrl: string | null;
    }>;
    const producto = await prisma.producto.update({ where: { id }, data: body });
    emitirEvento(user.restauranteId, "producto-actualizado", { productoId: id });
    return NextResponse.json(producto);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    await prisma.producto.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
