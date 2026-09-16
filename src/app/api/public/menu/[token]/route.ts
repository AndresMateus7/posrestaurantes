import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { disponibleEfectivo } from "@/lib/disponibilidad";

// GET /api/public/menu/:token
// Endpoint de entrada del cliente final (arquitectura-backend.md sec. 5):
// de una sola llamada resuelve el qr_token de la mesa y devuelve todo lo
// necesario para pintar el menu (tema, mesa, categorias, productos con su
// disponibilidad ya calculada, ingredientes para el checklist y adicionales).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const mesa = await prisma.mesa.findUnique({
    where: { qrToken: token },
    include: { restaurante: { include: { tema: true } } },
  });
  if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

  const [categorias, productos] = await Promise.all([
    prisma.categoriaMenu.findMany({
      where: { restauranteId: mesa.restauranteId, activo: true },
      orderBy: { orden: "asc" },
    }),
    prisma.producto.findMany({
      where: { restauranteId: mesa.restauranteId },
      orderBy: { orden: "asc" },
      include: {
        alergenos: { include: { alergeno: true } },
        ingredientes: { include: { ingrediente: true } },
        adicionales: { include: { adicional: true } },
      },
    }),
  ]);

  const puedeEnviarPedido = mesa.restaurante.rotaQr || mesa.estado !== "libre";

  return NextResponse.json({
    restaurante: { nombre: mesa.restaurante.nombre, rotaQr: mesa.restaurante.rotaQr },
    tema: mesa.restaurante.tema,
    mesa: { numero: mesa.numero, estado: mesa.estado },
    puedeEnviarPedido,
    categorias,
    productos: productos.map((p) => ({
      id: p.id,
      categoriaId: p.categoriaId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      estacion: p.estacion,
      disponibleEfectivo: disponibleEfectivo(p),
      alergenos: p.alergenos.map((a) => ({ id: a.alergeno.id, nombre: a.alergeno.nombre, icono: a.alergeno.icono })),
      ingredientes: p.ingredientes
        .filter((pi) => pi.removible)
        .map((pi) => ({ id: pi.ingrediente.id, nombre: pi.ingrediente.nombre })),
      adicionales: p.adicionales.map((pa) => ({ id: pa.adicional.id, nombre: pa.adicional.nombre, precio: pa.adicional.precio })),
    })),
  });
}
