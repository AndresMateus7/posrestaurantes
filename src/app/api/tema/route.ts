import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

export async function GET() {
  try {
    const user = await requireApiUser();
    const tema = await prisma.configuracionTema.findUnique({ where: { restauranteId: user.restauranteId } });
    return NextResponse.json(tema);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

type Body = Partial<{
  logoUrl: string;
  faviconUrl: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  fuente: string;
}>;

export async function PUT(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const body = (await req.json()) as Body;
    const tema = await prisma.configuracionTema.update({
      where: { restauranteId: user.restauranteId },
      data: body,
    });
    emitirEvento(user.restauranteId, "tema-actualizado", tema);
    return NextResponse.json(tema);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
