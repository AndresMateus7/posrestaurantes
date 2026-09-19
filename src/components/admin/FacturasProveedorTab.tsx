"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { EditorPrecio } from "./EditorPrecio";
import { Tile } from "./Tile";
import { formatoCantidad, formatoCOP, formatoMargen, margenPorPrecio, textoCostoInsumo, unidadesDeCompra } from "@/lib/precios";

type IngredienteOpcion = { id: string; nombre: string; unidadMedida: string };
type Factura = {
  id: string;
  proveedor: string;
  numeroFactura: string | null;
  fecha: string;
  total: number;
  registradoPor: { nombre: string } | null;
  items: { cantidad: string; costoPorUnidad: number; costoUnitario: number; subtotal: number; ingrediente: { nombre: string; unidadMedida: string } }[];
};
type Resumen = { facturasTotales: number; totalHistorico: number; totalEsteMes: number; proveedoresDistintos: number; valorInventario: number };
type LineaForm = { ingredienteId: string; cantidad: string; unidad: string; valor: string };
type ItemImpacto = { id: string; nombre: string; precio: number; costoAntes: number | null; costoDespues: number };
type Impacto = { productos: ItemImpacto[]; adicionales: ItemImpacto[]; pendientes: number };
type Resultado = { proveedor: string; total: number; valorAntes: number; valorDespues: number; impacto: Impacto | null };

const formatoFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
// Fecha de hoy en Colombia (el servidor y el navegador pueden ir en UTC: de noche caeria en el dia siguiente).
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const lineaVacia = (): LineaForm => ({ ingredienteId: "", cantidad: "", unidad: "", valor: "" });

// Lo que se compra se escribe en kilos/litros; el inventario lo lleva en gramos/mililitros.
function analizarLinea(l: LineaForm, ingredientes: IngredienteOpcion[]) {
  const ing = ingredientes.find((i) => i.id === l.ingredienteId);
  const unidades = ing ? unidadesDeCompra(ing.unidadMedida) : [];
  const unidad = unidades.find((u) => u.valor === l.unidad) ?? unidades[0];
  const cantidadBase = Math.round((Number(l.cantidad) || 0) * (unidad?.factor ?? 1) * 100) / 100;
  return { ing, unidades, unidad, cantidadBase, valor: Number(l.valor) || 0 };
}

export function FacturasProveedorTab({ onCambio, onIrACostos }: { onCambio: (msg: string) => void; onIrACostos?: () => void }) {
  const [ingredientes, setIngredientes] = useState<IngredienteOpcion[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const cargar = useCallback(() => {
    fetch("/api/facturas-proveedor")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.resumen) return;
        setResumen(data.resumen);
        setFacturas(data.facturas);
      });
  }, []);

  useEffect(() => {
    fetch("/api/ingredientes")
      .then((r) => r.json())
      .then((lista: unknown) => {
        if (Array.isArray(lista)) setIngredientes(lista as IngredienteOpcion[]);
      });
    cargar();
  }, [cargar]);

  function actualizarLinea(idx: number, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...cambios } : l)));
  }

  function elegirIngrediente(idx: number, ingredienteId: string) {
    const ing = ingredientes.find((i) => i.id === ingredienteId);
    // Kilos o litros por defecto: asi se compra casi todo.
    actualizarLinea(idx, { ingredienteId, unidad: ing ? unidadesDeCompra(ing.unidadMedida)[0].valor : "" });
  }

  function resetForm() {
    setProveedor("");
    setNumeroFactura("");
    setFecha(hoy());
    setLineas([lineaVacia()]);
  }

  const analisis = lineas.map((l) => analizarLinea(l, ingredientes));
  const totalForm = analisis.reduce((acc, a) => acc + a.valor, 0);
  // Totales "segun el peso": gramos, mililitros y unidades por separado (no se pueden sumar entre si).
  const pesoG = analisis.reduce((acc, a) => acc + (a.ing?.unidadMedida === "g" ? a.cantidadBase : 0), 0);
  const volumenMl = analisis.reduce((acc, a) => acc + (a.ing?.unidadMedida === "ml" ? a.cantidadBase : 0), 0);
  const unidades = analisis.reduce((acc, a) => acc + (a.ing && a.ing.unidadMedida !== "g" && a.ing.unidadMedida !== "ml" ? a.cantidadBase : 0), 0);

  async function registrar() {
    const completas = lineas.map((l, i) => ({ l, a: analisis[i] })).filter(({ l, a }) => l.ingredienteId && a.cantidadBase > 0);
    if (!proveedor.trim() || completas.length === 0) {
      onCambio("Falta el proveedor o al menos un producto con cantidad");
      return;
    }
    const sinValor = completas.find(({ l }) => l.valor.trim() === "");
    if (sinValor) {
      onCambio(`Falta el valor pagado de ${sinValor.a.ing?.nombre ?? "un producto"}`);
      return;
    }
    const items = completas.map(({ a }) => ({ ingredienteId: a.ing!.id, cantidad: a.cantidadBase, valorTotal: a.valor }));
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
    setResultado({ proveedor: proveedor.trim(), total: data.total, valorAntes: data.valorInventarioAntes, valorDespues: data.valorInventario, impacto: data.impacto ?? null });
    resetForm();
    cargar();
    onCambio("Factura registrada — stock y costo actualizados ✅");
  }

  async function aplicarPrecio(tipo: "productos" | "adicionales", item: ItemImpacto, precio: number): Promise<boolean> {
    const res = await fetch(`/api/${tipo}/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ precio }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onCambio(data.error ?? "No se pudo cambiar el precio");
      return false;
    }
    setResultado((r) => (r && r.impacto ? { ...r, impacto: { ...r.impacto, [tipo]: r.impacto[tipo].map((x) => (x.id === item.id ? { ...x, precio } : x)) } } : r));
    onCambio(`Precio de ${item.nombre}: ${formatoCOP(precio)} ✅`);
    return true;
  }

  return (
    <div className="space-y-4">
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile label="Facturas totales" value={String(resumen.facturasTotales)} />
          <Tile label="Compras este mes" value={formatoCOP(resumen.totalEsteMes)} />
          <Tile label="Total histórico" value={formatoCOP(resumen.totalHistorico)} />
          <Tile label="Proveedores" value={String(resumen.proveedoresDistintos)} />
          <Tile label="Valor del inventario" value={formatoCOP(resumen.valorInventario)} sub="lo que hay ahora, a costo" />
        </div>
      )}

      <div className="flex justify-between items-center gap-3">
        <p className="text-xs opacity-50">
          Registra cada compra real a un proveedor con lo que pagaste por cada producto: el sistema calcula el costo por kilo o litro, sube el stock y actualiza el valor del inventario.
        </p>
        <button onClick={() => setMostrarForm(true)} className="shrink-0 text-sm font-semibold text-white rounded-full px-4 py-2 bg-gray-900">
          + Nueva factura
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
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
                            <th className="text-right py-1">Costo</th>
                            <th className="text-right py-1">Valor pagado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.items.map((it, i) => (
                            <tr key={i} className="border-t border-gray-200">
                              <td className="py-1">{it.ingrediente.nombre}</td>
                              <td className="text-right py-1">{formatoCantidad(Number(it.cantidad), it.ingrediente.unidadMedida)}</td>
                              <td className="text-right py-1">{textoCostoInsumo(it.costoPorUnidad || it.costoUnitario, it.ingrediente.unidadMedida)}</td>
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
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
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

            <p className="text-xs font-semibold uppercase opacity-60 mt-5 mb-1">Productos recibidos</p>
            <p className="text-xs opacity-50 mb-2">Escribe la cantidad como viene en la factura (kilos, litros…) y lo que pagaste por ese producto.</p>
            <div className="space-y-2">
              {lineas.map((linea, idx) => {
                const a = analisis[idx];
                const costoBase = a.cantidadBase > 0 ? a.valor / a.cantidadBase : 0;
                return (
                  <div key={idx} className="bg-gray-50 rounded-xl p-2.5 space-y-2">
                    <div className="flex gap-2">
                      <select value={linea.ingredienteId} onChange={(e) => elegirIngrediente(idx, e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">Seleccionar ingrediente…</option>
                        {ingredientes.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => setLineas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [lineaVacia()]))} aria-label="Quitar producto" className="text-red-500 text-sm px-1">
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Cantidad"
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(idx, { cantidad: e.target.value })}
                        className="col-span-4 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                      />
                      <select
                        value={a.unidad?.valor ?? ""}
                        onChange={(e) => actualizarLinea(idx, { unidad: e.target.value })}
                        disabled={a.unidades.length <= 1}
                        className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                      >
                        {a.unidades.length === 0 && <option value="">—</option>}
                        {a.unidades.map((u) => (
                          <option key={u.valor} value={u.valor}>
                            {u.etiqueta}
                          </option>
                        ))}
                      </select>
                      <div className="col-span-5 flex items-center gap-1">
                        <span className="text-xs opacity-60">$</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="Valor pagado"
                          value={linea.valor}
                          onChange={(e) => actualizarLinea(idx, { valor: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                        />
                      </div>
                    </div>
                    {a.ing && a.cantidadBase > 0 && linea.valor.trim() !== "" && (
                      <p className="text-xs opacity-60">
                        Sale a {textoCostoInsumo(costoBase, a.ing.unidadMedida)} · {formatoCantidad(a.cantidadBase, a.ing.unidadMedida)} por {formatoCOP(a.valor)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setLineas((prev) => [...prev, lineaVacia()])} className="text-xs border border-gray-300 rounded-full px-3 py-1.5 mt-2">
              + Agregar producto
            </button>

            <div className="border-t border-gray-200 mt-4 pt-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm opacity-60">Total factura</span>
                <span className="text-lg font-bold">{formatoCOP(totalForm)}</span>
              </div>
              {pesoG > 0 && (
                <div className="flex justify-between text-xs opacity-60">
                  <span>Peso comprado</span>
                  <span>{formatoCantidad(pesoG, "g")}</span>
                </div>
              )}
              {volumenMl > 0 && (
                <div className="flex justify-between text-xs opacity-60">
                  <span>Volumen comprado</span>
                  <span>{formatoCantidad(volumenMl, "ml")}</span>
                </div>
              )}
              {unidades > 0 && (
                <div className="flex justify-between text-xs opacity-60">
                  <span>Unidades compradas</span>
                  <span>{unidades.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <button onClick={registrar} className="w-full text-white rounded-xl py-3 font-semibold mt-4 bg-gray-900">
              Registrar factura
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResultado(null)} />
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">✅ Factura registrada</h3>
            <p className="text-sm opacity-60 mt-0.5">
              {resultado.proveedor} · {formatoCOP(resultado.total)}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs uppercase opacity-50">Valor del inventario</p>
                <p className="text-lg font-bold">{formatoCOP(resultado.valorDespues)}</p>
                <p className="text-xs opacity-50">antes: {formatoCOP(resultado.valorAntes)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs uppercase opacity-50">Sumó al inventario</p>
                <p className="text-lg font-bold">{formatoCOP(resultado.valorDespues - resultado.valorAntes)}</p>
                <p className="text-xs opacity-50">esta compra a costo promedio</p>
              </div>
            </div>

            {resultado.impacto && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase opacity-60">Platos y bebidas cuyo costo cambió con esta compra</p>
                {resultado.impacto.productos.length + resultado.impacto.adicionales.length === 0 ? (
                  <p className="text-sm opacity-60 mt-2">Ningún plato con receta completa cambió de costo con esta compra.</p>
                ) : (
                  <p className="text-xs opacity-50 mt-1">Ajusta el precio si quieres mantener tu ganancia: escribe el % de margen y te calcula el precio, o escribe el precio y te muestra el %.</p>
                )}
                <div className="space-y-2 mt-2">
                  {(["productos", "adicionales"] as const).flatMap((tipo) =>
                    resultado.impacto![tipo].map((item) => {
                      const margenAntes = item.costoAntes !== null ? margenPorPrecio(item.costoAntes, item.precio) : null;
                      const margenAhora = margenPorPrecio(item.costoDespues, item.precio);
                      return (
                        <div key={`${tipo}-${item.id}-${item.precio}`} className="border border-gray-200 rounded-xl p-3">
                          <div className="flex justify-between gap-3 flex-wrap">
                            <p className="font-medium text-sm">
                              {item.nombre}
                              {tipo === "adicionales" && <span className="ml-1 text-xs opacity-50">(adicional)</span>}
                            </p>
                            <p className="text-xs opacity-70">
                              Costo {item.costoAntes !== null ? `${formatoCOP(item.costoAntes)} → ` : ""}
                              <b>{formatoCOP(item.costoDespues)}</b>
                              {" · "}Precio {formatoCOP(item.precio)}
                            </p>
                          </div>
                          <p className="text-xs opacity-60 mt-0.5">
                            Margen {margenAntes !== null ? `${formatoMargen(margenAntes)} → ` : ""}
                            {formatoMargen(margenAhora)}
                          </p>
                          <div className="mt-2">
                            <EditorPrecio
                              key={`${item.id}-${item.precio}`}
                              costo={item.costoDespues}
                              precioActual={item.precio}
                              margenAnterior={margenAntes}
                              onAplicar={(precio) => aplicarPrecio(tipo, item, precio)}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {resultado.impacto.pendientes > 0 && (
                  <p className="text-xs opacity-50 mt-2">
                    {resultado.impacto.pendientes} plato(s) todavía no tienen el costo completo (les faltan otros ingredientes por comprar).
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              {onIrACostos && resultado.impacto && (
                <button
                  onClick={() => {
                    setResultado(null);
                    onIrACostos();
                  }}
                  className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold"
                >
                  Ver todos los costos y precios
                </button>
              )}
              <button onClick={() => setResultado(null)} className="flex-1 text-white rounded-xl py-2.5 text-sm font-semibold bg-gray-900">
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
