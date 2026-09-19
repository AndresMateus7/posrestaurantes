import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { entregarItems, PedidoError } from "@/lib/pedidos";

// El mesero entrega platos a la mesa. Sin cuerpo entrega todo lo que esta listo
// del pedido; con { itemIds: [...] } entrega solo esos platos (uno por uno).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as { itemIds?: unknown };
    let itemIds: string[] | undefined;
    if (body.itemIds !== undefined) {
      if (!Array.isArray(body.itemIds) || !body.itemIds.every((x) => typeof x === "string")) {
        return NextResponse.json({ error: "itemIds debe ser una lista de ids" }, { status: 400 });
      }
      itemIds = body.itemIds;
    }

    // Un mesero solo entrega pedidos de sus mesas.
    const pedido = await prisma.pedido.findUnique({ where: { id }, select: { mesaId: true, restauranteId: true } });
    if (!pedido || pedido.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Pedido no existe" }, { status: 404 });
    }
    await asegurarAccesoMesa(user.restauranteId, user, pedido.mesaId);

    const resultado = await entregarItems(user.restauranteId, id, itemIds);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    if (error instanceof PedidoError) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.codigo === "pedido_no_existe" ? 404 : 409 });
    }
    return apiErrorResponse(error);
  }
}
