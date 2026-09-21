import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { esLogoValido, sanearConfigTicket } from "@/lib/ticket";

// Diseno del ticket de impresion: lo configura el administrador y lo usan caja y administracion al
// imprimir. Los datos del negocio (NIT, direccion, telefono) viven en el restaurante.
async function leer(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({
    where: { id: restauranteId },
    select: { nombre: true, nit: true, direccion: true, telefono: true, ticketConfig: true },
  });
  return { config: sanearConfigTicket(r.ticketConfig), negocio: { nombre: r.nombre, nit: r.nit, direccion: r.direccion, telefono: r.telefono } };
}

export async function GET() {
  try {
    const user = await requireApiUser("admin", "caja");
    return NextResponse.json(await leer(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Texto opcional: recortado, sin saltos de linea; vacio lo borra.
function textoOpcional(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw new Error("Los datos del negocio deben ser texto");
  const limpio = v.replace(/[\r\n]+/g, " ").trim();
  if (limpio.length > max) throw new Error(`El texto es muy largo (máximo ${max} caracteres)`);
  return limpio === "" ? null : limpio;
}

export async function PUT(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const body = (await req.json().catch(() => null)) as { config?: unknown; negocio?: { nit?: unknown; direccion?: unknown; telefono?: unknown } } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const data: Prisma.RestauranteUpdateInput = {};

    if (body.config !== undefined) {
      if (!body.config || typeof body.config !== "object") return NextResponse.json({ error: "El diseño del ticket es inválido" }, { status: 400 });
      // Un logo que no sirva se rechaza con aviso (no se descarta en silencio).
      const logo = (body.config as { logoImg?: unknown }).logoImg;
      if (logo !== undefined && !esLogoValido(logo)) return NextResponse.json({ error: "La imagen del logo no es válida o pesa demasiado (usa PNG, JPG o WebP pequeño)" }, { status: 400 });
      const actual = (await leer(user.restauranteId)).config;
      // Lo que llegue pisa lo guardado; lo que no llegue queda como estaba (por ejemplo el logo).
      data.ticketConfig = sanearConfigTicket({ ...actual, ...(body.config as object) }) as unknown as Prisma.InputJsonValue;
    }

    if (body.negocio !== undefined) {
      const n = body.negocio;
      if (!n || typeof n !== "object") return NextResponse.json({ error: "Los datos del negocio son inválidos" }, { status: 400 });
      const nit = textoOpcional(n.nit, 30);
      const direccion = textoOpcional(n.direccion, 120);
      const telefono = textoOpcional(n.telefono, 20);
      if (telefono && !/^\+?[\d\s().-]{6,20}$/.test(telefono)) {
        return NextResponse.json({ error: "El teléfono solo puede llevar números, espacios, + y guiones (6 a 20 caracteres)" }, { status: 400 });
      }
      if (nit !== undefined) data.nit = nit;
      if (direccion !== undefined) data.direccion = direccion;
      if (telefono !== undefined) data.telefono = telefono;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No hay nada que actualizar" }, { status: 400 });
    await prisma.restaurante.update({ where: { id: user.restauranteId }, data });
    return NextResponse.json(await leer(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
