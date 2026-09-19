import { NextResponse } from "next/server";
import { obtenerMenuPublico } from "@/lib/solicitudes";

// Menu del link publico de pedidos (/pedir/<slug>): sin sesion. Solo trae lo que el cliente puede ver.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
  return NextResponse.json(menu);
}
