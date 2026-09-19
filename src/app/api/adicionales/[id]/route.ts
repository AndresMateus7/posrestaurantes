import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

async function verificarPropiedad(restauranteId: string, id: string) {
  const adicional = await prisma.adicional.findUnique({ where: { id } });
  if (!adicional || adicional.restauranteId !== restauranteId) throw new Error("Adicional no existe");
  return adicional;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    const body = (await req.json()) as Partial<{ nombre: string; precio: number; activo: boolean }>;
    if (body.precio !== undefined && (!Number.isInteger(body.precio) || body.precio <= 0)) {
      return NextResponse.json({ error: "El precio debe ser un número entero mayor a 0" }, { status: 400 });
    }
    const adicional = await prisma.adicional.update({ where: { id }, data: body });
    return NextResponse.json(adicional);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    await verificarPropiedad(user.restauranteId, id);
    await prisma.adicional.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
