import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import type { EstacionCocina } from "@prisma/client";

// Cola de KDS: items activos (pendiente/en_preparacion), opcionalmente
// filtrados por estacion. Cada item trae ya resueltos los nombres de
// ingredientes removidos y adicionales para pintar la tarjeta directo.
export async function GET(req: Request) {
  try {
    // Misma lista de roles que la pagina /cocina: un mesero no debe poder leer
    // los pedidos de las mesas de otros meseros por esta via.
    const user = await requireApiUser("cocina", "admin", "caja");
    const estacion = new URL(req.url).searchParams.get("estacion") as EstacionCocina | null;

    const items = await prisma.itemPedido.findMany({
      where: {
        pedido: { restauranteId: user.restauranteId },
        estado: { in: ["pendiente", "en_preparacion"] },
        ...(estacion ? { estacion } : {}),
      },
      include: {
        producto: { include: { ingredientes: { include: { ingrediente: true } } } },
        adicionales: { include: { adicional: true } },
        pedido: { include: { mesa: true } },
      },
      orderBy: { creadoEn: "asc" },
    });

    return NextResponse.json(
      items.map((it) => {
        const removidos = new Set(it.ingredientesRemovidos as string[]);
        const nombresRemovidos = it.producto.ingredientes
          .filter((pi) => removidos.has(pi.ingredienteId))
          .map((pi) => pi.ingrediente.nombre);
        return {
          id: it.id,
          mesaNumero: it.pedido.mesa.numero,
          nombreProducto: it.producto.nombre,
          cantidad: it.cantidad,
          estacion: it.estacion,
          estado: it.estado,
          creadoEn: it.creadoEn,
          tiempoPrepMin: it.producto.tiempoPreparacionMin,
          ingredientesRemovidos: nombresRemovidos,
          adicionales: it.adicionales.map((a) => a.adicional.nombre),
        };
      })
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
