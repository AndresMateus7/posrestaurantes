import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireApiUser();
    const ingredientes = await prisma.ingrediente.findMany({
      where: { restauranteId: user.restauranteId },
      orderBy: { nombre: "asc" },
    });

    // Fecha de la ultima reposicion de stock (tipo "entrada"), por ingrediente
    // -- se muestra en el panel de Inventario junto a "creadoEn" (alta del item).
    const ultimasEntradas = await prisma.movimientoInventario.groupBy({
      by: ["ingredienteId"],
      where: { ingredienteId: { in: ingredientes.map((i) => i.id) }, tipo: "entrada" },
      _max: { creadoEn: true },
    });
    const fechaPorIngrediente = new Map(ultimasEntradas.map((m) => [m.ingredienteId, m._max.creadoEn]));

    return NextResponse.json(
      ingredientes.map((ing) => ({ ...ing, ultimaEntrada: fechaPorIngrediente.get(ing.id) ?? null }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { nombre, unidadMedida, stockActual, stockMinimo, ubicacion } = (await req.json()) as {
      nombre?: string;
      unidadMedida?: string;
      stockActual?: number;
      stockMinimo?: number;
      ubicacion?: string;
    };
    if (!nombre) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 });

    const ingrediente = await prisma.ingrediente.create({
      data: {
        restauranteId: user.restauranteId,
        nombre,
        unidadMedida: unidadMedida ?? "g",
        stockActual: stockActual ?? 0,
        stockMinimo: stockMinimo ?? 0,
        ubicacion: ubicacion || null,
      },
    });
    return NextResponse.json(ingrediente, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
