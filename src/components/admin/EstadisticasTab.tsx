"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Plato = { productoId: string; nombre: string; categoria: string; cantidadVendida: number; ingresos: number };
type Estadisticas = {
  cantidadVentas: number;
  totalVendido: number;
  totalPropinas: number;
  totalCobrado: number;
  ticketPromedio: number;
  ventasPorDia: { fecha: string; total: number }[];
  ventasPorMetodo: Record<string, number>;
  masVendidos: Plato[];
  menosVendidos: Plato[];
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_credito: "Tarjeta crédito",
  tarjeta_debito: "Tarjeta débito",
  nequi: "Nequi",
  daviplata: "Daviplata",
  transferencia: "Transferencia",
};

const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "YYYY-MM-DD" es una fecha de calendario, no un instante -- construirla con
// el constructor numerico (no `new Date(string)`) evita que, en un navegador
// en Colombia (UTC-5), se interprete como UTC y se corra un dia hacia atras.
function fechaLocal(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const formatoFechaCorta = (fecha: string) => fechaLocal(fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

type Preset = "hoy" | "7d" | "30d" | "mes";
const ETIQUETA_PRESET: Record<Preset, string> = { hoy: "Hoy", "7d": "Últimos 7 días", "30d": "Últimos 30 días", mes: "Este mes" };

function rangoPreset(preset: Preset) {
  const hoy = new Date();
  const hasta = isoDia(hoy);
  if (preset === "hoy") return { desde: hasta, hasta };
  if (preset === "7d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: isoDia(d), hasta };
  }
  if (preset === "30d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 29);
    return { desde: isoDia(d), hasta };
  }
  return { desde: isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
}

export function EstadisticasTab() {
  const [preset, setPreset] = useState<Preset | null>("7d");
  const [desde, setDesde] = useState(() => rangoPreset("7d").desde);
  const [hasta, setHasta] = useState(() => rangoPreset("7d").hasta);
  const [datos, setDatos] = useState<Estadisticas | null>(null);

  const cargar = useCallback((desdeV: string, hastaV: string) => {
    // Con offset fijo -05:00 (Colombia no tiene horario de verano) para que el
    // instante sea el mismo sin importar en que huso horario corra el servidor.
    const params = new URLSearchParams({ desde: `${desdeV}T00:00:00-05:00`, hasta: `${hastaV}T23:59:59.999-05:00` });
    fetch(`/api/estadisticas?${params}`)
      .then((r) => r.json())
      .then(setDatos);
  }, []);

  useEffect(() => {
    cargar(desde, hasta);
  }, [desde, hasta, cargar]);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    const r = rangoPreset(p);
    setDesde(r.desde);
    setHasta(r.hasta);
  }

  const maxDia = useMemo(() => Math.max(1, ...(datos?.ventasPorDia.map((d) => d.total) ?? [])), [datos]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        {(Object.keys(ETIQUETA_PRESET) as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => aplicarPreset(p)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 ${preset === p ? "bg-gray-900 text-white" : "border border-gray-300"}`}
          >
            {ETIQUETA_PRESET[p]}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto text-xs">
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => {
              setPreset(null);
              setDesde(e.target.value);
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5"
          />
          <span className="opacity-50">a</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={isoDia(new Date())}
            onChange={(e) => {
              setPreset(null);
              setHasta(e.target.value);
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5"
          />
        </div>
      </div>

      {!datos ? (
        <p className="text-sm opacity-50">Cargando estadísticas…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Ventas" value={String(datos.cantidadVentas)} />
            <Tile label="Total vendido" value={formatoCOP(datos.totalVendido)} />
            <Tile label="Propinas" value={formatoCOP(datos.totalPropinas)} />
            <Tile label="Ticket promedio" value={formatoCOP(datos.ticketPromedio)} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-4">Ventas por día</h3>
            {datos.ventasPorDia.length === 0 ? (
              <p className="text-sm opacity-50">No hay ventas cerradas en este rango.</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {datos.ventasPorDia.map((d) => (
                  <div key={d.fecha} className="flex-1 h-full flex flex-col items-center justify-end group relative min-w-0">
                    <div className="absolute bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-[11px] rounded-md px-2 py-1 z-10">
                      {formatoFechaCorta(d.fecha)} · {formatoCOP(d.total)}
                    </div>
                    <div
                      className="w-full rounded-t-md bg-gray-800 group-hover:bg-gray-700"
                      style={{ height: `${Math.max(3, (d.total / maxDia) * 100)}%` }}
                    />
                    <span className="text-[10px] opacity-50 mt-1 truncate">{d.fecha.slice(8, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <h3 className="w-full text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Ventas por método de pago</h3>
            {Object.keys(datos.ventasPorMetodo).length === 0 ? (
              <span className="opacity-50">Sin pagos en este rango.</span>
            ) : (
              Object.entries(datos.ventasPorMetodo).map(([metodo, monto]) => (
                <span key={metodo}>
                  <span className="opacity-60">{ETIQUETA_METODO[metodo] ?? metodo}:</span> <b>{formatoCOP(monto)}</b>
                </span>
              ))
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <PlatoTabla titulo="🔥 Platos más vendidos" platos={datos.masVendidos} />
            <PlatoTabla titulo="📉 Platos menos vendidos" platos={datos.menosVendidos} />
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-xs uppercase tracking-wide opacity-50">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function PlatoTabla({ titulo, platos }: { titulo: string; platos: Plato[] }) {
  const max = Math.max(1, ...platos.map((p) => p.cantidadVendida));
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-3">{titulo}</h3>
      {platos.length === 0 ? (
        <p className="text-sm opacity-50">Sin datos en este rango.</p>
      ) : (
        <div className="space-y-2.5">
          {platos.map((p) => (
            <div key={p.productoId} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">
                  {p.nombre} <span className="opacity-40 text-xs">· {p.categoria}</span>
                </span>
                <span className="shrink-0 text-right">
                  <b>{p.cantidadVendida}</b> <span className="opacity-50 text-xs">· {formatoCOP(p.ingresos)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-gray-800 rounded-full" style={{ width: `${(p.cantidadVendida / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
