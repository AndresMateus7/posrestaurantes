import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearLlamado } from "@/lib/llamados";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mesa = await prisma.mesa.findUnique({ where: { qrToken: token } });
  if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

  await crearLlamado(mesa.restauranteId, mesa.id, "llamar_mesero");
  return NextResponse.json({ ok: true });
}
