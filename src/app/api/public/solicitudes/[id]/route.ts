import { NextResponse } from "next/server";
import { excedeLimite, ipDe } from "@/lib/limite";
import { estadoPublicoSolicitud } from "@/lib/solicitudes";

// Seguimiento del pedido que mando un cliente por el link: el id es un UUID (imposible de adivinar)
// y solo devuelve el estado, sin datos de contacto.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = ipDe(req);
  if (ip && excedeLimite(`seguimiento:${ip}`, 120, 60_000)) return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
  const { id } = await params;
  const estado = await estadoPublicoSolicitud(id).catch(() => null);
  if (!estado) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  return NextResponse.json(estado);
}
