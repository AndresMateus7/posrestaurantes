import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { RolUsuario } from "@prisma/client";
import { authOptions } from "@/lib/auth";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRol(...roles: RolUsuario[]) {
  const user = await requireUser();
  if (!roles.includes(user.rol)) redirect("/");
  return user;
}
