import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { contarPendientes, crearArqueo, errorDeArqueo, listarArqueos } from "@/lib/arqueos";
import { prisma } from "@/lib/prisma";

// Conteos fisicos de inventario. Caja y administracion los envian; al administrador le llegan para revisar.
//   GET  -> lista (el administrador con resumen y semaforo; caja solo los suyos, sin diferencias)
//   GET ?resumen=pendientes -> { pendientes } para el aviso del panel del administrador
//   POST -> envia un conteo { nota?, lineas: [{ ingredienteId, cantidad }] }
export async function GET(req: Request) {
  try {
    const user = await requireApiUser("caja", "admin");
    if (new URL(req.url).searchParams.get("resumen") === "pendientes") {
      return NextResponse.json({ pendientes: user.rol === "admin" ? await contarPendientes(user.restauranteId) : 0 });
    }
    return NextResponse.json(await listarArqueos(user.restauranteId, { id: user.usuarioId, rol: user.rol }));
  } catch (error) {
    const conocido = errorDeArqueo(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("caja", "admin");
    const body = (await req.json().catch(() => null)) as { nota?: unknown; lineas?: unknown } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Conteo inválido" }, { status: 400 });

    const nombre = user.name ?? (await prisma.usuario.findUnique({ where: { id: user.usuarioId }, select: { nombre: true } }))?.nombre ?? "Caja";
    const resultado = await crearArqueo(user.restauranteId, { id: user.usuarioId, nombre }, body);
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    const conocido = errorDeArqueo(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
