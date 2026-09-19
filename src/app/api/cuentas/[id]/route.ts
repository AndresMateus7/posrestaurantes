import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, apiErrorResponse, ApiAuthError } from "@/lib/api-auth";
import { etiquetaServicio } from "@/lib/servicio";

// Detalle completo de una cuenta: pedidos+items (para saber que se consumio),
// sub-cuentas (si ya se dividio) y pagos ya registrados. Es lo que pinta la
// pantalla de caja al abrir una mesa para cobrar.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("caja", "admin");
    const { id } = await params;

    const cuenta = await prisma.cuenta.findUnique({
      where: { id },
      include: {
        mesa: { select: { id: true, numero: true, meseroId: true, mesero: { select: { nombre: true } } } },
        pedidos: {
          include: {
            items: { include: { producto: { select: { nombre: true } }, adicionales: { include: { adicional: true } } } },
          },
          orderBy: { creadoEn: "asc" },
        },
        subCuentas: { include: { items: true } },
        pagos: { orderBy: { creadoEn: "asc" } },
      },
    });
    if (!cuenta || cuenta.restauranteId !== user.restauranteId) {
      throw new ApiAuthError(404, "Cuenta no encontrada");
    }

    return NextResponse.json({
      id: cuenta.id,
      // Los pedidos para llevar / domicilio no tienen mesa (mesaId null): llevan los datos del cliente.
      tipo: cuenta.tipo,
      etiqueta: etiquetaServicio({ tipo: cuenta.tipo, numero: cuenta.numero, mesaNumero: cuenta.mesa?.numero ?? null }),
      cliente: cuenta.tipo === "mesa" ? null : { nombre: cuenta.clienteNombre, telefono: cuenta.clienteTelefono, direccion: cuenta.direccion, domiciliario: cuenta.domiciliario, notas: cuenta.notas },
      mesaId: cuenta.mesa?.id ?? null,
      mesaNumero: cuenta.mesa?.numero ?? null,
      meseroId: cuenta.mesa?.meseroId ?? null,
      meseroNombre: cuenta.mesa?.mesero?.nombre ?? null,
      estado: cuenta.estado,
      subtotal: cuenta.subtotal,
      propina: cuenta.propina,
      costoDomicilio: cuenta.costoDomicilio,
      total: cuenta.total,
      creadoEn: cuenta.creadoEn,
      items: cuenta.pedidos.flatMap((p) =>
        p.items.filter((it) => it.estado !== "cancelado").map((it) => ({
          id: it.id,
          pedidoId: p.id,
          nombreProducto: it.producto.nombre,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          estado: it.estado,
          adicionales: it.adicionales.map((a) => ({ nombre: a.adicional.nombre, precioUnitario: a.precioUnitario, cantidad: a.cantidad })),
        }))
      ),
      subCuentas: cuenta.subCuentas.map((s) => ({
        id: s.id,
        etiqueta: s.etiqueta,
        tipoDivision: s.tipoDivision,
        monto: s.monto,
        pagado: s.pagado,
        items: s.items,
      })),
      pagos: cuenta.pagos,
      totalPagado: cuenta.pagos.reduce((a, p) => a + p.monto, 0),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
