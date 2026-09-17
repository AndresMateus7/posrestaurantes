import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

const RUTA_POR_ROL: Record<string, string> = {
  admin: "/admin",
  mesero: "/mesero",
  cocina: "/cocina",
  caja: "/caja",
};

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(RUTA_POR_ROL[user.rol] ?? "/admin");
}
