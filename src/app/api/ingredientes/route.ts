import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const ingredientes = await prisma.ingrediente.findMany({
      where: { restauranteId: user.restauranteId },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json(ingredientes);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { nombre, unidadMedida, stockActual, stockMinimo } = (await req.json()) as {
      nombre?: string;
      unidadMedida?: string;
      stockActual?: number;
      stockMinimo?: number;
    };
    if (!nombre) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 });

    const ingrediente = await prisma.ingrediente.create({
      data: {
        restauranteId: user.restauranteId,
        nombre,
        unidadMedida: unidadMedida ?? "g",
        stockActual: stockActual ?? 0,
        stockMinimo: stockMinimo ?? 0,
      },
    });
    return NextResponse.json(ingrediente, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
