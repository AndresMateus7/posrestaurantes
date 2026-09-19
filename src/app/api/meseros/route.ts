import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

// Meseros activos, para que caja/admin puedan asignarle uno a una mesa abierta.
export async function GET() {
  try {
    const user = await requireApiUser("admin", "caja");
    const meseros = await prisma.usuario.findMany({
      where: { restauranteId: user.restauranteId, rol: "mesero", activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json(meseros);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
