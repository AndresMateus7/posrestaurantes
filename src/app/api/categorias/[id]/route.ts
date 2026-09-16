import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

async function verificarPropiedad(restauranteId: string, id: string) {
  const categoria = await prisma.categoriaMenu.findUnique({ where: { id } });
  if (!categoria || categoria.restauranteId !== restauranteId) throw new Error("Categoría no existe");
  return categoria;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    const body = (await req.json()) as Partial<{ nombre: string; descripcion: string; orden: number; activo: boolean; imagenUrl: string }>;
    const categoria = await prisma.categoriaMenu.update({ where: { id }, data: body });
    return NextResponse.json(categoria);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    await prisma.categoriaMenu.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
