import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearPedido, PedidoError, esErrorDePrisma, type ItemCarrito } from "@/lib/pedidos";

type Body = { qrToken?: string; items?: ItemCarrito[] };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.qrToken || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "qrToken e items son requeridos" }, { status: 400 });
  }

  const mesa = await prisma.mesa.findUnique({ where: { qrToken: body.qrToken } });
  if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

  try {
    const pedido = await crearPedido(mesa.restauranteId, mesa.id, body.items, "qr_cliente");
    return NextResponse.json({ pedidoId: pedido.id }, { status: 201 });
  } catch (error) {
    if (error instanceof PedidoError) {
      const status = error.codigo === "producto_agotado" || error.codigo === "mesa_cerrada" ? 409 : 400;
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status });
    }
    if (esErrorDePrisma(error) && error.code === "P2000") {
      return NextResponse.json({ error: "Stock insuficiente, intenta de nuevo" }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "No se pudo crear el pedido" }, { status: 500 });
  }
}
