import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    const { adicionalIds } = (await req.json()) as { adicionalIds?: string[] };
    if (!Array.isArray(adicionalIds)) return NextResponse.json({ error: "adicionalIds debe ser un array" }, { status: 400 });

    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || producto.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.productoAdicional.deleteMany({ where: { productoId: id } }),
      prisma.productoAdicional.createMany({ data: adicionalIds.map((adicionalId) => ({ productoId: id, adicionalId })) }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
