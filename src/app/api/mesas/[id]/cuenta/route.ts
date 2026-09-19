import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";

// Items activos (no entregados aun) de una mesa + total corriente,
// incluyendo lo ya entregado (para que caja/mesero vean el total real).
// Un mesero solo puede consultar sus mesas (o las que nadie atiende).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    await asegurarAccesoMesa(user.restauranteId, user, id);

    const items = await prisma.itemPedido.findMany({
      where: { pedido: { mesaId: id, restauranteId: user.restauranteId } },
      include: { producto: true, adicionales: { include: { adicional: true } } },
      orderBy: { creadoEn: "asc" },
    });

    const total = items.reduce((acc, it) => {
      const extras = it.adicionales.reduce((a, ad) => a + ad.precioUnitario * ad.cantidad, 0);
      return acc + it.precioUnitario * it.cantidad + extras;
    }, 0);

    return NextResponse.json({
      total,
      items: items
        .filter((it) => it.estado !== "entregado")
        .map((it) => ({
          id: it.id,
          nombreProducto: it.producto.nombre,
          cantidad: it.cantidad,
          estado: it.estado,
          pedidoId: it.pedidoId,
          adicionales: it.adicionales.map((a) => a.adicional.nombre),
        })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
