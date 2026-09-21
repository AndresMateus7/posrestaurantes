"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventos } from "@/lib/useEventos";
import { formatoCOP } from "@/lib/precios";
import { calcularAjuste, formatoCantidad, leerCantidad, nivelStock, opcionesDeUnidad, redondear, semaforoDiferencia, type ResumenArqueo, type Semaforo } from "@/lib/arqueos-calculo";

// Informe del arqueo de inventario para el administrador: como estaba el inventario cuando la persona de
// caja lo conto, lo que conto, la diferencia con semaforo, y cada linea se confirma, se edita o se omite.
// Solo al confirmar se ajusta el stock.

type EstadoLinea = "pendiente" | "confirmada" | "editada" | "omitida" | "sin_contar";
type ArqueoLista = {
  id: string;
  numero: number;
  creadoEn: string;
  creadoPorNombre: string;
  nota: string | null;
  estado: "pendiente" | "cerrado";
  cerradoEn: string | null;
  contados: number;
  total: number;
  pendientes: number;
  resumen: ResumenArqueo;
};
type LineaDetalle = {
  id: string;
  nombre: string;
  unidadMedida: string;
  ubicacion: string | null;
  esProducto: boolean;
  costoUnidad: number;
  stockMinimo: number;
  esperado: number;
  contado: number | null;
  estado: EstadoLinea;
  cantidadFinal: number | null;
  ajuste: number | null;
  stockAhora: number | null;
  ajustesDespues: number;
};
type Detalle = Omit<ArqueoLista, "contados" | "total" | "pendientes"> & { cerradoPorNombre: string | null; lineas: LineaDetalle[] };
type Filtro = "todas" | "diferencias" | "rojas" | "pendientes";

const COLOR: Record<Semaforo, string> = { verde: "#16a34a", amarillo: "#f59e0b", rojo: "#dc2626" };
const ETIQUETA_SEMAFORO: Record<Semaforo, string> = { verde: "Coincide", amarillo: "Diferencia leve", rojo: "Diferencia importante" };
const ORDEN_SEMAFORO: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };
const NIVEL: Record<string, { texto: string; clase: string }> = {
  agotado: { texto: "Agotado", clase: "bg-red-100 text-red-800" },
  bajo: { texto: "Bajo", clase: "bg-amber-100 text-amber-800" },
  ok: { texto: "OK", clase: "bg-green-100 text-green-800" },
};

const formatoFechaHora = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const conSigno = (n: number, unidad: string) => (n > 0 ? "+" : n < 0 ? "−" : "") + formatoCantidad(Math.abs(n), unidad);

function Punto({ semaforo }: { semaforo: Semaforo }) {
  return <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: COLOR[semaforo] }} title={ETIQUETA_SEMAFORO[semaforo]} aria-label={ETIQUETA_SEMAFORO[semaforo]} role="img" />;
}

function ChipsResumen({ r }: { r: ResumenArqueo }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1"><Punto semaforo="verde" />{r.verdes}</span>
      <span className="inline-flex items-center gap-1"><Punto semaforo="amarillo" />{r.amarillos}</span>
      <span className="inline-flex items-center gap-1"><Punto semaforo="rojo" />{r.rojos}</span>
      {r.sinContar > 0 && <span className="opacity-50">· {r.sinContar} sin contar</span>}
    </span>
  );
}

export function ArqueosInventarioTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [lista, setLista] = useState<ArqueoLista[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<{ lineaId: string; texto: string; unidad: number } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargarLista = useCallback(() => {
    fetch("/api/arqueos-inventario")
      .then((r) => r.json())
      .then((l: unknown) => {
        if (Array.isArray(l)) setLista(l as ArqueoLista[]);
      })
      .catch(() => undefined);
  }, []);

  const cargarDetalle = useCallback((id: string) => {
    fetch(`/api/arqueos-inventario/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.lineas)) setDetalle(d as Detalle);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  useEventos({
    "arqueo-enviado": () => cargarLista(),
    "arqueo-actualizado": () => {
      cargarLista();
      if (abierto) cargarDetalle(abierto);
    },
    "inventario-actualizado": () => {
      if (abierto) cargarDetalle(abierto);
    },
  });

  function abrir(id: string) {
    setAbierto(id);
    setDetalle(null);
    setEditando(null);
    setFiltro("todas");
    setBusqueda("");
    cargarDetalle(id);
  }

  function volver() {
    setAbierto(null);
    setDetalle(null);
    setEditando(null);
    cargarLista();
  }

  async function resolver(cuerpo: { todo: true } | { acciones: { lineaId: string; accion: "confirmar" | "editar" | "omitir"; cantidad?: number }[] }, mensaje: string) {
    if (!abierto) return;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/arqueos-inventario/${abierto}/resolver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onCambio(data.error ?? "No se pudo aplicar");
        cargarDetalle(abierto);
        return;
      }
      setDetalle(data as Detalle);
      setEditando(null);
      cargarLista();
      onCambio(mensaje);
    } finally {
      setTrabajando(false);
    }
  }

  function confirmarTodo(d: Detalle) {
    const pendientes = d.lineas.filter((l) => l.estado === "pendiente" && l.stockAhora !== null);
    const conDif = pendientes.filter((l) => l.contado !== null && redondear(l.contado - l.esperado) !== 0).length;
    if (!window.confirm(`Se va a ajustar el inventario con lo contado en ${pendientes.length} producto(s) (${conDif} con diferencia). ¿Confirmar?`)) return;
    resolver({ todo: true }, "Conteo confirmado: inventario ajustado ✅");
  }

  function aplicarEdicion(l: LineaDetalle) {
    if (!editando) return;
    const n = leerCantidad(editando.texto);
    if (typeof n !== "number") {
      onCambio("Escribe una cantidad válida (solo números)");
      return;
    }
    const factor = opcionesDeUnidad(l.unidadMedida)[editando.unidad]?.factor ?? 1;
    resolver({ acciones: [{ lineaId: l.id, accion: "editar", cantidad: redondear(n * factor) }] }, `${l.nombre}: inventario ajustado ✅`);
  }

  const lineasVisibles = useMemo(() => {
    if (!detalle) return [];
    const q = busqueda.trim().toLowerCase();
    return detalle.lineas
      .map((l) => {
        const semaforo = l.contado === null ? null : semaforoDiferencia(l.esperado, l.contado, l.unidadMedida);
        return { l, semaforo, dif: l.contado === null ? null : redondear(l.contado - l.esperado) };
      })
      .filter(({ l, semaforo, dif }) => {
        if (q && !l.nombre.toLowerCase().includes(q) && !(l.ubicacion ?? "").toLowerCase().includes(q)) return false;
        if (filtro === "diferencias") return dif !== null && dif !== 0;
        if (filtro === "rojas") return semaforo === "rojo";
        if (filtro === "pendientes") return l.estado === "pendiente";
        return true;
      })
      .sort((a, b) => (a.semaforo ? ORDEN_SEMAFORO[a.semaforo] : 3) - (b.semaforo ? ORDEN_SEMAFORO[b.semaforo] : 3) || a.l.nombre.localeCompare(b.l.nombre, "es"));
  }, [detalle, filtro, busqueda]);

  // ---------- Lista de conteos ----------
  if (!abierto) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="font-semibold">📋 Arqueos de inventario</h2>
          <p className="text-xs opacity-70 mt-1 max-w-3xl">
            Aquí llegan los conteos físicos que hace Caja (a ciegas, sin ver el inventario del sistema). Abre uno para ver cómo estaba el inventario cuando lo contaron, lo que contaron y la diferencia con semáforo. Tú
            confirmas, editas u omites cada producto, o confirmas todo de una vez: solo entonces se ajusta el inventario.
          </p>
        </div>

        {lista === null && <p className="text-sm opacity-60">Cargando…</p>}
        {lista?.length === 0 && <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm opacity-60">Todavía no hay conteos. Cuando Caja envíe uno, te avisa aquí.</div>}

        {lista && lista.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
            {lista.map((a) => (
              <button key={a.id} onClick={() => abrir(a.id)} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50">
                <span className="font-semibold w-14 shrink-0">#{a.numero}</span>
                <span className="text-sm min-w-0">
                  {formatoFechaHora(a.creadoEn)}
                  <span className="block text-xs opacity-60 truncate">
                    {a.creadoPorNombre} · {a.contados} de {a.total} contados{a.nota ? ` · ${a.nota}` : ""}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-4">
                  <ChipsResumen r={a.resumen} />
                  {(a.resumen.faltante > 0 || a.resumen.sobrante > 0) && (
                    <span className="text-xs opacity-70 hidden sm:inline">
                      {a.resumen.faltante > 0 && <>Falta {formatoCOP(a.resumen.faltante)}</>}
                      {a.resumen.faltante > 0 && a.resumen.sobrante > 0 && " · "}
                      {a.resumen.sobrante > 0 && <>Sobra {formatoCOP(a.resumen.sobrante)}</>}
                    </span>
                  )}
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${a.estado === "cerrado" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                    {a.estado === "cerrado" ? "Cerrado" : `Por revisar (${a.pendientes})`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- Informe de un conteo ----------
  if (!detalle) {
    return (
      <div className="space-y-3">
        <button onClick={volver} className="text-sm font-semibold underline">
          ← Todos los conteos
        </button>
        <p className="text-sm opacity-60">Cargando el informe…</p>
      </div>
    );
  }

  const r = detalle.resumen;
  const pendientes = detalle.lineas.filter((l) => l.estado === "pendiente").length;
  const cerrado = detalle.estado === "cerrado";

  return (
    <div className="space-y-4">
      <button onClick={volver} className="text-sm font-semibold underline">
        ← Todos los conteos
      </button>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Conteo #{detalle.numero}</h2>
            <p className="text-xs opacity-70">
              {formatoFechaHora(detalle.creadoEn)} · contó <b>{detalle.creadoPorNombre}</b>
            </p>
            {detalle.nota && <p className="text-xs bg-amber-50 text-amber-900 rounded-lg px-2 py-1 mt-1.5 inline-block">📝 {detalle.nota}</p>}
          </div>
          <span className={`ml-auto text-xs font-semibold rounded-full px-3 py-1 ${cerrado ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {cerrado ? `Cerrado${detalle.cerradoPorNombre ? ` por ${detalle.cerradoPorNombre}` : ""}` : `Por revisar (${pendientes})`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4 text-center">
          {(
            [
              ["verde", r.verdes, "Coinciden"],
              ["amarillo", r.amarillos, "Diferencia leve"],
              ["rojo", r.rojos, "Diferencia importante"],
            ] as const
          ).map(([s, n, texto]) => (
            <div key={s} className="rounded-xl border p-2.5" style={{ borderColor: COLOR[s] }}>
              <p className="text-2xl font-bold leading-none" style={{ color: COLOR[s] }}>
                {n}
              </p>
              <p className="text-[11px] mt-1 opacity-70">{texto}</p>
            </div>
          ))}
          <div className="rounded-xl border border-gray-200 p-2.5">
            <p className="text-2xl font-bold leading-none">{r.sinContar}</p>
            <p className="text-[11px] mt-1 opacity-70">Sin contar</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-2.5">
            <p className="text-lg font-bold leading-none text-red-700">{formatoCOP(r.faltante)}</p>
            <p className="text-[11px] mt-1 opacity-70">Falta (a costo)</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-2.5">
            <p className="text-lg font-bold leading-none text-blue-700">{formatoCOP(r.sobrante)}</p>
            <p className="text-[11px] mt-1 opacity-70">Sobra (a costo)</p>
          </div>
        </div>

        <p className="text-xs opacity-60 mt-3">
          <b>Sistema al contar</b> es lo que decía el inventario en el momento en que se envió el conteo. Al confirmar, se le suma la diferencia al inventario de <b>ahora</b>: así no se pierden las ventas ni las
          compras que hubo entre el conteo y tu revisión. Hasta 2 % de diferencia en lo que se pesa cuenta como &ldquo;coincide&rdquo;; hasta 10 % es leve.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["todas", "Todas"],
            ["diferencias", "Con diferencia"],
            ["rojas", "Importantes"],
            ["pendientes", "Por revisar"],
          ] as const
        ).map(([id, nombre]) => (
          <button key={id} onClick={() => setFiltro(id)} className={`text-xs font-semibold rounded-full px-3 py-1.5 ${filtro === id ? "bg-gray-900 text-white" : "border border-gray-300 bg-white"}`}>
            {nombre}
          </button>
        ))}
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" aria-label="Buscar en el conteo" className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-40" />
        {!cerrado && pendientes > 0 && (
          <button onClick={() => confirmarTodo(detalle)} disabled={trabajando} className="ml-auto text-sm font-semibold text-white rounded-full px-4 py-2 disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
            {trabajando ? "Aplicando…" : `✓ Confirmar todo lo pendiente (${pendientes})`}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase opacity-60">
            <tr>
              <th className="px-3 py-3">Semáforo</th>
              <th className="px-3 py-3">Producto / insumo</th>
              <th className="px-3 py-3 text-right">Sistema al contar</th>
              <th className="px-3 py-3 text-right">Contado</th>
              <th className="px-3 py-3 text-right">Diferencia</th>
              <th className="px-3 py-3 text-right">Valor</th>
              <th className="px-3 py-3">Nivel</th>
              <th className="px-3 py-3 text-right">Ahora</th>
              <th className="px-3 py-3 text-right">Queda en</th>
              <th className="px-3 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {lineasVisibles.map(({ l, semaforo, dif }) => {
              const pendiente = l.estado === "pendiente";
              const enEdicion = editando?.lineaId === l.id;
              const nEdit = enEdicion ? leerCantidad(editando.texto) : "vacio";
              const factorEdit = enEdicion ? (opcionesDeUnidad(l.unidadMedida)[editando.unidad]?.factor ?? 1) : 1;
              const finalPrevio = enEdicion && typeof nEdit === "number" ? redondear(nEdit * factorEdit) : l.contado;
              const calculo = pendiente && finalPrevio !== null && l.stockAhora !== null ? calcularAjuste({ esperado: l.esperado, final: finalPrevio, stockAhora: l.stockAhora, ajustesDespues: l.ajustesDespues }) : null;
              const cantidadNivel = l.cantidadFinal ?? l.contado;
              const nivel = cantidadNivel !== null ? NIVEL[nivelStock(cantidadNivel, l.stockMinimo)] : null;
              const cambioDesde = l.stockAhora !== null && redondear(l.stockAhora - l.esperado) !== 0;
              return (
                <tr key={l.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-3">
                    {semaforo ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Punto semaforo={semaforo} />
                        <span className="hidden xl:inline">{ETIQUETA_SEMAFORO[semaforo]}</span>
                      </span>
                    ) : (
                      <span className="text-xs opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{l.nombre}</p>
                    <p className="text-[11px] opacity-50">
                      {l.esProducto ? "Producto de venta directa" : "Insumo"}
                      {l.ubicacion ? ` · ${l.ubicacion}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatoCantidad(l.esperado, l.unidadMedida)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {enEdicion ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={editando.texto}
                          onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") aplicarEdicion(l);
                            if (e.key === "Escape") setEditando(null);
                          }}
                          inputMode="decimal"
                          aria-label={`Cantidad real de ${l.nombre}`}
                          className={`w-20 border rounded-lg px-2 py-1 text-sm text-right ${nEdit === "invalido" ? "border-red-500 bg-red-50" : "border-gray-400"}`}
                        />
                        {opcionesDeUnidad(l.unidadMedida).length > 1 ? (
                          <select value={editando.unidad} onChange={(e) => setEditando({ ...editando, unidad: Number(e.target.value) })} aria-label="Unidad" className="border border-gray-300 rounded-lg px-1 py-1 text-sm">
                            {opcionesDeUnidad(l.unidadMedida).map((o, i) => (
                              <option key={o.etiqueta} value={i}>
                                {o.etiqueta}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs opacity-60">{l.unidadMedida}</span>
                        )}
                      </span>
                    ) : l.contado === null ? (
                      <span className="text-xs opacity-40">Sin contar</span>
                    ) : (
                      formatoCantidad(l.contado, l.unidadMedida)
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-medium" style={{ color: dif === null || dif === 0 ? undefined : dif < 0 ? COLOR.rojo : "#1d4ed8" }}>
                    {dif === null ? <span className="opacity-30">—</span> : dif === 0 ? "0" : conSigno(dif, l.unidadMedida)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap text-xs">
                    {dif !== null && dif !== 0 && l.costoUnidad > 0 ? <span className={dif < 0 ? "text-red-700" : "text-blue-700"}>{(dif < 0 ? "−" : "+") + formatoCOP(Math.abs(dif * l.costoUnidad))}</span> : <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-3 py-3">{nivel ? <span className={`text-xs px-2 py-1 rounded-full ${nivel.clase}`}>{nivel.texto}</span> : <span className="text-xs opacity-30">—</span>}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap text-xs">
                    {l.stockAhora === null ? (
                      <span className="text-red-700">Ya no existe</span>
                    ) : cambioDesde ? (
                      <span className="text-amber-700" title="Cambió desde el conteo (ventas, compras o ajustes)">
                        ⚠ {formatoCantidad(l.stockAhora, l.unidadMedida)}
                      </span>
                    ) : (
                      <span className="opacity-60">{formatoCantidad(l.stockAhora, l.unidadMedida)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap text-xs">
                    {pendiente && calculo ? (
                      <span className="font-semibold">{formatoCantidad(calculo.quedaEn, l.unidadMedida)}</span>
                    ) : l.ajuste !== null ? (
                      <span className="opacity-70">{l.ajuste === 0 ? "Sin cambio" : `Ajuste ${conSigno(l.ajuste, l.unidadMedida)}`}</span>
                    ) : (
                      <span className="opacity-30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {pendiente ? (
                      enEdicion ? (
                        <span className="inline-flex gap-1.5">
                          <button onClick={() => aplicarEdicion(l)} disabled={trabajando} className="text-xs font-semibold text-white rounded-full px-3 py-1.5 disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
                            Aplicar
                          </button>
                          <button onClick={() => setEditando(null)} className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5">
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button
                            onClick={() => resolver({ acciones: [{ lineaId: l.id, accion: "confirmar" }] }, `${l.nombre}: inventario ajustado ✅`)}
                            disabled={trabajando || l.stockAhora === null}
                            className="text-xs font-semibold bg-green-600 text-white rounded-full px-3 py-1.5 disabled:opacity-40"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setEditando({ lineaId: l.id, texto: l.contado === null ? "" : String(l.contado), unidad: 0 })}
                            disabled={trabajando || l.stockAhora === null}
                            className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5 disabled:opacity-40"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => resolver({ acciones: [{ lineaId: l.id, accion: "omitir" }] }, `${l.nombre}: se dejó el inventario como estaba`)}
                            disabled={trabajando}
                            className="text-xs font-semibold text-gray-500 rounded-full px-2 py-1.5 disabled:opacity-40"
                          >
                            Omitir
                          </button>
                        </span>
                      )
                    ) : (
                      <span className="text-xs">
                        {l.estado === "confirmada" && <span className="text-green-700 font-semibold">✔ Confirmado</span>}
                        {l.estado === "editada" && <span className="text-blue-700 font-semibold">✎ Editado a {formatoCantidad(l.cantidadFinal ?? 0, l.unidadMedida)}</span>}
                        {l.estado === "omitida" && <span className="opacity-60">Omitido</span>}
                        {l.estado === "sin_contar" && <span className="opacity-40">Sin contar</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {lineasVisibles.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm opacity-50">
                  No hay productos con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
