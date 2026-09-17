import { redirect } from "next/navigation";
import type { RolUsuario } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HomeHub } from "@/components/home/HomeHub";

type Seccion = { href: string; titulo: string; descripcion: string; roles: RolUsuario[] };

const SECCIONES: Seccion[] = [
  { href: "/admin", titulo: "Administrador", descripcion: "Tema, productos, inventario, mesas y plano del local", roles: ["admin"] },
  { href: "/mesero", titulo: "Mesero", descripcion: "Mapa de mesas, pedidos y llamados", roles: ["admin", "mesero", "caja"] },
  { href: "/cocina", titulo: "Cocina", descripcion: "Cola de pedidos por estación", roles: ["admin", "cocina", "caja"] },
  { href: "/caja", titulo: "Caja", descripcion: "Cobros, turnos y arqueo", roles: ["admin", "caja"] },
];

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const disponibles = SECCIONES.filter((s) => s.roles.includes(user.rol));
  if (disponibles.length <= 1) redirect(disponibles[0]?.href ?? "/login");

  const restaurante = await prisma.restaurante.findUniqueOrThrow({ where: { id: user.restauranteId } });

  return <HomeHub restauranteNombre={restaurante.nombre} rol={user.rol} secciones={disponibles} />;
}
