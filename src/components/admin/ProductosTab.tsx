"use client";

import { useCallback, useEffect, useState } from "react";

type Ingrediente = { id: string; nombre: string; unidadMedida: string; stockActual: string };
type Adicional = { id: string; nombre: string; precio: number };
type Categoria = { id: string; nombre: string };
type RecetaLinea = { ingredienteId: string; cantidadUsada: string; ingrediente: Ingrediente };
type Producto = {
  id: string;
  nombre: string;
  precio: number;
  imagenUrl: string | null;
  disponible: boolean;
  venderSinStock: boolean;
  disponibleEfectivo: boolean;
  categoria: { nombre: string };
  ingredientes: RecetaLinea[];
  adicionales: { adicional: Adicional }[];
};

const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");
const ETIQUETA_ESTACION: Record<string, string> = { bar: "Bar", parrilla: "Parrilla", cocina_general: "Cocina general" };

export function ProductosTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [adicionales, setAdicionales] = useState<Adicional[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [nuevoIngId, setNuevoIngId] = useState<Record<string, string>>({});

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCategoriaId, setNuevoCategoriaId] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevoDescripcion, setNuevoDescripcion] = useState("");
  const [nuevaEstacion, setNuevaEstacion] = useState<"bar" | "parrilla" | "cocina_general">("cocina_general");

  const cargar = useCallback(() => fetch("/api/productos").then((r) => r.json()).then(setProductos), []);
  useEffect(() => {
    cargar();
    fetch("/api/ingredientes").then((r) => r.json()).then(setIngredientes);
    fetch("/api/adicionales").then((r) => r.json()).then(setAdicionales);
    fetch("/api/categorias").then((r) => r.json()).then((cats) => {
      setCategorias(cats);
      setNuevoCategoriaId((actual) => actual || cats[0]?.id || "");
    });
  }, [cargar]);

  function resetNuevo() {
    setNuevoNombre("");
    setNuevoPrecio("");
    setNuevoDescripcion("");
    setNuevaEstacion("cocina_general");
  }

  async function crearProducto() {
    const precio = Number(nuevoPrecio);
    if (!nuevoNombre.trim() || !nuevoCategoriaId || !precio || precio <= 0) {
      onCambio("Falta el nombre, la categoría o el precio");
      return;
    }
    const res = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nuevoNombre.trim(),
        categoriaId: nuevoCategoriaId,
        precio,
        descripcion: nuevoDescripcion.trim() || undefined,
        estacion: nuevaEstacion,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      onCambio(data.error ?? "No se pudo crear el producto");
      return;
    }
    setMostrarNuevo(false);
    resetNuevo();
    cargar();
    onCambio(`${data.nombre} agregado al menú 🍽️`);
  }

  async function toggleVenderSinStock(p: Producto) {
    await fetch(`/api/productos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venderSinStock: !p.venderSinStock }),
    });
    cargar();
  }

  async function guardarImagen(p: Producto, imagenUrl: string) {
    await fetch(`/api/productos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagenUrl: imagenUrl.trim() || null }),
    });
    cargar();
  }

  async function toggleManual(p: Producto) {
    await fetch(`/api/productos/${p.id}/disponibilidad`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disponible: !p.disponible }),
    });
    cargar();
  }

  async function guardarReceta(p: Producto, receta: { ingredienteId: string; cantidadUsada: number }[]) {
    await fetch(`/api/productos/${p.id}/receta`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receta }),
    });
    cargar();
  }

  async function quitarIngrediente(p: Producto, ingredienteId: string) {
    const receta = p.ingredientes.filter((r) => r.ingredienteId !== ingredienteId).map((r) => ({ ingredienteId: r.ingredienteId, cantidadUsada: Number(r.cantidadUsada) }));
    await guardarReceta(p, receta);
  }

  async function cambiarCantidad(p: Producto, ingredienteId: string, cantidad: number) {
    const receta = p.ingredientes.map((r) => ({ ingredienteId: r.ingredienteId, cantidadUsada: r.ingredienteId === ingredienteId ? cantidad : Number(r.cantidadUsada) }));
    await guardarReceta(p, receta);
  }

  async function agregarIngrediente(p: Producto) {
    const ingredienteId = nuevoIngId[p.id];
    if (!ingredienteId) return;
    const receta = [...p.ingredientes.map((r) => ({ ingredienteId: r.ingredienteId, cantidadUsada: Number(r.cantidadUsada) })), { ingredienteId, cantidadUsada: 50 }];
    await guardarReceta(p, receta);
    setNuevoIngId((prev) => ({ ...prev, [p.id]: "" }));
  }

  async function toggleAdicional(p: Producto, adicionalId: string, marcado: boolean) {
    const actuales = p.adicionales.map((a) => a.adicional.id);
    const nuevos = marcado ? [...actuales, adicionalId] : actuales.filter((id) => id !== adicionalId);
    await fetch(`/api/productos/${p.id}/adicionales`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adicionalIds: nuevos }),
    });
    cargar();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm opacity-60">
          La disponibilidad &quot;efectiva&quot; cruza el toggle manual con el stock de cada ingrediente de la receta. Ajusta stock en la pestaña Inventario y el efecto se ve aquí y en el menú del cliente al instante.
        </p>
        <button onClick={() => setMostrarNuevo(true)} className="shrink-0 text-sm font-semibold text-white rounded-full px-4 py-2 bg-gray-900">
          + Nuevo plato/bebida
        </button>
      </div>
      {productos.map((p) => {
        const abierto = expandido === p.id;
        const ingredientesDisponibles = ingredientes.filter((i) => !p.ingredientes.some((r) => r.ingredienteId === i.id));
        return (
          <div key={p.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setExpandido(abierto ? null : p.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0 grid place-items-center text-lg bg-gray-100">
                {p.imagenUrl ? <img src={p.imagenUrl} alt={p.nombre} className="w-full h-full object-cover" /> : "🍽️"}
              </span>
              <span className="font-medium flex-1">{p.nombre}</span>
              <span className="text-xs opacity-50">{p.categoria.nombre}</span>
              <span className="font-semibold text-sm w-20 text-right">{formatoCOP(p.precio)}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${p.disponibleEfectivo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {p.disponibleEfectivo ? "Disponible" : "Agotado"}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); toggleManual(p); }}
                className="w-10 h-[22px] rounded-full relative"
                style={{ background: p.disponible ? "var(--color-primario)" : "#D1D5DB" }}
              >
                <span className="w-[18px] h-[18px] rounded-full bg-white absolute top-0.5 transition-transform" style={{ transform: p.disponible ? "translateX(20px)" : "translateX(2px)" }} />
              </span>
              <span className="opacity-40">{abierto ? "▲" : "▼"}</span>
            </button>
            {abierto && (
              <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase opacity-50 mb-2">Foto del producto</p>
                  <div className="flex items-center gap-3">
                    <span className="w-16 h-16 rounded-xl overflow-hidden shrink-0 grid place-items-center text-2xl bg-gray-100">
                      {p.imagenUrl ? <img src={p.imagenUrl} alt={p.nombre} className="w-full h-full object-cover" /> : "🍽️"}
                    </span>
                    <input
                      type="url"
                      defaultValue={p.imagenUrl ?? ""}
                      onBlur={(e) => guardarImagen(p, e.target.value)}
                      placeholder="https://... enlace a la foto del plato"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase opacity-50 mb-2">Receta (ingredientes y peso usado)</p>
                  <div className="space-y-1.5">
                    {p.ingredientes.map((r) => {
                      const ok = Number(r.ingrediente.stockActual) >= Number(r.cantidadUsada);
                      return (
                        <div key={r.ingredienteId} className="flex items-center gap-2 text-sm">
                          <span className={`flex-1 ${ok ? "" : "text-red-600 font-medium"}`}>{r.ingrediente.nombre} {!ok && "⚠ sin stock suficiente"}</span>
                          <input
                            type="number"
                            defaultValue={r.cantidadUsada}
                            onBlur={(e) => cambiarCantidad(p, r.ingredienteId, Number(e.target.value))}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right"
                          />
                          <span className="opacity-50 w-10">{r.ingrediente.unidadMedida}</span>
                          <button onClick={() => quitarIngrediente(p, r.ingredienteId)} className="text-red-500 px-1">×</button>
                        </div>
                      );
                    })}
                    {p.ingredientes.length === 0 && <p className="text-sm opacity-40">Sin receta configurada — se considera siempre disponible por stock.</p>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={nuevoIngId[p.id] ?? ""}
                      onChange={(e) => { setNuevoIngId((prev) => ({ ...prev, [p.id]: e.target.value })); }}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">+ Agregar ingrediente...</option>
                      {ingredientesDisponibles.map((i) => (
                        <option key={i.id} value={i.id}>{i.nombre}</option>
                      ))}
                    </select>
                    <button onClick={() => agregarIngrediente(p)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">Agregar</button>
                  </div>
                  {p.ingredientes.length > 0 && (
                    <label className="flex items-start gap-2 mt-3 text-sm cursor-pointer">
                      <input type="checkbox" checked={p.venderSinStock} onChange={() => toggleVenderSinStock(p)} className="mt-0.5" />
                      <span>
                        Vender aunque no alcance el inventario
                        <span className="block text-xs opacity-50">Si lo activas, este plato nunca se marca &quot;Agotado&quot; por falta de stock de la receta (el stock se sigue descontando y puede quedar en negativo).</span>
                      </span>
                    </label>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase opacity-50 mb-2">Adicionales ofrecidos</p>
                  <div className="flex flex-wrap gap-3">
                    {adicionales.map((a) => (
                      <label key={a.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={p.adicionales.some((pa) => pa.adicional.id === a.id)}
                          onChange={(e) => toggleAdicional(p, a.id, e.target.checked)}
                        />
                        {a.nombre} <span className="opacity-50">+{formatoCOP(a.precio)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {mostrarNuevo && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostrarNuevo(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:m-auto sm:relative sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">Nuevo plato o bebida</h3>

            <label className="block text-xs font-medium opacity-70 mt-4 mb-1">Nombre *</label>
            <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. Limonada de coco" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Categoría *</label>
            <select value={nuevoCategoriaId} onChange={(e) => setNuevoCategoriaId(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              {categorias.length === 0 && <option value="">Sin categorías creadas</option>}
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Precio (COP) *</label>
            <input type="number" min={0} value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Estación de cocina</label>
            <select value={nuevaEstacion} onChange={(e) => setNuevaEstacion(e.target.value as typeof nuevaEstacion)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
              {Object.entries(ETIQUETA_ESTACION).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium opacity-70 mt-3 mb-1">Descripción (opcional)</label>
            <input value={nuevoDescripcion} onChange={(e) => setNuevoDescripcion(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />

            <p className="text-xs opacity-50 mt-3">Después de crearlo puedes agregarle foto, receta y adicionales expandiéndolo en la lista.</p>

            <button onClick={crearProducto} className="w-full text-white rounded-xl py-3 font-semibold mt-4 bg-gray-900">
              Crear producto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
