import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

export async function GET() {
  try {
    const user = await requireApiUser();
    const restaurante = await prisma.restaurante.findUnique({ where: { id: user.restauranteId } });
    return NextResponse.json(restaurante);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { rotaQr } = (await req.json()) as { rotaQr?: boolean };
    if (typeof rotaQr !== "boolean") return NextResponse.json({ error: "rotaQr debe ser boolean" }, { status: 400 });

    const restaurante = await prisma.restaurante.update({ where: { id: user.restauranteId }, data: { rotaQr } });
    emitirEvento(user.restauranteId, "restaurante-actualizado", { rotaQr: restaurante.rotaQr });
    return NextResponse.json(restaurante);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
