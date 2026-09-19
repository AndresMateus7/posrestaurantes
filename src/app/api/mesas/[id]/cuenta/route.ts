import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";

// Todos los platos de la cuenta en curso de una mesa (con su estado y el pedido
// al que pertenecen, para poder entregarlos uno por uno o por pedido) + el
// total corriente. Solo cuenta la cuenta en curso: lo de cuentas ya pagadas de
// la misma mesa no se suma. Un mesero solo puede consultar sus mesas (o las que
// nadie atiende).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    await asegurarAccesoMesa(user.restauranteId, user, id);

    const items = await prisma.itemPedido.findMany({
      where: {
        pedido: {
          mesaId: id,
          restauranteId: user.restauranteId,
          OR: [{ cuenta: { estado: { in: ["abierta", "dividida"] } } }, { cuentaId: null }],
        },
      },
      include: { producto: true, adicionales: { include: { adicional: true } }, pedido: { select: { creadoEn: true } } },
      orderBy: { creadoEn: "asc" },
    });

    const total = items.reduce((acc, it) => {
      const extras = it.adicionales.reduce((a, ad) => a + ad.precioUnitario * ad.cantidad, 0);
      return acc + it.precioUnitario * it.cantidad + extras;
    }, 0);

    return NextResponse.json({
      total,
      items: items.map((it) => ({
        id: it.id,
        nombreProducto: it.producto.nombre,
        cantidad: it.cantidad,
        estado: it.estado,
        pedidoId: it.pedidoId,
        pedidoCreadoEn: it.pedido.creadoEn,
        adicionales: it.adicionales.map((a) => a.adicional.nombre),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
