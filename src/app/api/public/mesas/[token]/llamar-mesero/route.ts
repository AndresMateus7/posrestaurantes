import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearLlamado } from "@/lib/llamados";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mesa = await prisma.mesa.findUnique({ where: { qrToken: token } });
  if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

  // El cuerpo es opcional: clientes viejos (con la pagina en cache) llaman sin comentario.
  const { comentario } = (await req.json().catch(() => ({}))) as { comentario?: unknown };

  await crearLlamado(mesa.restauranteId, mesa.id, "llamar_mesero", typeof comentario === "string" ? comentario : null);
  return NextResponse.json({ ok: true });
}
