import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { RolUsuario } from "@prisma/client";
import { authOptions } from "@/lib/auth";

export class ApiAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Para usar dentro de un Route Handler: lanza ApiAuthError (401/403) si no
 * hay sesión o el rol no está permitido. El caller la atrapa y la convierte
 * en NextResponse via apiErrorResponse().
 */
export async function requireApiUser(...rolesPermitidos: RolUsuario[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new ApiAuthError(401, "No autenticado");
  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(session.user.rol)) {
    throw new ApiAuthError(403, "No autorizado para este rol");
  }
  return session.user;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
}
