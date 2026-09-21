"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventos } from "@/lib/useEventos";
import { leerCantidad, opcionesDeUnidad, redondear } from "@/lib/arqueos-calculo";

// Arqueo (conteo fisico) de inventario, hecho a ciegas: aqui NO aparece cuanto dice el sistema que hay ni
// si sobra o falta. La persona cuenta y escribe; el administrador recibe el conteo y lo revisa.

type ItemHoja = { id: string; nombre: string; unidadMedida: string; ubicacion: string | null; esProducto: boolean };
type Valor = { cantidad: string; unidad: number };
type ConteoEnviado = { id: string; numero: number; creadoEn: string; estado: "pendiente" | "cerrado"; contados: number; total: number; nota: string | null };
type Filtro = "todos" | "productos" | "insumos" | "sin_contar";

const CLAVE_BORRADOR = "arqueo-borrador-v1";

function leerBorrador(items: ItemHoja[]): { valores: Record<string, Valor>; nota: string } {
  try {
    const crudo = window.localStorage.getItem(CLAVE_BORRADOR);
    if (!crudo) return { valores: {}, nota: "" };
    const b = JSON.parse(crudo) as { valores?: Record<string, Valor>; nota?: string };
    const validos = new Set(items.map((i) => i.id));
    const valores: Record<string, Valor> = {};
    for (const [id, v] of Object.entries(b.valores ?? {})) {
      if (validos.has(id) && typeof v?.cantidad === "string") valores[id] = { cantidad: v.cantidad, unidad: Number.isInteger(v.unidad) ? v.unidad : 0 };
    }
    return { valores, nota: typeof b.nota === "string" ? b.nota : "" };
  } catch {
    return { valores: {}, nota: "" };
  }
}

const formatoFechaHora = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

export function ArqueoInventarioTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [items, setItems] = useState<ItemHoja[] | null>(null);
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [nota, setNota] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ numero: number } | null>(null);
  const [conteos, setConteos] = useState<ConteoEnviado[]>([]);

  const cargarConteos = useCallback(() => {
    fetch("/api/arqueos-inventario")
      .then((r) => r.json())
      .then((lista: unknown) => {
        if (Array.isArray(lista)) setConteos(lista as ConteoEnviado[]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/arqueos-inventario/hoja")
      .then((r) => r.json())
      .then((lista: ItemHoja[]) => {
        if (!Array.isArray(lista)) return;
        // Se ordena por ubicacion (lo que esta junto se cuenta junto) y luego por nombre.
        lista.sort((a, b) => (a.ubicacion ?? "￿").localeCompare(b.ubicacion ?? "￿", "es") || a.nombre.localeCompare(b.nombre, "es"));
        const borrador = leerBorrador(lista);
        setItems(lista);
        setValores(borrador.valores);
        setNota(borrador.nota);
      });
    cargarConteos();
  }, [cargarConteos]);

  // Cuando el administrador revisa un conteo, se actualiza el estado en "Mis conteos".
  useEventos({ "arqueo-actualizado": () => cargarConteos() });

  // El borrador se guarda en este equipo: un conteo largo no se pierde si se recarga la pantalla.
  useEffect(() => {
    if (items === null) return;
    try {
      if (Object.keys(valores).length === 0 && nota === "") window.localStorage.removeItem(CLAVE_BORRADOR);
      else window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ valores, nota }));
    } catch {
      // sin almacenamiento: el conteo sigue funcionando, solo que sin borrador
    }
  }, [valores, nota, items]);

  const estadoDe = useCallback(
    (it: ItemHoja) => {
      const v = valores[it.id];
      return v ? leerCantidad(v.cantidad) : "vacio";
    },
    [valores]
  );

  const resumen = useMemo(() => {
    if (!items) return { contados: 0, invalidos: 0 };
    let contados = 0;
    let invalidos = 0;
    for (const it of items) {
      const e = estadoDe(it);
      if (e === "invalido") invalidos++;
      else if (e !== "vacio") contados++;
    }
    return { contados, invalidos };
  }, [items, estadoDe]);

  const visibles = useMemo(() => {
    if (!items) return [];
    const q = busqueda.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !it.nombre.toLowerCase().includes(q) && !(it.ubicacion ?? "").toLowerCase().includes(q)) return false;
      if (filtro === "productos") return it.esProducto;
      if (filtro === "insumos") return !it.esProducto;
      if (filtro === "sin_contar") return estadoDe(it) === "vacio";
      return true;
    });
  }, [items, busqueda, filtro, estadoDe]);

  function cambiarCantidad(it: ItemHoja, texto: string) {
    setValores((prev) => ({ ...prev, [it.id]: { cantidad: texto, unidad: prev[it.id]?.unidad ?? 0 } }));
  }
  function cambiarUnidad(it: ItemHoja, indice: number) {
    setValores((prev) => ({ ...prev, [it.id]: { cantidad: prev[it.id]?.cantidad ?? "", unidad: indice } }));
  }

  function borrarTodo() {
    if (!window.confirm("¿Borrar todo lo que has escrito en este conteo?")) return;
    setValores({});
    setNota("");
  }

  async function enviar() {
    if (!items) return;
    if (resumen.invalidos > 0) {
      onCambio(`Hay ${resumen.invalidos} cantidad(es) mal escrita(s): revisa las que están en rojo (solo números; los decimales con coma, como 1,5, y sin puntos de miles)`);
      return;
    }
    const lineas: { ingredienteId: string; cantidad: number }[] = [];
    for (const it of items) {
      const v = valores[it.id];
      const n = v ? leerCantidad(v.cantidad) : "vacio";
      if (typeof n !== "number") continue;
      const factor = opcionesDeUnidad(it.unidadMedida)[v?.unidad ?? 0]?.factor ?? 1;
      lineas.push({ ingredienteId: it.id, cantidad: redondear(n * factor) });
    }
    if (lineas.length === 0) {
      onCambio("Escribe la cantidad de al menos un producto");
      return;
    }
    const sinContar = items.length - lineas.length;
    const pregunta =
      sinContar > 0
        ? `Faltan ${sinContar} producto(s) sin contar: quedarán como "sin contar" y no se ajustarán. ¿Enviar el conteo al administrador de todas formas?`
        : "¿Enviar el conteo al administrador?";
    if (!window.confirm(pregunta)) return;

    setEnviando(true);
    try {
      const res = await fetch("/api/arqueos-inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nota, lineas }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onCambio(data.error ?? "No se pudo enviar el conteo");
        return;
      }
      setValores({});
      setNota("");
      setEnviado({ numero: data.numero });
      cargarConteos();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setEnviando(false);
    }
  }

  if (items === null) return <p className="text-sm opacity-60">Cargando la hoja de conteo…</p>;

  const porcentaje = items.length ? Math.round((resumen.contados / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {enviado && (
        <div className="bg-green-50 border border-green-300 text-green-900 rounded-2xl p-4 text-sm">
          <p className="font-semibold">✅ Conteo #{enviado.numero} enviado al administrador</p>
          <p className="text-xs mt-0.5">Él lo va a revisar y, si todo está bien, ajusta el inventario. Puedes empezar otro conteo cuando quieras.</p>
          <button onClick={() => setEnviado(null)} className="text-xs font-semibold underline mt-2">
            Entendido
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <h2 className="font-semibold">📋 Arqueo de inventario</h2>
        <p className="text-xs opacity-70 mt-1">
          Cuenta lo que hay de cada producto e insumo y escribe la cantidad. <b>No verás lo que dice el sistema</b>: el administrador recibe el conteo y lo revisa. Si no queda nada, escribe <b>0</b>; los que dejes
          en blanco quedan &ldquo;sin contar&rdquo; y no se ajustan. En los que se pesan o miden puedes elegir kg/g o L/ml.
        </p>
        <div className="mt-3">
          <div className="flex flex-wrap justify-between gap-x-3 text-xs">
            <span>
              Contados <b>{resumen.contados}</b> de {items.length}
            </span>
            <span className="opacity-50">Se guarda solo en este equipo mientras cuentas</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${porcentaje}%`, background: "var(--color-primario)" }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar producto o ubicación"
            className="flex-1 min-w-32 border border-gray-300 rounded-full px-4 py-2 text-sm"
          />
          {(
            [
              ["todos", "Todos"],
              ["productos", "Productos"],
              ["insumos", "Insumos"],
              ["sin_contar", "Sin contar"],
            ] as const
          ).map(([id, nombre]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${filtro === id ? "bg-gray-900 text-white" : "border border-gray-300"}`}>
              {nombre}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm opacity-60">Todavía no hay productos ni insumos en el inventario. El administrador debe agregarlos primero.</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {visibles.map((it, indice) => {
            // Un titulo de ubicacion cada vez que cambia (la lista ya viene ordenada por ubicacion).
            const encabezado = indice === 0 || visibles[indice - 1].ubicacion !== it.ubicacion;
            const e = estadoDe(it);
            const opciones = opcionesDeUnidad(it.unidadMedida);
            const v = valores[it.id];
            return (
              <div key={it.id}>
                {encabezado && <p className="bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">📍 {it.ubicacion ?? "Sin ubicación"}</p>}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.nombre}</p>
                    <p className="text-[11px] opacity-50">{it.esProducto ? "Producto de venta directa" : "Insumo"}</p>
                  </div>
                  <input
                    value={v?.cantidad ?? ""}
                    onChange={(ev) => cambiarCantidad(it, ev.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`Cantidad de ${it.nombre}`}
                    aria-invalid={e === "invalido"}
                    className={`w-24 border rounded-lg px-2 py-1.5 text-sm text-right ${e === "invalido" ? "border-red-500 bg-red-50" : e === "vacio" ? "border-gray-300" : "border-green-400 bg-green-50"}`}
                  />
                  {opciones.length > 1 ? (
                    <select value={v?.unidad ?? 0} onChange={(ev) => cambiarUnidad(it, Number(ev.target.value))} aria-label={`Unidad de ${it.nombre}`} className="border border-gray-300 rounded-lg px-1.5 py-1.5 text-sm w-16">
                      {opciones.map((o, i) => (
                        <option key={o.etiqueta} value={i}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm opacity-60 w-16">{it.unidadMedida}</span>
                  )}
                </div>
              </div>
            );
          })}
          {visibles.length === 0 && <p className="px-4 py-8 text-center text-sm opacity-50">Ningún producto coincide con la búsqueda.</p>}
        </div>
      )}

      {/* Barra fija abajo: con una lista larga, el boton de enviar siempre queda a la mano. */}
      <div className="sticky z-10 bg-white rounded-2xl shadow-lg border border-gray-200 p-3 space-y-2" style={{ bottom: 12 }}>
        <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Nota para el administrador (opcional). Ej: conteo de cierre" aria-label="Nota para el administrador" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={enviar} disabled={enviando || resumen.contados === 0} className="text-sm font-semibold text-white rounded-full px-5 py-2.5 disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
            {enviando ? "Enviando…" : `Enviar conteo (${resumen.contados} de ${items.length})`}
          </button>
          <button onClick={borrarTodo} disabled={resumen.contados === 0 && nota === ""} className="text-sm font-semibold border border-gray-300 rounded-full px-4 py-2.5 disabled:opacity-40">
            Borrar lo escrito
          </button>
        </div>
      </div>

      {conteos.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Mis conteos enviados</h3>
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {conteos.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-semibold w-16 shrink-0">#{c.numero}</span>
                <span className="text-xs opacity-60 flex-1 truncate">
                  {formatoFechaHora(c.creadoEn)} · {c.contados} de {c.total} contados{c.nota ? ` · ${c.nota}` : ""}
                </span>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${c.estado === "cerrado" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {c.estado === "cerrado" ? "Revisado" : "Por revisar"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
