import { NextResponse } from "next/server";
import { requireApiUser, apiErrorResponse } from "@/lib/api-auth";
import { crearPedidoExterno, errorDePedido, itemsValidos, listarPedidosExternos, type DatosPedidoExterno } from "@/lib/pedidos-externos";

// Pedidos para llevar y a domicilio: los saca caja (o el administrador), sin mesa.

// Los que siguen en marcha: sin entregar todavia o sin cobrar.
export async function GET() {
  try {
    const user = await requireApiUser("caja", "admin");
    return NextResponse.json(await listarPedidosExternos(user.restauranteId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser("caja", "admin");
    const body = (await req.json()) as Partial<DatosPedidoExterno> & { items?: unknown };
    if (body.tipo !== "llevar" && body.tipo !== "domicilio") {
      return NextResponse.json({ error: "tipo debe ser llevar o domicilio" }, { status: 400 });
    }
    if (!itemsValidos(body.items)) {
      return NextResponse.json({ error: "Cada plato necesita un producto y una cantidad entre 1 y 99" }, { status: 400 });
    }

    const resultado = await crearPedidoExterno(
      user.restauranteId,
      {
        tipo: body.tipo,
        clienteNombre: String(body.clienteNombre ?? ""),
        clienteTelefono: body.clienteTelefono,
        direccion: body.direccion,
        costoDomicilio: body.costoDomicilio,
        domiciliario: body.domiciliario,
        notas: body.notas,
      },
      body.items
    );
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    const conocido = errorDePedido(error);
    if (conocido) return NextResponse.json(conocido.body, { status: conocido.status });
    return apiErrorResponse(error);
  }
}
