import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { emitirEvento } from "@/lib/realtime";

export async function GET() {
  try {
    const user = await requireApiUser();
    const restaurante = await prisma.restaurante.findUnique({ where: { id: user.restauranteId } });
    return NextResponse.json(restaurante);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser("admin");
    // Se puede mandar uno o varios de estos ajustes.
    const body = (await req.json()) as { rotaQr?: unknown; pedidosWebActivos?: unknown; costoDomicilioBase?: unknown; telefono?: unknown };
    const data: { rotaQr?: boolean; pedidosWebActivos?: boolean; costoDomicilioBase?: number; telefono?: string | null } = {};

    if (body.rotaQr !== undefined) {
      if (typeof body.rotaQr !== "boolean") return NextResponse.json({ error: "rotaQr debe ser boolean" }, { status: 400 });
      data.rotaQr = body.rotaQr;
    }
    if (body.pedidosWebActivos !== undefined) {
      if (typeof body.pedidosWebActivos !== "boolean") return NextResponse.json({ error: "pedidosWebActivos debe ser boolean" }, { status: 400 });
      data.pedidosWebActivos = body.pedidosWebActivos;
    }
    if (body.costoDomicilioBase !== undefined) {
      const v = body.costoDomicilioBase;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000) {
        return NextResponse.json({ error: "El valor del domicilio debe ser un número entero entre 0 y 1.000.000" }, { status: 400 });
      }
      data.costoDomicilioBase = v;
    }
    if (body.telefono !== undefined) {
      // Es el numero que ve el cliente en el link de pedidos ("Llamar al restaurante"). Vacio o null lo borra.
      const v = body.telefono === null ? "" : typeof body.telefono === "string" ? body.telefono.trim() : undefined;
      if (v === undefined || (v !== "" && !/^\+?[\d\s().-]{6,20}$/.test(v))) {
        return NextResponse.json({ error: "El teléfono solo puede llevar números, espacios, + y guiones (6 a 20 caracteres)" }, { status: 400 });
      }
      data.telefono = v === "" ? null : v;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No hay nada que actualizar" }, { status: 400 });

    const restaurante = await prisma.restaurante.update({ where: { id: user.restauranteId }, data });
    emitirEvento(user.restauranteId, "restaurante-actualizado", { rotaQr: restaurante.rotaQr });
    return NextResponse.json(restaurante);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
