import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { registrarFacturaProveedor, listarFacturasProveedor, resumenFacturasProveedor, type ItemFacturaProveedor } from "@/lib/facturas-proveedor";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser("admin", "caja");
    const { searchParams } = new URL(req.url);
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    const rango = desdeParam && hastaParam ? { desde: new Date(desdeParam), hasta: new Date(hastaParam) } : undefined;

    const [resumen, facturas] = await Promise.all([
      resumenFacturasProveedor(user.restauranteId),
      listarFacturasProveedor(user.restauranteId, rango),
    ]);
    return NextResponse.json({ resumen, facturas });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("admin", "caja");
    const { proveedor, numeroFactura, fecha, items } = (await req.json()) as {
      proveedor?: string;
      numeroFactura?: string;
      fecha?: string;
      items?: ItemFacturaProveedor[];
    };
    if (!proveedor || !items?.length) {
      return NextResponse.json({ error: "proveedor e items son requeridos" }, { status: 400 });
    }

    const factura = await registrarFacturaProveedor(user.restauranteId, user.usuarioId, {
      proveedor,
      numeroFactura,
      fecha: fecha ? new Date(fecha) : undefined,
      items,
    });
    return NextResponse.json(factura, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
