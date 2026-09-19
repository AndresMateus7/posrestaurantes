import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { disponibleEfectivo } from "@/lib/disponibilidad";
import { emitirEvento } from "@/lib/realtime";
import { sinCostos } from "@/lib/costos";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const categoriaId = new URL(req.url).searchParams.get("categoriaId");

    const productos = await prisma.producto.findMany({
      where: { restauranteId: user.restauranteId, ...(categoriaId ? { categoriaId } : {}) },
      orderBy: { orden: "asc" },
      include: {
        categoria: true,
        alergenos: { include: { alergeno: true } },
        ingredientes: { include: { ingrediente: true } },
        adicionales: { include: { adicional: true } },
      },
    });

    // Los costos de los insumos solo los ven administrador y caja (meseros y cocina no).
    const veCostos = user.rol === "admin" || user.rol === "caja";
    return NextResponse.json(
      productos.map((p) => ({
        ...p,
        ingredientes: veCostos ? p.ingredientes : p.ingredientes.map((pi) => ({ ...pi, ingrediente: sinCostos(pi.ingrediente) })),
        disponibleEfectivo: disponibleEfectivo(p),
      }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const body = (await req.json()) as {
      categoriaId?: string;
      nombre?: string;
      descripcion?: string;
      precio?: number;
      estacion?: "bar" | "parrilla" | "cocina_general";
      tiempoPreparacionMin?: number;
    };
    if (!body.categoriaId || !body.nombre || typeof body.precio !== "number") {
      return NextResponse.json({ error: "categoriaId, nombre y precio son requeridos" }, { status: 400 });
    }

    const producto = await prisma.producto.create({
      data: {
        restauranteId: user.restauranteId,
        categoriaId: body.categoriaId,
        nombre: body.nombre,
        descripcion: body.descripcion,
        precio: body.precio,
        estacion: body.estacion ?? "cocina_general",
        tiempoPreparacionMin: body.tiempoPreparacionMin ?? 15,
      },
    });
    emitirEvento(user.restauranteId, "producto-actualizado", { productoId: producto.id });
    return NextResponse.json(producto, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
