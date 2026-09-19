import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { agregarPedidoAExterno, anularExterno, despacharExterno, entregarExterno, errorDePedido, itemsValidos } from "@/lib/pedidos-externos";

// Acciones sobre un pedido para llevar / domicilio:
//   pedidos   -> agrega otro pedido (mas platos) mientras siga abierto   { items }
//   despachar -> el domiciliario sale con el pedido (solo domicilios)
//   entregar  -> se entrega al cliente
//   anular    -> se cancela si aun no se entrega ni se cobro
export async function POST(req: Request, { params }: { params: Promise<{ id: string; accion: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id, accion } = await params;

    switch (accion) {
      case "pedidos": {
        const { items } = (await req.json()) as { items?: unknown };
        if (!itemsValidos(items)) return NextResponse.json({ error: "Cada plato necesita un producto y una cantidad entre 1 y 99" }, { status: 400 });
        return NextResponse.json(await agregarPedidoAExterno(user.restauranteId, id, items), { status: 201 });
      }
      case "despachar":
        await despacharExterno(user.restauranteId, id);
        return NextResponse.json({ ok: true });
      case "entregar":
        await entregarExterno(user.restauranteId, id);
        return NextResponse.json({ ok: true });
      case "anular":
        await anularExterno(user.restauranteId, id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Acción desconocida" }, { status: 404 });
    }
  } catch (error) {
    const conocido = errorDePedido(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
