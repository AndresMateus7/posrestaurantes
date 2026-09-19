"use client";

import { useCallback, useEffect, useState } from "react";

type Ingrediente = {
  id: string;
  nombre: string;
  unidadMedida: string;
  stockActual: string;
  stockMinimo: string;
  costoPromedio: number;
  ubicacion: string | null;
  creadoEn: string;
  ultimaEntrada: string | null;
};
type Categoria = { id: string; nombre: string };
type Estacion = "bar" | "parrilla" | "cocina_general";

function estadoStock(ing: Ingrediente) {
  const stock = Number(ing.stockActual);
  const min = Number(ing.stockMinimo);
  if (stock <= 0) return { label: "Agotado", clase: "bg-red-100 text-red-800" };
  if (stock < min) return { label: "Bajo", clase: "bg-amber-100 text-amber-800" };
  return { label: "OK", clase: "bg-green-100 text-green-800" };
}

const formatoFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const formatoCOP = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

const UNIDADES = [
  { valor: "unidad", etiqueta: "Unidades (botellas, latas, porciones)" },
  { valor: "g", etiqueta: "Gramos (g)" },
  { valor: "ml", etiqueta: "Mililitros (ml)" },
];
const ETIQUETA_ESTACION: Record<Estacion, string> = { bar: "Bar", parrilla: "Parrilla", cocina_general: "Cocina general" };

const FORM_VACIO = {
  nombre: "",
  unidad: "unidad",
  stock: "",
  minimo: "",
  ubicacion: "",
  vender: false,
  nombreMenu: "",
  categoriaId: "",
  precio: "",
  estacion: "cocina_general" as Estacion,
  porVenta: "1",
};

export function InventarioTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const cargar = useCallback(() => fetch("/api/ingredientes").then((r) => r.json()).then(setIngredientes), []);
  useEffect(() => {
    cargar();
    fetch("/api/categorias")
      .then((r) => r.json())
      .then((cats: Categoria[]) => {
        setCategorias(cats);
        setForm((f) => ({ ...f, categoriaId: f.categoriaId || cats[0]?.id || "" }));
      });
  }, [cargar]);

  function cambiar<K extends keyof typeof FORM_VACIO>(campo: K, valor: (typeof FORM_VACIO)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function agregar() {
    const nombre = form.nombre.trim();
    if (!nombre) {
      onCambio("Falta el nombre");
      return;
    }
    if (form.vender && (!form.categoriaId || !(Number(form.precio) > 0))) {
      onCambio("Para venderlo en el menú falta la categoría y el precio");
      return;
    }
    const res = await fetch("/api/ingredientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        unidadMedida: form.unidad,
        stockActual: Number(form.stock) || 0,
        stockMinimo: Number(form.minimo) || 0,
        ubicacion: form.ubicacion.trim() || undefined,
        venderEnMenu: form.vender
          ? {
              nombre: form.nombreMenu.trim() || nombre,
              categoriaId: form.categoriaId,
              precio: Number(form.precio),
              estacion: form.estacion,
              cantidadPorVenta: Number(form.porVenta) || 1,
            }
          : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      onCambio(data.error ?? "No se pudo agregar al inventario");
      return;
    }
    setMostrarNuevo(false);
    setForm({ ...FORM_VACIO, categoriaId: categorias[0]?.id ?? "" });
    cargar();
    onCambio(data.producto ? `${nombre} agregado al inventario y al menú 🍽️` : `${nombre} agregado al inventario 📦`);
  }

  async function guardarStock(ing: Ingrediente, valorTexto: string) {
    const nuevo = Number(valorTexto);
    const actual = Number(ing.stockActual);
    if (!Number.isFinite(nuevo) || nuevo < 0 || nuevo === actual) return;
    const delta = nuevo - actual;
    await fetch(`/api/ingredientes/${ing.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: delta > 0 ? "entrada" : "salida", cantidad: Math.abs(delta), motivo: "Ajuste manual desde panel" }),
    });
    cargar();
    onCambio(`Stock de ${ing.nombre} actualizado`);
  }

  async function guardarUbicacion(ing: Ingrediente, valor: string) {
    const nueva = valor.trim() || null;
    if (nueva === ing.ubicacion) return;
    await fetch(`/api/ingredientes/${ing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ubicacion: nueva }),
    });
    cargar();
  }

  const unidadForm = UNIDADES.find((u) => u.valor === form.unidad)?.valor ?? "unidad";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs opacity-60 max-w-2xl">
          Haz clic sobre el stock para corregirlo a un número exacto. Para compras reales a proveedores (con costo registrado), usa la pestaña <b>Facturas de proveedor</b> — ahí también
          sube el stock. Para crear un plato con receta, ve a <b>Productos y receta</b>.
        </p>
        <button onClick={() => setMostrarNuevo(true)} className="shrink-0 text-sm font-semibold text-white rounded-full px-4 py-2 bg-gray-900">
          + Agregar al inventario
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Producto / insumo</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Mínimo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Costo prom.</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Ingresó</th>
            </tr>
          </thead>
          <tbody>
            {ingredientes.map((ing) => {
              const e = estadoStock(ing);
              const esRegistro = !ing.ultimaEntrada;
              return (
                <tr key={ing.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{ing.nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <input
                        key={ing.stockActual}
                        type="number"
                        step="0.01"
                        defaultValue={ing.stockActual}
                        onBlur={(ev) => guardarStock(ing, ev.target.value)}
                        className="w-24 border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-lg px-2 py-1 text-sm outline-none"
                      />
                      <span className="opacity-60">{ing.unidadMedida}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 opacity-60">
                    {ing.stockMinimo} {ing.unidadMedida}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${e.clase}`}>{e.label}</span>
                  </td>
                  <td className="px-4 py-3 opacity-70">
                    {formatoCOP(ing.costoPromedio)}/{ing.unidadMedida}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      key={ing.ubicacion ?? ""}
                      defaultValue={ing.ubicacion ?? ""}
                      onBlur={(ev) => guardarUbicacion(ing, ev.target.value)}
                      placeholder="Sin definir"
                      className="w-32 border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-lg px-2 py-1 text-sm placeholder:opacity-40 outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {formatoFecha(ing.ultimaEntrada ?? ing.creadoEn)}
                    {esRegistro && <span className="block opacity-50">registro inicial</span>}
                  </td>
                </tr>
              );
            })}
            {ingredientes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm opacity-50">
                  Tu inventario está vacío. Usa &quot;+ Agregar al inventario&quot; para crear el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrarNuevo && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarNuevo(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Agregar al inventario</h3>
            <p className="text-xs opacity-50 mt-1">Un insumo (arroz, pollo) o un producto que compras ya listo (gaseosa, cerveza).</p>

            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
              placeholder="Ej. Coca-Cola 350ml"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">¿Cómo lo cuentas?</label>
            <select value={unidadForm} onChange={(e) => cambiar("unidad", e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              {UNIDADES.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium opacity-70 mb-1">Stock inicial</label>
                <input type="number" min={0} step="0.01" value={form.stock} onChange={(e) => cambiar("stock", e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium opacity-70 mb-1">Avisar si baja de</label>
                <input type="number" min={0} step="0.01" value={form.minimo} onChange={(e) => cambiar("minimo", e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Ubicación (opcional)</label>
            <input value={form.ubicacion} onChange={(e) => cambiar("ubicacion", e.target.value)} placeholder="Ej. Nevera 2, Bodega A" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            <label className="flex items-start gap-2 mt-4 text-sm cursor-pointer">
              <input type="checkbox" checked={form.vender} onChange={(e) => cambiar("vender", e.target.checked)} className="mt-0.5" />
              <span>
                También venderlo en el menú (plato o bebida)
                <span className="block text-xs opacity-50">Se crea el plato y cada venta descuenta de este inventario.</span>
              </span>
            </label>

            {form.vender && (
              <div className="mt-3 space-y-3 bg-gray-50 rounded-xl p-3">
                <div>
                  <label className="block text-xs font-medium opacity-70 mb-1">Nombre en el menú</label>
                  <input
                    value={form.nombreMenu}
                    onChange={(e) => cambiar("nombreMenu", e.target.value)}
                    placeholder={form.nombre || "Igual al nombre de arriba"}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium opacity-70 mb-1">Categoría *</label>
                    <select value={form.categoriaId} onChange={(e) => cambiar("categoriaId", e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white">
                      {categorias.length === 0 && <option value="">Sin categorías</option>}
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium opacity-70 mb-1">Precio de venta (COP) *</label>
                    <input type="number" min={0} value={form.precio} onChange={(e) => cambiar("precio", e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium opacity-70 mb-1">Estación</label>
                    <select value={form.estacion} onChange={(e) => cambiar("estacion", e.target.value as Estacion)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white">
                      {(Object.keys(ETIQUETA_ESTACION) as Estacion[]).map((valor) => (
                        <option key={valor} value={valor}>
                          {ETIQUETA_ESTACION[valor]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium opacity-70 mb-1">Cada venta descuenta ({unidadForm})</label>
                    <input type="number" min={0} step="0.01" value={form.porVenta} onChange={(e) => cambiar("porVenta", e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white" />
                  </div>
                </div>
              </div>
            )}

            <button onClick={agregar} className="w-full text-white rounded-xl py-3 font-semibold mt-5 bg-gray-900">
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
