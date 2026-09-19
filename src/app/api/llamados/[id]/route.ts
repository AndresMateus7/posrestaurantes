import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { emitirEvento } from "@/lib/realtime";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const llamado = await prisma.llamadoMesa.findUnique({ where: { id } });
    if (!llamado || llamado.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Llamado no existe" }, { status: 404 });
    }
    await asegurarAccesoMesa(user.restauranteId, user, llamado.mesaId);

    await prisma.llamadoMesa.update({
      where: { id },
      data: { atendido: true, atendidoEn: new Date(), atendidoPor: user.usuarioId },
    });
    emitirEvento(user.restauranteId, "llamado-atendido", { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
