import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { disponibleEfectivo } from "@/lib/disponibilidad";
import { crearPedidoExterno, errorDePedido } from "@/lib/pedidos-externos";
import { estadoEntrega } from "@/lib/servicio";

// Pedidos que el cliente manda por el link publico (/pedir/<slug>). Quedan como "solicitud" sin tocar
// cocina ni inventario: caja los acepta (ahi se crea el pedido de verdad) o los rechaza.

export class SolicitudError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

export type LineaSolicitud = {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  ingredientesRemovidos: { id: string; nombre: string }[];
  adicionales: { id: string; nombre: string; precio: number }[];
};

const LIMITE = { nombre: 80, direccion: 200, notas: 300, lineas: 40, cantidad: 20, pendientes: 40 };
const PAGOS: Record<string, string> = {
  efectivo: "efectivo",
  transferencia: "transferencia (Nequi, Daviplata...)",
  datafono: "datáfono al recibir",
};
// Un pedido que nadie atiende en este tiempo se da por vencido: el cliente ya no lo espera y no debe
// aceptarse a la manana siguiente ni llenar el tope de pendientes.
const VIGENCIA_SOLICITUD_MS = 3 * 60 * 60_000;
const MOTIVO_VENCIDA = "Nadie alcanzó a atender tu pedido. Llámanos o vuelve a pedir.";
const TEMA_POR_DEFECTO = { colorPrimario: "#DC2626", colorSecundario: "#1F2937", colorFondo: "#F9FAFB", colorTexto: "#111827", fuente: "Poppins" };

const limpiar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");

/** Cierra los pedidos del link que nadie atendio a tiempo (ver VIGENCIA_SOLICITUD_MS). */
async function vencerSolicitudesViejas(restauranteId: string) {
  await prisma.solicitudPedido.updateMany({
    where: { restauranteId, estado: "pendiente", creadoEn: { lt: new Date(Date.now() - VIGENCIA_SOLICITUD_MS) } },
    data: { estado: "rechazada", motivoRechazo: MOTIVO_VENCIDA, respondidoEn: new Date() },
  });
}

/** Menu del link publico: solo lo que el cliente puede ver (sin costos ni datos internos). */
export async function obtenerMenuPublico(slug: string) {
  const restaurante = await prisma.restaurante.findUnique({ where: { slug }, include: { tema: true } });
  if (!restaurante || !restaurante.activo) return null;

  const t = restaurante.tema;
  const base = {
    restaurante: { nombre: restaurante.nombre, telefono: restaurante.telefono },
    tema: t ? { colorPrimario: t.colorPrimario, colorSecundario: t.colorSecundario, colorFondo: t.colorFondo, colorTexto: t.colorTexto, fuente: t.fuente } : TEMA_POR_DEFECTO,
    abierto: restaurante.pedidosWebActivos,
    costoDomicilio: restaurante.costoDomicilioBase,
  };
  if (!restaurante.pedidosWebActivos) return { ...base, categorias: [], productos: [] };

  const [categorias, productos] = await Promise.all([
    prisma.categoriaMenu.findMany({ where: { restauranteId: restaurante.id, activo: true }, orderBy: { orden: "asc" }, select: { id: true, nombre: true, activo: true } }),
    prisma.producto.findMany({
      where: { restauranteId: restaurante.id, categoria: { activo: true } },
      orderBy: { orden: "asc" },
      include: {
        alergenos: { include: { alergeno: true } },
        ingredientes: { include: { ingrediente: true } },
        adicionales: { include: { adicional: true } },
      },
    }),
  ]);

  return {
    ...base,
    categorias,
    productos: productos.map((p) => ({
      id: p.id,
      categoriaId: p.categoriaId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      imagenUrl: p.imagenUrl,
      disponibleEfectivo: disponibleEfectivo(p),
      alergenos: p.alergenos.map((a) => ({ id: a.alergeno.id, nombre: a.alergeno.nombre, icono: a.alergeno.icono })),
      // Solo lo que el cliente puede quitar / agregar, igual que en el menu por QR.
      ingredientes: p.ingredientes.filter((pi) => pi.removible).map((pi) => ({ id: pi.ingrediente.id, nombre: pi.ingrediente.nombre })),
      adicionales: p.adicionales.filter((pa) => pa.adicional.activo).map((pa) => ({ id: pa.adicional.id, nombre: pa.adicional.nombre, precio: pa.adicional.precio })),
    })),
  };
}

/** Revisa los platos que manda el cliente contra el menu real y arma las lineas con nombre y precio. */
async function validarPlatos(restauranteId: string, items: unknown) {
  if (!Array.isArray(items) || items.length === 0) throw new SolicitudError("sin_platos", "Agrega al menos un plato");
  if (items.length > LIMITE.lineas) throw new SolicitudError("muchos_platos", "El pedido tiene demasiados platos");

  const ids = [...new Set(items.map((i) => i?.productoId).filter((s): s is string => typeof s === "string"))];
  const productos = await prisma.producto.findMany({
    where: { id: { in: ids }, restauranteId, categoria: { activo: true } },
    include: { ingredientes: { include: { ingrediente: true } }, adicionales: { include: { adicional: true } } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const lineas: LineaSolicitud[] = [];
  for (const it of items) {
    const p = typeof it?.productoId === "string" ? porId.get(it.productoId) : undefined;
    if (!p) throw new SolicitudError("producto_no_existe", "Uno de los platos ya no está en el menú: actualiza la página");
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1 || it.cantidad > LIMITE.cantidad) throw new SolicitudError("cantidad_invalida", "La cantidad de cada plato debe ser entre 1 y 20");
    if (!disponibleEfectivo(p)) throw new SolicitudError("producto_agotado", `${p.nombre} está agotado`);

    const removibles = new Map(p.ingredientes.filter((pi) => pi.removible).map((pi) => [pi.ingrediente.id, pi.ingrediente.nombre]));
    const pedidosQuitar = [...new Set(Array.isArray(it.ingredientesRemovidos) ? it.ingredientesRemovidos : [])];
    if (pedidosQuitar.some((id) => typeof id !== "string" || !removibles.has(id))) throw new SolicitudError("menu_cambio", "El menú cambió: actualiza la página");

    const extras = new Map(p.adicionales.filter((pa) => pa.adicional.activo).map((pa) => [pa.adicional.id, pa.adicional]));
    const pedidosExtra = [...new Set(Array.isArray(it.adicionales) ? it.adicionales : [])];
    if (pedidosExtra.some((id) => typeof id !== "string" || !extras.has(id))) throw new SolicitudError("menu_cambio", "El menú cambió: actualiza la página");

    lineas.push({
      productoId: p.id,
      nombre: p.nombre,
      cantidad: it.cantidad,
      precioUnitario: p.precio,
      ingredientesRemovidos: (pedidosQuitar as string[]).map((id) => ({ id, nombre: removibles.get(id)! })),
      adicionales: (pedidosExtra as string[]).map((id) => ({ id, nombre: extras.get(id)!.nombre, precio: extras.get(id)!.precio })),
    });
  }
  const subtotal = lineas.reduce((acc, l) => acc + (l.precioUnitario + l.adicionales.reduce((a, e) => a + e.precio, 0)) * l.cantidad, 0);
  return { lineas, subtotal };
}

export type DatosSolicitud = {
  tipo?: unknown;
  nombre?: unknown;
  telefono?: unknown;
  direccion?: unknown;
  notas?: unknown;
  pago?: unknown;
  pagaCon?: unknown;
  items?: unknown;
};

/** Guarda el pedido del cliente (queda pendiente de que caja lo acepte). Nada de esto toca cocina ni inventario. */
export async function crearSolicitud(slug: string, datos: DatosSolicitud) {
  const restaurante = await prisma.restaurante.findUnique({ where: { slug } });
  if (!restaurante || !restaurante.activo) throw new SolicitudError("no_existe", "Restaurante no encontrado");
  if (!restaurante.pedidosWebActivos) throw new SolicitudError("cerrado", "Por ahora no estamos recibiendo pedidos por este link");

  if (datos.tipo !== "llevar" && datos.tipo !== "domicilio") throw new SolicitudError("tipo_invalido", "Elige si es a domicilio o para recoger");
  const tipo = datos.tipo;
  const nombre = limpiar(datos.nombre, LIMITE.nombre);
  if (nombre.length < 2) throw new SolicitudError("nombre_invalido", "Escribe tu nombre");
  const telefono = limpiar(datos.telefono, 20).replace(/[^\d+]/g, "");
  const digitos = telefono.replace(/\D/g, "").length;
  if (digitos < 7 || digitos > 15) throw new SolicitudError("telefono_invalido", "Escribe un teléfono válido para poder contactarte");
  const direccion = tipo === "domicilio" ? limpiar(datos.direccion, LIMITE.direccion) : null;
  if (tipo === "domicilio" && (direccion?.length ?? 0) < 5) throw new SolicitudError("direccion_invalida", "Escribe la dirección de entrega");
  const notas = limpiar(datos.notas, LIMITE.notas) || null;
  const pago = typeof datos.pago === "string" && datos.pago in PAGOS ? datos.pago : null;
  const pagaCon = pago === "efectivo" && Number.isInteger(datos.pagaCon) && (datos.pagaCon as number) > 0 && (datos.pagaCon as number) <= 10_000_000 ? (datos.pagaCon as number) : null;

  await vencerSolicitudesViejas(restaurante.id);
  const pendientes = await prisma.solicitudPedido.count({ where: { restauranteId: restaurante.id, estado: "pendiente" } });
  if (pendientes >= LIMITE.pendientes) throw new SolicitudError("muchos_pendientes", "Hay muchos pedidos en espera, intenta de nuevo en unos minutos");

  const { lineas, subtotal } = await validarPlatos(restaurante.id, datos.items);
  const costoDomicilio = tipo === "domicilio" ? restaurante.costoDomicilioBase : 0;

  const solicitud = await prisma.solicitudPedido.create({
    data: {
      restauranteId: restaurante.id,
      tipo,
      clienteNombre: nombre,
      clienteTelefono: telefono,
      direccion,
      notas,
      pago,
      pagaCon,
      items: lineas as unknown as Prisma.InputJsonValue,
      subtotal,
      costoDomicilio,
      total: subtotal + costoDomicilio,
    },
  });

  // El aviso a caja lleva solo lo justo; el detalle lo pide la pantalla de caja a la API.
  emitirEvento(restaurante.id, "solicitud-creada", { id: solicitud.id, tipo, clienteNombre: nombre });
  return { id: solicitud.id, subtotal, costoDomicilio, total: subtotal + costoDomicilio };
}

/** Solicitudes que esperan respuesta de caja, la mas vieja primero. */
export async function listarSolicitudesPendientes(restauranteId: string) {
  await vencerSolicitudesViejas(restauranteId);
  const solicitudes = await prisma.solicitudPedido.findMany({ where: { restauranteId, estado: "pendiente" }, orderBy: { creadoEn: "asc" } });
  return solicitudes.map((s) => ({
    id: s.id,
    tipo: s.tipo as "llevar" | "domicilio",
    clienteNombre: s.clienteNombre,
    clienteTelefono: s.clienteTelefono,
    direccion: s.direccion,
    notas: s.notas,
    pago: s.pago,
    pagaCon: s.pagaCon,
    platos: s.items as unknown as LineaSolicitud[],
    subtotal: s.subtotal,
    costoDomicilio: s.costoDomicilio,
    total: s.total,
    creadoEn: s.creadoEn,
  }));
}

/** Acepta el pedido: se crea el pedido para llevar / domicilio (va a cocina y descuenta inventario) y la solicitud queda ligada a su cuenta. */
export async function aceptarSolicitud(restauranteId: string, id: string, opciones: { costoDomicilio?: number } = {}) {
  const s = await prisma.solicitudPedido.findUnique({ where: { id } });
  if (!s || s.restauranteId !== restauranteId) throw new SolicitudError("no_existe", "Ese pedido no existe");
  if (s.estado !== "pendiente") throw new SolicitudError("ya_respondida", "Ese pedido ya fue respondido");
  if (Date.now() - s.creadoEn.getTime() > VIGENCIA_SOLICITUD_MS) {
    await vencerSolicitudesViejas(restauranteId);
    throw new SolicitudError("ya_respondida", "Ese pedido venció: nadie lo atendió a tiempo y el cliente ya lo ve cancelado");
  }

  const lineas = s.items as unknown as LineaSolicitud[];
  const partesNotas: string[] = [];
  if (s.pago) partesNotas.push(`Paga ${PAGOS[s.pago] ?? s.pago}${s.pagaCon ? ` con ${formatoCOP(s.pagaCon)}` : ""}`);
  if (s.notas) partesNotas.push(s.notas);

  const costoDomicilio = s.tipo === "domicilio" ? opciones.costoDomicilio ?? s.costoDomicilio : 0;
  const resultado = await crearPedidoExterno(
    restauranteId,
    {
      tipo: s.tipo as "llevar" | "domicilio",
      clienteNombre: s.clienteNombre,
      clienteTelefono: s.clienteTelefono,
      direccion: s.direccion ?? undefined,
      costoDomicilio,
      notas: partesNotas.join(" · ") || undefined,
    },
    lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, ingredientesRemovidos: l.ingredientesRemovidos.map((i) => i.id), adicionales: l.adicionales.map((a) => a.id) })),
    {
      origen: "qr_cliente",
      // Dentro de la misma transaccion: si otro usuario la respondio a la vez, no se crea nada.
      alCrear: async (tx, cuentaId) => {
        const { count } = await tx.solicitudPedido.updateMany({ where: { id, estado: "pendiente" }, data: { estado: "aceptada", cuentaId, respondidoEn: new Date() } });
        if (count !== 1) throw new SolicitudError("ya_respondida", "Otro usuario ya respondió ese pedido");
      },
    }
  );

  emitirEvento(restauranteId, "solicitud-actualizada", { id });
  return resultado;
}

export async function rechazarSolicitud(restauranteId: string, id: string, motivo?: string) {
  const s = await prisma.solicitudPedido.findUnique({ where: { id }, select: { restauranteId: true } });
  if (!s || s.restauranteId !== restauranteId) throw new SolicitudError("no_existe", "Ese pedido no existe");

  const { count } = await prisma.solicitudPedido.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "rechazada", motivoRechazo: limpiar(motivo, 200) || null, respondidoEn: new Date() },
  });
  if (count !== 1) throw new SolicitudError("ya_respondida", "Ese pedido ya fue respondido");
  emitirEvento(restauranteId, "solicitud-actualizada", { id });
}

export type ProgresoPedido = "pendiente" | "rechazada" | "en_cocina" | "listo" | "en_camino" | "entregado" | "cancelada";

/** En que va el pedido de un cliente (lo consulta la pagina de seguimiento del link; el id es un UUID imposible de adivinar). */
export async function estadoPublicoSolicitud(id: string) {
  const s = await prisma.solicitudPedido.findUnique({
    where: { id },
    include: {
      restaurante: { select: { nombre: true, telefono: true } },
      cuenta: { select: { numero: true, estado: true, total: true, despachadoEn: true, pedidos: { select: { items: { select: { estado: true } } } } } },
    },
  });
  if (!s) return null;

  // Vencida: sigue "pendiente" en la base hasta que alguien liste o cree pedidos, pero el cliente ya la ve cancelada.
  const vencida = s.estado === "pendiente" && Date.now() - s.creadoEn.getTime() > VIGENCIA_SOLICITUD_MS;
  let progreso: ProgresoPedido;
  if (vencida || s.estado === "rechazada") progreso = "rechazada";
  else if (s.estado === "pendiente") progreso = "pendiente";
  else if (!s.cuenta || s.cuenta.estado === "anulada") progreso = "cancelada";
  else {
    const e = estadoEntrega(s.cuenta.pedidos.flatMap((p) => p.items.map((i) => i.estado)), !!s.cuenta.despachadoEn);
    progreso = e === "sin_platos" ? "en_cocina" : e;
  }

  return {
    progreso,
    motivoRechazo: vencida ? MOTIVO_VENCIDA : s.motivoRechazo,
    tipo: s.tipo as "llevar" | "domicilio",
    clienteNombre: s.clienteNombre,
    numero: s.cuenta?.numero ?? null,
    total: s.cuenta?.total ?? s.total,
    restaurante: s.restaurante,
  };
}

/** Convierte los errores de las solicitudes (y de crear el pedido al aceptarla) en respuesta HTTP; null si es otro error. */
export function errorDeSolicitud(error: unknown): { status: number; body: { error: string; codigo: string } } | null {
  if (error instanceof SolicitudError) {
    const conflicto = ["ya_respondida", "muchos_pendientes", "producto_agotado", "menu_cambio"];
    const status = error.codigo === "no_existe" ? 404 : error.codigo === "cerrado" ? 403 : conflicto.includes(error.codigo) ? 409 : 400;
    return { status, body: { error: error.message, codigo: error.codigo } };
  }
  return errorDePedido(error);
}
