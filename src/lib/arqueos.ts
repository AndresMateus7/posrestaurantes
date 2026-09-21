import { Prisma, type RolUsuario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/lib/realtime";
import { MAX_CANTIDAD, MOTIVO_AJUSTE_MANUAL, calcularAjuste, redondear, resumirLineas } from "@/lib/arqueos-calculo";

// Arqueo (conteo fisico) de inventario. Una persona (caja) cuenta a ciegas: la hoja de conteo no trae
// las cantidades del sistema. Al enviarlo se guarda como estaba el inventario en ese momento y el
// administrador lo revisa: confirma, edita u omite cada linea, y solo entonces se ajusta el stock.

export class ArqueoError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
  }
}

export function errorDeArqueo(error: unknown): { status: number; body: { error: string; codigo: string } } | null {
  if (!(error instanceof ArqueoError)) return null;
  const conflicto = ["linea_no_pendiente", "ya_cerrado"];
  const status = error.codigo === "no_existe" ? 404 : conflicto.includes(error.codigo) ? 409 : 400;
  return { status, body: { error: error.message, codigo: error.codigo } };
}

const num = (v: unknown) => Number(v ?? 0);
const motivoDe = (numero: number) => `Arqueo #${numero}`;

/**
 * Insumos que se venden tal cual (gaseosa, cerveza...): los que son el unico ingrediente de un plato
 * y se descuentan de a una unidad por venta. Solo sirve para separarlos en la hoja de conteo.
 */
function ingredientesDeVentaDirecta(
  ingredientes: { id: string; unidadMedida: string }[],
  productos: { ingredientes: { ingredienteId: string; cantidadUsada: unknown }[] }[]
) {
  const unidad = new Map(ingredientes.map((i) => [i.id, i.unidadMedida]));
  const directos = new Set<string>();
  for (const p of productos) {
    const [unico] = p.ingredientes;
    if (p.ingredientes.length === 1 && num(unico.cantidadUsada) === 1 && unidad.get(unico.ingredienteId) === "unidad") directos.add(unico.ingredienteId);
  }
  return directos;
}

/** Lo que ve quien cuenta: solo nombre, unidad y ubicacion. Nada de cantidades, minimos ni costos. */
export async function hojaDeConteo(restauranteId: string) {
  const [ingredientes, productos] = await Promise.all([
    prisma.ingrediente.findMany({ where: { restauranteId }, select: { id: true, nombre: true, unidadMedida: true, ubicacion: true }, orderBy: { nombre: "asc" } }),
    prisma.producto.findMany({ where: { restauranteId }, select: { ingredientes: { select: { ingredienteId: true, cantidadUsada: true } } } }),
  ]);
  const directos = ingredientesDeVentaDirecta(ingredientes, productos);
  return ingredientes.map((i) => ({ ...i, esProducto: directos.has(i.id) }));
}

export async function crearArqueo(restauranteId: string, usuario: { id: string; nombre: string }, datos: { nota?: unknown; lineas?: unknown }) {
  if (!Array.isArray(datos.lineas) || datos.lineas.length === 0) throw new ArqueoError("sin_lineas", "Cuenta al menos un producto antes de enviar el conteo");
  if (datos.lineas.length > 2000) throw new ArqueoError("muchas_lineas", "El conteo tiene demasiados productos");

  const contados = new Map<string, number>();
  for (const l of datos.lineas as { ingredienteId?: unknown; cantidad?: unknown }[]) {
    const id = l?.ingredienteId;
    const c = l?.cantidad;
    if (typeof id !== "string" || typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > MAX_CANTIDAD) throw new ArqueoError("cantidad_invalida", "Hay una cantidad que no es válida");
    if (contados.has(id)) throw new ArqueoError("linea_repetida", "Un producto aparece dos veces en el conteo");
    contados.set(id, redondear(c));
  }
  const nota = typeof datos.nota === "string" ? datos.nota.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;

  const arqueo = await prisma.$transaction(
    async (tx) => {
      const ingredientes = await tx.ingrediente.findMany({ where: { restauranteId }, orderBy: { nombre: "asc" } });
      const ids = new Set(ingredientes.map((i) => i.id));
      for (const id of contados.keys()) {
        if (!ids.has(id)) throw new ArqueoError("ingrediente_no_existe", "Uno de los productos ya no está en el inventario: actualiza la pantalla y cuenta de nuevo");
      }
      const productos = await tx.producto.findMany({ where: { restauranteId }, select: { ingredientes: { select: { ingredienteId: true, cantidadUsada: true } } } });
      const directos = ingredientesDeVentaDirecta(ingredientes, productos);

      // "esperado" es lo que decia el sistema justo ahora: la foto del inventario en el momento del conteo.
      return tx.arqueoInventario.create({
        data: {
          restauranteId,
          creadoPorId: usuario.id,
          creadoPorNombre: usuario.nombre,
          nota,
          lineas: {
            createMany: {
              data: ingredientes.map((i) => ({
                ingredienteId: i.id,
                nombre: i.nombre,
                unidadMedida: i.unidadMedida,
                ubicacion: i.ubicacion,
                esProducto: directos.has(i.id),
                costoUnidad: i.costoUnidad,
                stockMinimo: i.stockMinimo,
                esperado: i.stockActual,
                contado: contados.get(i.id) ?? null,
                estado: contados.has(i.id) ? ("pendiente" as const) : ("sin_contar" as const),
              })),
            },
          },
        },
        select: { id: true, numero: true },
      });
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

  emitirEvento(restauranteId, "arqueo-enviado", { id: arqueo.id, numero: arqueo.numero, por: usuario.nombre });
  return { id: arqueo.id, numero: arqueo.numero, contados: contados.size };
}

/** Cuantos conteos esperan al administrador (para el aviso en su panel). */
export function contarPendientes(restauranteId: string) {
  return prisma.arqueoInventario.count({ where: { restauranteId, estado: "pendiente" } });
}

/**
 * Lista de conteos. El administrador los ve con su resumen (semaforo y valor de la diferencia); quien
 * cuenta solo ve los suyos, con fecha y estado: nunca las diferencias, porque el conteo es a ciegas.
 */
export async function listarArqueos(restauranteId: string, usuario: { id: string; rol: RolUsuario }) {
  const esAdmin = usuario.rol === "admin";
  const arqueos = await prisma.arqueoInventario.findMany({
    where: { restauranteId, ...(esAdmin ? {} : { creadoPorId: usuario.id }) },
    orderBy: { creadoEn: "desc" },
    take: 40,
    include: { lineas: { select: { unidadMedida: true, esperado: true, contado: true, costoUnidad: true, estado: true } } },
  });

  return arqueos.map((a) => {
    const base = { id: a.id, numero: a.numero, creadoEn: a.creadoEn, creadoPorNombre: a.creadoPorNombre, nota: a.nota, estado: a.estado, cerradoEn: a.cerradoEn };
    const contados = a.lineas.filter((l) => l.contado !== null).length;
    if (!esAdmin) return { ...base, contados, total: a.lineas.length };
    return {
      ...base,
      contados,
      total: a.lineas.length,
      pendientes: a.lineas.filter((l) => l.estado === "pendiente").length,
      resumen: resumirLineas(a.lineas.map((l) => ({ unidadMedida: l.unidadMedida, esperado: num(l.esperado), contado: l.contado === null ? null : num(l.contado), costoUnidad: l.costoUnidad }))),
    };
  });
}

/**
 * Ajustes hechos a mano (o por otros conteos) despues de `desde`, por insumo: son correcciones que ya
 * cambiaron el stock, asi que al confirmar un conteo no se vuelven a aplicar.
 */
async function ajustesDespuesDe(ingredienteIds: string[], desde: Date, numeroArqueo: number) {
  const porInsumo = new Map<string, number>();
  if (ingredienteIds.length === 0) return porInsumo;
  const movimientos = await prisma.movimientoInventario.findMany({
    where: {
      ingredienteId: { in: ingredienteIds },
      creadoEn: { gt: desde },
      OR: [{ tipo: "ajuste" }, { motivo: { startsWith: MOTIVO_AJUSTE_MANUAL } }],
    },
    select: { ingredienteId: true, tipo: true, cantidad: true, motivo: true },
  });
  for (const m of movimientos) {
    // Lo que aplico este mismo conteo no cuenta (esas lineas ya estan resueltas).
    if (m.motivo === motivoDe(numeroArqueo)) continue;
    const cantidad = num(m.cantidad);
    porInsumo.set(m.ingredienteId, redondear((porInsumo.get(m.ingredienteId) ?? 0) + (m.tipo === "salida" ? -cantidad : cantidad)));
  }
  return porInsumo;
}

/** Informe completo para el administrador: como estaba el inventario al contar, lo contado y como esta ahora. */
export async function detalleArqueo(restauranteId: string, id: string) {
  const a = await prisma.arqueoInventario.findUnique({ where: { id }, include: { lineas: { orderBy: [{ ubicacion: "asc" }, { nombre: "asc" }] } } });
  if (!a || a.restauranteId !== restauranteId) throw new ArqueoError("no_existe", "Ese conteo no existe");

  const ids = a.lineas.map((l) => l.ingredienteId).filter((x): x is string => !!x);
  const [stocks, ajustes] = await Promise.all([
    prisma.ingrediente.findMany({ where: { id: { in: ids } }, select: { id: true, stockActual: true } }),
    ajustesDespuesDe(ids, a.creadoEn, a.numero),
  ]);
  const stockPorId = new Map(stocks.map((s) => [s.id, num(s.stockActual)]));

  const lineas = a.lineas.map((l) => ({
    id: l.id,
    nombre: l.nombre,
    unidadMedida: l.unidadMedida,
    ubicacion: l.ubicacion,
    esProducto: l.esProducto,
    costoUnidad: l.costoUnidad,
    stockMinimo: num(l.stockMinimo),
    esperado: num(l.esperado),
    contado: l.contado === null ? null : num(l.contado),
    estado: l.estado,
    cantidadFinal: l.cantidadFinal === null ? null : num(l.cantidadFinal),
    ajuste: l.ajuste === null ? null : num(l.ajuste),
    // null = el insumo ya no existe en el inventario.
    stockAhora: l.ingredienteId ? (stockPorId.get(l.ingredienteId) ?? null) : null,
    ajustesDespues: l.ingredienteId ? (ajustes.get(l.ingredienteId) ?? 0) : 0,
  }));

  return {
    id: a.id,
    numero: a.numero,
    creadoEn: a.creadoEn,
    creadoPorNombre: a.creadoPorNombre,
    nota: a.nota,
    estado: a.estado,
    cerradoEn: a.cerradoEn,
    cerradoPorNombre: a.cerradoPorNombre,
    resumen: resumirLineas(lineas.map((l) => ({ unidadMedida: l.unidadMedida, esperado: l.esperado, contado: l.contado, costoUnidad: l.costoUnidad }))),
    lineas,
  };
}

export type AccionLinea = { lineaId: string; accion: "confirmar" | "editar" | "omitir"; cantidad?: number };

/**
 * Resuelve lineas del conteo: "confirmar" aplica lo contado, "editar" aplica otra cantidad y "omitir"
 * deja el inventario como esta. Con `todo` confirma todo lo pendiente. Se ajusta sumando la diferencia
 * al stock de ahora (ver calcularAjuste), y cada linea se reclama con un UPDATE condicional: si dos
 * administradores resuelven la misma a la vez, uno gana y el otro recibe un error sin aplicar nada.
 */
export async function resolverArqueo(restauranteId: string, usuario: { id: string; nombre: string }, arqueoId: string, entrada: { todo?: unknown; acciones?: unknown }) {
  const arqueo = await prisma.arqueoInventario.findUnique({ where: { id: arqueoId }, include: { lineas: true } });
  if (!arqueo || arqueo.restauranteId !== restauranteId) throw new ArqueoError("no_existe", "Ese conteo no existe");
  if (arqueo.estado === "cerrado") throw new ArqueoError("ya_cerrado", "Ese conteo ya está cerrado");

  const pendientes = new Map(arqueo.lineas.filter((l) => l.estado === "pendiente").map((l) => [l.id, l]));
  let acciones: AccionLinea[];
  if (entrada.todo === true) {
    acciones = [...pendientes.keys()].map((lineaId) => ({ lineaId, accion: "confirmar" as const }));
  } else {
    if (!Array.isArray(entrada.acciones)) throw new ArqueoError("accion_invalida", "No se indicó qué hacer con el conteo");
    acciones = entrada.acciones as AccionLinea[];
  }
  if (acciones.length === 0) throw new ArqueoError("sin_acciones", "No hay líneas pendientes por resolver");
  if (acciones.length > 2000) throw new ArqueoError("accion_invalida", "Son demasiadas líneas a la vez");

  const vistas = new Set<string>();
  for (const a of acciones) {
    if (!a || typeof a.lineaId !== "string" || !["confirmar", "editar", "omitir"].includes(a.accion)) throw new ArqueoError("accion_invalida", "Hay una acción que no es válida");
    if (vistas.has(a.lineaId)) throw new ArqueoError("accion_invalida", "Una línea aparece dos veces");
    vistas.add(a.lineaId);
    if (!pendientes.has(a.lineaId)) throw new ArqueoError("linea_no_pendiente", "Una de esas líneas ya se resolvió o no es de este conteo");
    if (a.accion === "editar" && (typeof a.cantidad !== "number" || !Number.isFinite(a.cantidad) || a.cantidad < 0 || a.cantidad > MAX_CANTIDAD)) {
      throw new ArqueoError("cantidad_invalida", "La cantidad que escribiste no es válida");
    }
  }

  // Lo necesario para calcular, leido una sola vez (la transaccion queda con pocas consultas).
  const conAjuste = acciones.filter((a) => a.accion !== "omitir").map((a) => pendientes.get(a.lineaId)!.ingredienteId).filter((x): x is string => !!x);
  const [stocks, ajustes] = await Promise.all([
    prisma.ingrediente.findMany({ where: { id: { in: conAjuste } }, select: { id: true, stockActual: true } }),
    ajustesDespuesDe(conAjuste, arqueo.creadoEn, arqueo.numero),
  ]);
  const stockPorId = new Map(stocks.map((s) => [s.id, num(s.stockActual)]));

  // Todo se calcula antes de la transaccion; adentro quedan unas pocas sentencias por lotes, sin importar
  // cuantas lineas sean (con una por linea, un conteo de 150 productos tardaba 40 segundos).
  type Resolucion = { id: string; estado: "confirmada" | "editada" | "omitida"; final: number | null; ajuste: number | null };
  const resoluciones: Resolucion[] = [];
  const cambiosStock: { ingredienteId: string; delta: number }[] = [];
  for (const a of acciones) {
    const l = pendientes.get(a.lineaId)!;
    if (a.accion === "omitir") {
      resoluciones.push({ id: l.id, estado: "omitida", final: null, ajuste: null });
      continue;
    }
    const contado = num(l.contado);
    const final = a.accion === "editar" ? redondear(a.cantidad as number) : contado;
    const stockAhora = l.ingredienteId ? stockPorId.get(l.ingredienteId) : undefined;
    const delta =
      l.ingredienteId && stockAhora !== undefined ? calcularAjuste({ esperado: num(l.esperado), final, stockAhora, ajustesDespues: ajustes.get(l.ingredienteId) ?? 0 }).delta : 0;
    resoluciones.push({ id: l.id, estado: final !== contado ? "editada" : "confirmada", final, ajuste: delta });
    if (delta !== 0 && l.ingredienteId) cambiosStock.push({ ingredienteId: l.ingredienteId, delta });
  }

  const cambios: { ingredienteId: string; stockActual: number }[] = [];
  await prisma.$transaction(
    async (tx) => {
      const ahora = new Date();

      // 1) Se reclaman todas las lineas en un solo UPDATE condicional (solo las que siguen pendientes). Si
      //    otro administrador ya resolvio alguna, el conteo no coincide y se deshace todo sin aplicar nada.
      const valoresLineas = Prisma.join(resoluciones.map((r) => Prisma.sql`(${r.id}::text, ${r.estado}::"EstadoLineaArqueo", ${r.final}::numeric, ${r.ajuste}::numeric)`));
      const reclamadas = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE lineas_arqueo_inventario AS l
           SET estado = v.estado, cantidad_final = v.final, ajuste = v.ajuste, resuelto_en = ${ahora}
          FROM (VALUES ${valoresLineas}) AS v(id, estado, final, ajuste)
         WHERE l.id = v.id AND l.estado = 'pendiente'
     RETURNING l.id`);
      if (reclamadas.length !== resoluciones.length) throw new ArqueoError("linea_no_pendiente", "Otra persona ya resolvió una de esas líneas");

      // 2) Stock: se suman las diferencias (incremento atomico: no pisa ventas que entren al mismo tiempo).
      if (cambiosStock.length > 0) {
        const valoresStock = Prisma.join(cambiosStock.map((c) => Prisma.sql`(${c.ingredienteId}::text, ${c.delta}::numeric)`));
        const actualizados = await tx.$queryRaw<{ id: string; stock_actual: unknown }[]>(Prisma.sql`
          UPDATE ingredientes AS i
             SET stock_actual = i.stock_actual + v.delta, actualizado_en = ${ahora}
            FROM (VALUES ${valoresStock}) AS v(id, delta)
           WHERE i.id = v.id
       RETURNING i.id, i.stock_actual`);
        for (const a of actualizados) cambios.push({ ingredienteId: a.id, stockActual: num(a.stock_actual) });
        await tx.movimientoInventario.createMany({
          data: cambiosStock.map((c) => ({ ingredienteId: c.ingredienteId, tipo: "ajuste" as const, cantidad: c.delta, motivo: motivoDe(arqueo.numero), usuarioId: usuario.id })),
        });
      }

      const quedan = await tx.lineaArqueoInventario.count({ where: { arqueoId, estado: "pendiente" } });
      if (quedan === 0) await tx.arqueoInventario.update({ where: { id: arqueoId }, data: { estado: "cerrado", cerradoEn: ahora, cerradoPorNombre: usuario.nombre } });
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  for (const c of cambios) emitirEvento(restauranteId, "inventario-actualizado", c);
  emitirEvento(restauranteId, "arqueo-actualizado", { id: arqueoId });
  return detalleArqueo(restauranteId, arqueoId);
}
