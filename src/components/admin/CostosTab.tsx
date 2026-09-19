"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { CostoAdicional, CostoProducto } from "@/lib/costos";
import { EditorPrecio } from "./EditorPrecio";
import { Tile } from "./Tile";
import { formatoCantidad, formatoCosto, formatoCOP, formatoMargen, margenPorPrecio } from "@/lib/precios";

/**
 * Costo de cada plato (segun su receta y el costo promedio de los insumos, que salen de las facturas de
 * proveedor) y precio de venta: se puede fijar escribiendo el % de margen o escribiendo el precio.
 */
export function CostosTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [productos, setProductos] = useState<CostoProducto[]>([]);
  const [adicionales, setAdicionales] = useState<CostoAdicional[]>([]);
  const [cargado, setCargado] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargar = useCallback(
    () =>
      fetch("/api/costos")
        .then((r) => r.json())
        .then((data) => {
          if (!Array.isArray(data?.productos)) return;
          setProductos(data.productos);
          setAdicionales(data.adicionales);
          setCargado(true);
        }),
    []
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function aplicarPrecio(tipo: "productos" | "adicionales", id: string, nombre: string, precio: number): Promise<boolean> {
    const res = await fetch(`/api/${tipo}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ precio }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onCambio(data.error ?? "No se pudo cambiar el precio");
      return false;
    }
    await cargar();
    onCambio(`Precio de ${nombre}: ${formatoCOP(precio)} ✅`);
    return true;
  }

  const completos = productos.filter((p) => p.completo);
  const margenPromedio = completos.length > 0 ? completos.reduce((acc, p) => acc + (margenPorPrecio(p.costo!, p.precio) ?? 0), 0) / completos.length : null;
  const filtro = buscar.trim().toLowerCase();
  const visibles = productos.filter((p) => !filtro || p.nombre.toLowerCase().includes(filtro) || p.categoria.toLowerCase().includes(filtro));

  return (
    <div className="space-y-4">
      <p className="text-xs opacity-60 max-w-3xl">
        Aquí ves cuánto te cuesta preparar cada plato (según su receta y lo que pagaste en las facturas de proveedor) y cuánto ganas. Escribe el <b>% de margen</b> y te calcula el precio, o escribe el{" "}
        <b>precio</b> y te muestra el %. El margen es la ganancia sobre el precio de venta: precio = costo ÷ (1 − margen); el precio se redondea hacia arriba a la centena.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile label="Platos con costo completo" value={`${completos.length} de ${productos.length}`} sub="tienen receta y todos los insumos con costo" />
        <Tile label="Margen promedio" value={formatoMargen(margenPromedio)} sub="de los platos con costo completo" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Platos y bebidas</h2>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar plato o categoría…"
          className="border border-gray-300 rounded-full px-4 py-1.5 text-sm bg-white w-full sm:w-64"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Plato</th>
              <th className="px-4 py-3">Costo</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Margen</th>
              <th className="px-4 py-3">Cambiar precio</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs opacity-50">{p.categoria}</p>
                    {p.receta.length > 0 && (
                      <button onClick={() => setExpandido(expandido === p.id ? null : p.id)} className="text-xs underline opacity-60 mt-0.5">
                        {expandido === p.id ? "Ocultar receta" : "Ver receta y costo"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.completo ? (
                      formatoCOP(p.costo!)
                    ) : p.costo !== null ? (
                      <span>
                        {p.costo > 0 && <>≥ {formatoCOP(p.costo)}</>}
                        <span className="block text-[11px] text-amber-700 whitespace-normal max-w-40">Falta el costo de: {p.faltantes.join(", ")}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 whitespace-normal">
                        Sin receta
                        <span className="block opacity-70 max-w-40">Agrégala en «Productos y receta»</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">{formatoCOP(p.precio)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.completo ? formatoMargen(margenPorPrecio(p.costo!, p.precio)) : "—"}</td>
                  <td className="px-4 py-3">
                    <EditorPrecio
                      key={`${p.id}-${p.precio}`}
                      costo={p.completo ? p.costo : null}
                      precioActual={p.precio}
                      onAplicar={(precio) => aplicarPrecio("productos", p.id, p.nombre, precio)}
                    />
                  </td>
                </tr>
                {expandido === p.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-4 py-3">
                      <table className="w-full text-xs">
                        <thead className="opacity-60">
                          <tr>
                            <th className="text-left py-1">Ingrediente</th>
                            <th className="text-right py-1">Cantidad</th>
                            <th className="text-right py-1">Costo</th>
                            <th className="text-right py-1">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.receta.map((l) => (
                            <tr key={l.ingredienteId} className="border-t border-gray-200">
                              <td className="py-1">{l.nombre}</td>
                              <td className="text-right py-1">{formatoCantidad(l.cantidad, l.unidadMedida)}</td>
                              <td className="text-right py-1">{l.costoUnidad > 0 ? `${formatoCosto(l.costoUnidad)}/${l.unidadMedida}` : <span className="text-amber-700">sin costo</span>}</td>
                              <td className="text-right py-1 font-medium">{l.costoUnidad > 0 ? formatoCOP(l.subtotal) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm opacity-50">
                  {cargado ? "No hay platos que coincidan." : "Cargando…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adicionales.length > 0 && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 pt-2">Adicionales</h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
                <tr>
                  <th className="px-4 py-3">Adicional</th>
                  <th className="px-4 py-3">Costo</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Margen</th>
                  <th className="px-4 py-3">Cambiar precio</th>
                </tr>
              </thead>
              <tbody>
                {adicionales.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.nombre}</p>
                      {a.ingrediente && a.cantidad !== null && <p className="text-xs opacity-50">{formatoCantidad(a.cantidad, a.ingrediente.unidadMedida)} de {a.ingrediente.nombre}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.completo ? (
                        formatoCOP(a.costo!)
                      ) : (
                        <span className="text-xs text-amber-700 whitespace-normal">
                          {a.faltante === "Sin insumo" ? "Sin insumo ligado" : `Falta el costo de: ${a.faltante}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{formatoCOP(a.precio)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{a.completo ? formatoMargen(margenPorPrecio(a.costo!, a.precio)) : "—"}</td>
                    <td className="px-4 py-3">
                      <EditorPrecio
                        key={`${a.id}-${a.precio}`}
                        costo={a.completo ? a.costo : null}
                        precioActual={a.precio}
                        onAplicar={(precio) => aplicarPrecio("adicionales", a.id, a.nombre, precio)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
