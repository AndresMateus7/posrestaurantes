import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { asegurarAccesoMesa } from "@/lib/acceso-mesas";
import { abrirMesa } from "@/lib/mesas";
import { crearPedido, PedidoError, type ItemCarrito } from "@/lib/pedidos";

// Version autenticada de POST /api/public/pedidos: el mesero (o caja/admin)
// toma el pedido de una mesa desde el menu, en vez de que lo mande el cliente
// por el QR. Un mesero solo puede hacerlo en sus mesas o en las que nadie
// atiende; al tomar el pedido la mesa queda abierta y a su nombre.
export async function POST(req: Request) {
  try {
    const user = await requireApiUser("mesero", "admin", "caja");
    const { mesaId, items } = (await req.json()) as { mesaId?: string; items?: ItemCarrito[] };
    if (!mesaId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "mesaId e items son requeridos" }, { status: 400 });
    }
    const itemsValidos = items.every((it) => typeof it?.productoId === "string" && Number.isInteger(it.cantidad) && it.cantidad >= 1 && it.cantidad <= 99);
    if (!itemsValidos) {
      return NextResponse.json({ error: "Cada item necesita un producto y una cantidad entre 1 y 99" }, { status: 400 });
    }

    const mesa = await asegurarAccesoMesa(user.restauranteId, user, mesaId);
    const esMesero = user.rol === "mesero";

    const sinMesero = esMesero && mesa.meseroId === null;
    if (mesa.estado === "libre" || mesa.estado === "reservada" || sinMesero) {
      await abrirMesa(user.restauranteId, mesa.id, user);
    }

    const pedido = await crearPedido(user.restauranteId, mesa.id, items, esMesero ? "mesero" : "mostrador", esMesero ? user.usuarioId : undefined);
    return NextResponse.json({ pedidoId: pedido.id }, { status: 201 });
  } catch (error) {
    if (error instanceof PedidoError) {
      const status = error.codigo === "producto_agotado" || error.codigo === "mesa_cerrada" ? 409 : 400;
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status });
    }
    return apiErrorResponse(error);
  }
}
