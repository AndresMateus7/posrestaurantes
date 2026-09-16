import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const categorias = await prisma.categoriaMenu.findMany({
      where: { restauranteId: user.restauranteId },
      orderBy: { orden: "asc" },
    });
    return NextResponse.json(categorias);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { nombre, descripcion, orden } = (await req.json()) as { nombre?: string; descripcion?: string; orden?: number };
    if (!nombre) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 });

    const categoria = await prisma.categoriaMenu.create({
      data: { restauranteId: user.restauranteId, nombre, descripcion, orden: orden ?? 0 },
    });
    return NextResponse.json(categoria, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
