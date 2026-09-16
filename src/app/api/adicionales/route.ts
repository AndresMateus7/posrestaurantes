import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const adicionales = await prisma.adicional.findMany({
      where: { restauranteId: user.restauranteId },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json(adicionales);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { nombre, precio, ingredienteId, cantidadUsada } = (await req.json()) as {
      nombre?: string;
      precio?: number;
      ingredienteId?: string;
      cantidadUsada?: number;
    };
    if (!nombre || typeof precio !== "number") {
      return NextResponse.json({ error: "nombre y precio son requeridos" }, { status: 400 });
    }

    const adicional = await prisma.adicional.create({
      data: { restauranteId: user.restauranteId, nombre, precio, ingredienteId, cantidadUsada },
    });
    return NextResponse.json(adicional, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
