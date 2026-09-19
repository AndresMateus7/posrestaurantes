import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PedirDomicilio } from "@/components/menu/PedirDomicilio";

// Link publico para pedir a domicilio o para recoger: no pide iniciar sesion.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const restaurante = await prisma.restaurante.findUnique({ where: { slug }, select: { nombre: true } }).catch(() => null);
  return { title: restaurante ? `Pedir a ${restaurante.nombre}` : "Pedidos", description: "Haz tu pedido a domicilio o para recoger" };
}

export default async function PedirPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PedirDomicilio slug={slug} />;
}
