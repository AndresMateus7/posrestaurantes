import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const llamados = await prisma.llamadoMesa.findMany({
      where: { restauranteId: user.restauranteId, atendido: false },
      include: { mesa: true },
      orderBy: { creadoEn: "desc" },
    });
    return NextResponse.json(
      llamados.map((l) => ({ id: l.id, tipo: l.tipo, mesaNumero: l.mesa.numero, creadoEn: l.creadoEn }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
