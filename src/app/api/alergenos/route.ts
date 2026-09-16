import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";

// Catalogo global (no es por restaurante) para poblar checkboxes en el
// formulario de producto -- ver schema.sql tabla `alergenos`.
export async function GET() {
  try {
    await requireApiUser();
    const alergenos = await prisma.alergeno.findMany({ orderBy: { nombre: "asc" } });
    return NextResponse.json(alergenos);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
