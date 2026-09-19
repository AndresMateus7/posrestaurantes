import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { marcarPedidoEntregado } from "@/lib/pedidos";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { id } = await params;

    // Un mesero solo entrega pedidos de sus mesas.
    const pedido = await prisma.pedido.findUnique({ where: { id }, select: { mesaId: true, restauranteId: true } });
    if (!pedido || pedido.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Pedido no existe" }, { status: 404 });
    }
    await asegurarAccesoMesa(user.restauranteId, user, pedido.mesaId);

    await marcarPedidoEntregado(user.restauranteId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
