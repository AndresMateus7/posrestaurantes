import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

async function verificarPropiedad(restauranteId: string, id: string) {
  const ingrediente = await prisma.ingrediente.findUnique({ where: { id } });
  if (!ingrediente || ingrediente.restauranteId !== restauranteId) throw new Error("Ingrediente no existe");
  return ingrediente;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    const body = (await req.json()) as Partial<{ nombre: string; unidadMedida: string; stockMinimo: number; ubicacion: string | null }>;
    const ingrediente = await prisma.ingrediente.update({ where: { id }, data: body });
    return NextResponse.json(ingrediente);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    await prisma.ingrediente.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
