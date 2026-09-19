"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type ItemVenta = { nombreProducto: string; cantidad: number };
type PagoVenta = { metodo: string; monto: number; recibidoPor: string | null };
type Venta = {
  id: string;
  tipo: "mesa" | "llevar" | "domicilio";
  // "Mesa 5", "Domicilio #12 · Juan" o "Para llevar #7 · Ana".
  etiqueta: string;
  cerradoEn: string;
  subtotal: number;
  propina: number;
  costoDomicilio: number;
  total: number;
  items: ItemVenta[];
  pagos: PagoVenta[];
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
const formatoFechaHora = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const csvCelda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

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

export function HistorialVentasTab() {
  const [preset, setPreset] = useState<Preset | null>("7d");
  const [desde, setDesde] = useState(() => rangoPreset("7d").desde);
  const [hasta, setHasta] = useState(() => rangoPreset("7d").hasta);
  const [ventas, setVentas] = useState<Venta[] | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const cargar = useCallback((desdeV: string, hastaV: string) => {
    const params = new URLSearchParams({ desde: `${desdeV}T00:00:00-05:00`, hasta: `${hastaV}T23:59:59.999-05:00` });
    fetch(`/api/ventas?${params}`)
      .then((r) => r.json())
      .then(setVentas);
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

  function exportarCSV() {
    if (!ventas || ventas.length === 0) return;
    const filas = ventas.map((v) => {
      const items = v.items.map((i) => `${i.cantidad}x ${i.nombreProducto}`).join("; ");
      const metodos = v.pagos.map((p) => `${ETIQUETA_METODO[p.metodo] ?? p.metodo} ${p.monto}`).join(" + ");
      return [formatoFechaHora(v.cerradoEn), v.etiqueta, items, v.subtotal, v.costoDomicilio, v.propina, v.total, metodos].map(csvCelda).join(",");
    });
    const csv = ["Fecha,Servicio,Items,Subtotal,Domicilio,Propina,Total,Metodos".split(",").map(csvCelda).join(","), ...filas].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-ventas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPeriodo = ventas?.reduce((a, v) => a + v.total, 0) ?? 0;

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
          <button onClick={exportarCSV} disabled={!ventas?.length} className="border border-gray-300 rounded-full px-3 py-1.5 font-semibold disabled:opacity-30">
            Exportar CSV
          </button>
        </div>
      </div>

      {ventas && (
        <p className="text-sm opacity-60">
          <b>{ventas.length}</b> {ventas.length === 1 ? "venta" : "ventas"} · total <b>{formatoCOP(totalPeriodo)}</b>
        </p>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Servicio</th>
              <th className="px-4 py-3">Platos</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Método(s)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(ventas ?? []).map((v) => {
              const platosVendidos = v.items.reduce((a, i) => a + i.cantidad, 0);
              return (
                <Fragment key={v.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatoFechaHora(v.cerradoEn)}</td>
                    <td className="px-4 py-3">{v.etiqueta}</td>
                    <td className="px-4 py-3 text-xs opacity-70">{platosVendidos} plato(s)</td>
                    <td className="px-4 py-3 font-semibold">{formatoCOP(v.total)}</td>
                    <td className="px-4 py-3 text-xs opacity-70">{v.pagos.map((p) => ETIQUETA_METODO[p.metodo] ?? p.metodo).join(" + ")}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandida(expandida === v.id ? null : v.id)} className="text-xs border border-gray-300 rounded-full px-2 py-1">
                        {expandida === v.id ? "Ocultar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                  {expandida === v.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold uppercase opacity-60 mb-1">Items</p>
                            {v.items.map((it, i) => (
                              <div key={i} className="flex justify-between py-0.5">
                                <span>{it.nombreProducto}</span>
                                <span className="opacity-60">× {it.cantidad}</span>
                              </div>
                            ))}
                            <div className="flex justify-between pt-1 mt-1 border-t border-gray-200">
                              <span className="opacity-60">Subtotal</span>
                              <span>{formatoCOP(v.subtotal)}</span>
                            </div>
                            {v.costoDomicilio > 0 && (
                              <div className="flex justify-between">
                                <span className="opacity-60">Domicilio</span>
                                <span>{formatoCOP(v.costoDomicilio)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="opacity-60">Propina</span>
                              <span>{formatoCOP(v.propina)}</span>
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold uppercase opacity-60 mb-1">Pagos</p>
                            {v.pagos.map((p, i) => (
                              <div key={i} className="flex justify-between py-0.5">
                                <span>
                                  {ETIQUETA_METODO[p.metodo] ?? p.metodo}
                                  {p.recibidoPor && <span className="opacity-50"> · {p.recibidoPor}</span>}
                                </span>
                                <span>{formatoCOP(p.monto)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {ventas?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm opacity-50">
                  No hay ventas cerradas en este rango.
                </td>
              </tr>
            )}
            {ventas === null && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm opacity-50">
                  Cargando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
