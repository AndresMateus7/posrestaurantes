import { MenuCliente } from "@/components/menu/MenuCliente";

export default async function MenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MenuCliente token={token} />;
}
