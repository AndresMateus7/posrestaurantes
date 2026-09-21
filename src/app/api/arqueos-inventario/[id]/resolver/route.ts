import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { errorDeArqueo, resolverArqueo } from "@/lib/arqueos";
import { prisma } from "@/lib/prisma";

// El administrador resuelve el conteo: { todo: true } confirma todo lo pendiente, o
// { acciones: [{ lineaId, accion: "confirmar" | "editar" | "omitir", cantidad? }] } linea por linea.
// Aqui es donde de verdad se ajusta el stock.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { todo?: unknown; acciones?: unknown } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const nombre = user.name ?? (await prisma.usuario.findUnique({ where: { id: user.usuarioId }, select: { nombre: true } }))?.nombre ?? "Administrador";
    return NextResponse.json(await resolverArqueo(user.restauranteId, { id: user.usuarioId, nombre }, id, body));
  } catch (error) {
    const conocido = errorDeArqueo(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
