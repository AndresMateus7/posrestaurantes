import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RolUsuario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { esErrorDePrisma } from "@/lib/pedidos";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("admin");
    const { id } = await params;

    const existente = await prisma.usuario.findUnique({ where: { id } });
    if (!existente || existente.restauranteId !== user.restauranteId) {
      return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });
    }

    const body = (await req.json()) as { nombre?: string; rol?: RolUsuario; activo?: boolean; password?: string };
    if (body.password != null && body.password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }
    if (existente.id === user.usuarioId && (body.activo === false || (body.rol && body.rol !== "admin"))) {
      return NextResponse.json({ error: "No puedes desactivarte ni quitarte el rol de admin a ti mismo" }, { status: 400 });
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        nombre: body.nombre,
        rol: body.rol,
        activo: body.activo,
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
      },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true },
    });
    return NextResponse.json(usuario);
  } catch (error) {
    if (esErrorDePrisma(error) && error.code === "P2002") {
      return NextResponse.json({ error: "Ese email ya está en uso" }, { status: 409 });
    }
    return apiErrorResponse(error);
  }
}
