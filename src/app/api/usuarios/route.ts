import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RolUsuario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { esErrorDePrisma } from "@/lib/pedidos";

const ROLES: RolUsuario[] = ["admin", "mesero", "cocina", "caja"];

export async function GET() {
  try {
    const user = await requireApiUser("admin");
    const usuarios = await prisma.usuario.findMany({
      where: { restauranteId: user.restauranteId },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true },
      orderBy: { creadoEn: "asc" },
    });
    return NextResponse.json(usuarios);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin");
    const body = (await req.json()) as { nombre?: string; email?: string; password?: string; rol?: RolUsuario };

    if (!body.nombre || !body.email || !body.password || !body.rol) {
      return NextResponse.json({ error: "nombre, email, password y rol son requeridos" }, { status: 400 });
    }
    if (!ROLES.includes(body.rol)) {
      return NextResponse.json({ error: "rol invalido" }, { status: 400 });
    }
    if (body.password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const usuario = await prisma.usuario.create({
      data: {
        restauranteId: user.restauranteId,
        nombre: body.nombre,
        email: body.email.toLowerCase(),
        passwordHash,
        rol: body.rol,
      },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true },
    });
    return NextResponse.json(usuario, { status: 201 });
  } catch (error) {
    if (esErrorDePrisma(error) && error.code === "P2002") {
      return NextResponse.json({ error: "Ese email ya está en uso" }, { status: 409 });
    }
    return apiErrorResponse(error);
  }
}
