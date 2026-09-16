import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const mesas = await prisma.mesa.findMany({
      where: { restauranteId: user.restauranteId },
      // orden de creacion, no por "numero" (es texto libre -- "10" ordenaria
      // antes que "2" alfabeticamente; ver comentario en schema.sql).
      orderBy: { creadoEn: "asc" },
    });
    return NextResponse.json(mesas);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
