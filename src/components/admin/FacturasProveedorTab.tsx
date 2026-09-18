"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type Ingrediente = { id: string; nombre: string; unidadMedida: string };
type Factura = {
  id: string;
  proveedor: string;
  numeroFactura: string | null;
  fecha: string;
  total: number;
  registradoPor: { nombre: string } | null;
  items: { cantidad: string; costoUnitario: number; subtotal: number; ingrediente: { nombre: string; unidadMedida: string } }[];
};
type Resumen = { facturasTotales: number; totalHistorico: number; totalEsteMes: number; proveedoresDistintos: number };
type LineaForm = { ingredienteId: string; cantidad: string; costoUnitario: string };

const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");
const formatoFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const hoy = () => new Date().toISOString().slice(0, 10);
const lineaVacia = (): LineaForm => ({ ingredienteId: "", cantidad: "", costoUnitario: "" });

export function FacturasProveedorTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);

  const cargar = useCallback(() => {
    fetch("/api/facturas-proveedor")
      .then((r) => r.json())
      .then((data) => {
        setResumen(data.resumen);
        setFacturas(data.facturas);
      });
  }, []);

  useEffect(() => {
    fetch("/api/ingredientes").then((r) => r.json()).then(setIngredientes);
    cargar();
  }, [cargar]);

  function actualizarLinea(idx: number, campo: keyof LineaForm, valor: string) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  }

  function resetForm() {
    setProveedor("");
    setNumeroFactura("");
    setFecha(hoy());
    setLineas([lineaVacia()]);
  }

  const totalForm = lineas.reduce((acc, l) => acc + (Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0), 0);

  async function registrar() {
    const items = lineas
      .filter((l) => l.ingredienteId && Number(l.cantidad) > 0)
      .map((l) => ({ ingredienteId: l.ingredienteId, cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario) || 0 }));
    if (!proveedor.trim() || items.length === 0) {
      onCambio("Falta el proveedor o al menos un producto con cantidad");
      return;
    }
    const res = await fetch("/api/facturas-proveedor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Offset fijo -05:00 (Colombia) para que la fecha elegida no se corra un
      // dia si el servidor corre en UTC -- mismo problema resuelto en Estadisticas.
      body: JSON.stringify({ proveedor, numeroFactura: numeroFactura || undefined, fecha: `${fecha}T12:00:00-05:00`, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      onCambio(data.error ?? "No se pudo registrar la factura");
      return;
    }
    setMostrarForm(false);
    resetForm();
    cargar();
    onCambio("Factura registrada — stock y costo actualizados ✅");
  }

  return (
    <div className="space-y-4">
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Facturas totales" value={String(resumen.facturasTotales)} />
          <Tile label="Compras este mes" value={formatoCOP(resumen.totalEsteMes)} />
          <Tile label="Total histórico" value={formatoCOP(resumen.totalHistorico)} />
          <Tile label="Proveedores" value={String(resumen.proveedoresDistintos)} />
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-xs opacity-50">Registra aquí cada compra real a un proveedor — sube el stock con el costo que de verdad pagaste, no una cantidad automática.</p>
        <button onClick={() => setMostrarForm(true)} className="shrink-0 text-sm font-semibold text-white rounded-full px-4 py-2 bg-gray-900">
          + Nueva factura
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Productos</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Registró</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <Fragment key={f.id}>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {formatoFecha(f.fecha)}
                    {f.numeroFactura && <span className="block opacity-50">#{f.numeroFactura}</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{f.proveedor}</td>
                  <td className="px-4 py-3 text-xs opacity-70">{f.items.length} producto(s)</td>
                  <td className="px-4 py-3 font-semibold">{formatoCOP(f.total)}</td>
                  <td className="px-4 py-3 text-xs opacity-60">{f.registradoPor?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpandida(expandida === f.id ? null : f.id)} className="text-xs border border-gray-300 rounded-full px-2 py-1">
                      {expandida === f.id ? "Ocultar" : "Ver"}
                    </button>
                  </td>
                </tr>
                {expandida === f.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-4 py-3">
                      <table className="w-full text-xs">
                        <thead className="opacity-60">
                          <tr>
                            <th className="text-left py-1">Ingrediente</th>
                            <th className="text-right py-1">Cantidad</th>
                            <th className="text-right py-1">Costo/u</th>
                            <th className="text-right py-1">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.items.map((it, i) => (
                            <tr key={i} className="border-t border-gray-200">
                              <td className="py-1">{it.ingrediente.nombre}</td>
                              <td className="text-right py-1">
                                {it.cantidad} {it.ingrediente.unidadMedida}
                              </td>
                              <td className="text-right py-1">{formatoCOP(it.costoUnitario)}</td>
                              <td className="text-right py-1 font-medium">{formatoCOP(it.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {facturas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm opacity-50">
                  Aún no has registrado facturas de proveedor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrarForm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarForm(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Nueva factura de proveedor</h3>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium opacity-70 mb-1">Proveedor *</label>
                <input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Ej. Distrialimentos SAS"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium opacity-70 mb-1">N° de factura (opcional)</label>
                <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium opacity-70 mb-1">Fecha</label>
                <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase opacity-60 mt-5 mb-2">Productos recibidos</p>
            <div className="space-y-2">
              {lineas.map((linea, idx) => {
                const subtotal = (Number(linea.cantidad) || 0) * (Number(linea.costoUnitario) || 0);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2.5">
                    <select
                      value={linea.ingredienteId}
                      onChange={(e) => actualizarLinea(idx, "ingredienteId", e.target.value)}
                      className="col-span-5 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Seleccionar ingrediente…</option>
                      {ingredientes.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Cantidad"
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(idx, "cantidad", e.target.value)}
                      className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Costo/u"
                      value={linea.costoUnitario}
                      onChange={(e) => actualizarLinea(idx, "costoUnitario", e.target.value)}
                      className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <span className="col-span-1 text-xs text-right opacity-70">{formatoCOP(subtotal)}</span>
                    <button onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))} className="col-span-1 text-red-500 text-sm">
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setLineas((prev) => [...prev, lineaVacia()])} className="text-xs border border-gray-300 rounded-full px-3 py-1.5 mt-2">
              + Agregar producto
            </button>

            <div className="flex justify-between items-center border-t border-gray-200 mt-4 pt-3">
              <span className="text-sm opacity-60">Total factura</span>
              <span className="text-lg font-bold">{formatoCOP(totalForm)}</span>
            </div>

            <button onClick={registrar} className="w-full text-white rounded-xl py-3 font-semibold mt-4 bg-gray-900">
              Registrar factura
            </button>
          </div>
        </div>
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
