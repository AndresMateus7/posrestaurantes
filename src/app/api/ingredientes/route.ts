import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { crearIngrediente } from "@/lib/inventario";
import { sinCostos } from "@/lib/costos";

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

    // Los costos solo los ven administrador y caja (meseros y cocina no).
    const veCostos = user.rol === "admin" || user.rol === "caja";
    return NextResponse.json(
      ingredientes.map((ing) => ({ ...(veCostos ? ing : sinCostos(ing)), ultimaEntrada: fechaPorIngrediente.get(ing.id) ?? null }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const { nombre, unidadMedida, stockActual, stockMinimo, ubicacion, venderEnMenu } = (await req.json()) as {
      nombre?: string;
      unidadMedida?: string;
      stockActual?: number;
      stockMinimo?: number;
      ubicacion?: string;
      venderEnMenu?: { nombre?: string; categoriaId: string; precio: number; estacion?: "bar" | "parrilla" | "cocina_general"; cantidadPorVenta?: number };
    };
    if (!nombre) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 });

    const { ingrediente, producto } = await crearIngrediente(user.restauranteId, user.usuarioId, {
      nombre,
      unidadMedida,
      stockActual,
      stockMinimo,
      ubicacion,
      venderEnMenu,
    });
    return NextResponse.json({ ...ingrediente, producto }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
