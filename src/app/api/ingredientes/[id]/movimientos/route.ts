import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";
import type { TipoMovimientoInventario } from "@prisma/client";

// Registra una entrada/salida/ajuste manual y actualiza stock_actual en la
// misma transaccion -- ver arquitectura-backend.md sec. 7. El descuento por
// VENTA no pasa por aqui, pasa dentro de crearPedido (src/lib/pedidos.ts).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    const { tipo, cantidad, motivo } = (await req.json()) as { tipo?: TipoMovimientoInventario; cantidad?: number; motivo?: string };

    if (!tipo || typeof cantidad !== "number") {
      return NextResponse.json({ error: "tipo y cantidad son requeridos" }, { status: 400 });
    }

    const ingrediente = await prisma.ingrediente.findUnique({ where: { id } });
    if (!ingrediente || ingrediente.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Ingrediente no existe" }, { status: 404 });
    }

    const delta = tipo === "salida" ? -Math.abs(cantidad) : Math.abs(cantidad);
    const [, actualizado] = await prisma.$transaction([
      prisma.movimientoInventario.create({ data: { ingredienteId: id, tipo, cantidad, motivo, usuarioId: user.usuarioId } }),
      prisma.ingrediente.update({ where: { id }, data: { stockActual: { increment: delta } } }),
    ]);

    emitirEvento(user.restauranteId, "inventario-actualizado", { ingredienteId: id, stockActual: actualizado.stockActual });
    return NextResponse.json(actualizado);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
