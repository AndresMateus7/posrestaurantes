"use client";

import { useCallback, useEffect, useState } from "react";

type IngredienteMenu = { id: string; nombre: string };
type AdicionalMenu = { id: string; nombre: string; precio: number };
type ProductoMenu = {
  id: string;
  categoriaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  disponibleEfectivo: boolean;
  ingredientes: IngredienteMenu[];
  adicionales: AdicionalMenu[];
};
type Categoria = { id: string; nombre: string; activo: boolean };
type LineaPedido = { producto: ProductoMenu; cantidad: number; ingredientesRemovidos: string[]; adicionales: string[] };
type ModalProducto = { producto: ProductoMenu; cantidad: number; excluidos: Set<string>; adicionales: Set<string> };

// Forma en que /api/productos entrega cada producto (con la receta y adicionales sin aplanar).
type ProductoApi = {
  id: string;
  categoriaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  disponibleEfectivo: boolean;
  ingredientes: { removible: boolean; ingrediente: { id: string; nombre: string } }[];
  adicionales: { adicional: { id: string; nombre: string; precio: number; activo: boolean } }[];
};

const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function aProductoMenu(p: ProductoApi): ProductoMenu {
  return {
    id: p.id,
    categoriaId: p.categoriaId,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    imagenUrl: p.imagenUrl,
    disponibleEfectivo: p.disponibleEfectivo,
    // Solo los ingredientes que el cliente puede quitar, igual que en el menu por QR.
    ingredientes: p.ingredientes.filter((pi) => pi.removible).map((pi) => ({ id: pi.ingrediente.id, nombre: pi.ingrediente.nombre })),
    adicionales: p.adicionales.filter((pa) => pa.adicional.activo).map((pa) => ({ id: pa.adicional.id, nombre: pa.adicional.nombre, precio: pa.adicional.precio })),
  };
}

/** Un plato del carrito tal como lo recibe la API de pedidos. */
export type ItemEnvio = { productoId: string; cantidad: number; ingredientesRemovidos: string[]; adicionales: string[] };
/** Lo que responde quien manda el pedido: el mensaje de exito o el error (con `codigo` si la API lo trae). */
export type ResultadoEnvio = { mensaje: string } | { error: string; codigo?: string };

/**
 * Pantalla para elegir platos del menu y mandarlos a cocina. La usan el mesero (pedido de una mesa) y
 * caja (pedido para llevar / domicilio): quien la usa decide a donde se envia con `onEnviar`.
 */
export function PedidoMesero({
  titulo,
  tituloCarrito,
  onCerrar,
  onEnviar,
  onEnviado,
}: {
  titulo: string;
  tituloCarrito: string;
  onCerrar: () => void;
  onEnviar: (items: ItemEnvio[]) => Promise<ResultadoEnvio>;
  onEnviado: (mensaje: string) => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<ProductoMenu[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<LineaPedido[]>([]);
  const [modal, setModal] = useState<ModalProducto | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarProductos = useCallback(
    () => fetch("/api/productos").then((r) => r.json()).then((prods: ProductoApi[]) => setProductos(prods.map(aProductoMenu))),
    []
  );

  useEffect(() => {
    fetch("/api/categorias")
      .then((r) => r.json())
      .then((cats: Categoria[]) => {
        const activas = cats.filter((c) => c.activo);
        setCategorias(activas);
        setCategoriaActiva(activas[0]?.id ?? null);
      });
    cargarProductos();
  }, [cargarProductos]);

  const buscando = busqueda.trim().length > 0;
  const productosVisibles = buscando
    ? productos.filter((p) => normalizar(p.nombre).includes(normalizar(busqueda.trim())))
    : productos.filter((p) => p.categoriaId === categoriaActiva);

  function precioLinea(linea: LineaPedido) {
    const extras = linea.producto.adicionales.filter((a) => linea.adicionales.includes(a.id)).reduce((acc, a) => acc + a.precio, 0);
    return (linea.producto.precio + extras) * linea.cantidad;
  }
  const totalCarrito = carrito.reduce((acc, l) => acc + precioLinea(l), 0);
  const cantidadCarrito = carrito.reduce((acc, l) => acc + l.cantidad, 0);

  function precioUnitarioModal() {
    if (!modal) return 0;
    const extras = modal.producto.adicionales.filter((a) => modal.adicionales.has(a.id)).reduce((acc, a) => acc + a.precio, 0);
    return modal.producto.precio + extras;
  }

  function agregarAlPedido() {
    if (!modal) return;
    setCarrito((prev) => [
      ...prev,
      { producto: modal.producto, cantidad: modal.cantidad, ingredientesRemovidos: [...modal.excluidos], adicionales: [...modal.adicionales] },
    ]);
    setModal(null);
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const resultado = await onEnviar(
        carrito.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad, ingredientesRemovidos: l.ingredientesRemovidos, adicionales: l.adicionales }))
      );
      if ("error" in resultado) {
        if (resultado.codigo === "producto_agotado") cargarProductos();
        setError(resultado.error);
        return;
      }
      onEnviado(resultado.mensaje);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      <header className="bg-white shadow-sm shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onCerrar} aria-label="Volver" className="w-9 h-9 rounded-full grid place-items-center text-xl bg-black/5">
            ←
          </button>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">{titulo}</h2>
            <p className="text-xs opacity-60">Elige los platos y envíalos a cocina</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar plato o bebida…"
            className="w-full border border-gray-300 rounded-full px-4 py-2 text-sm"
          />
        </div>
        {!buscando && (
          <nav className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoriaActiva(c.id)}
                className="shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium"
                style={categoriaActiva === c.id ? { background: "var(--color-primario)", color: "#fff", borderColor: "var(--color-primario)" } : { borderColor: "#D1D5DB" }}
              >
                {c.nombre}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">
          {productosVisibles.map((p) => (
            <article key={p.id} className={`bg-white rounded-2xl border border-black/5 shadow-sm p-3 flex items-center gap-3 ${p.disponibleEfectivo ? "" : "opacity-50"}`}>
              <span className="w-14 h-14 rounded-xl overflow-hidden shrink-0 grid place-items-center text-2xl bg-gray-100">
                {p.imagenUrl ? <img src={p.imagenUrl} alt={p.nombre} className="w-full h-full object-cover" /> : "🍽️"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.nombre}</p>
                <p className="text-sm font-semibold" style={{ color: "var(--color-primario)" }}>
                  {formatoCOP(p.precio)}
                </p>
              </div>
              {p.disponibleEfectivo ? (
                <button
                  onClick={() => setModal({ producto: p, cantidad: 1, excluidos: new Set(), adicionales: new Set() })}
                  className="text-white text-sm font-medium rounded-full px-4 py-1.5"
                  style={{ background: "var(--color-primario)" }}
                >
                  Agregar
                </button>
              ) : (
                <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-3 py-1">Agotado</span>
              )}
            </article>
          ))}
          {productosVisibles.length === 0 && (
            <p className="text-sm opacity-50 text-center py-8">{buscando ? "No se encontró ningún plato con ese nombre." : "No hay productos en esta categoría."}</p>
          )}
        </div>
      </main>

      {cantidadCarrito > 0 && (
        <button
          onClick={() => setVerCarrito(true)}
          className="fixed bottom-4 left-4 right-4 max-w-3xl mx-auto text-white rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between z-10"
          style={{ background: "var(--color-primario)" }}
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="bg-white/25 rounded-full w-6 h-6 grid place-items-center text-sm">{cantidadCarrito}</span>
            Ver pedido
          </span>
          <span className="font-bold">{formatoCOP(totalCarrito)}</span>
        </button>
      )}

      {modal && (
        <div className="fixed inset-0 z-20">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5">
            <h3 className="text-lg font-semibold">{modal.producto.nombre}</h3>
            {modal.producto.descripcion && <p className="text-sm opacity-70 mt-1">{modal.producto.descripcion}</p>}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xl font-bold" style={{ color: "var(--color-primario)" }}>
                {formatoCOP(precioUnitarioModal())}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => setModal((m) => (m ? { ...m, cantidad: Math.max(1, m.cantidad - 1) } : m))} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">
                  −
                </button>
                <span className="w-6 text-center font-medium">{modal.cantidad}</span>
                <button onClick={() => setModal((m) => (m ? { ...m, cantidad: Math.min(99, m.cantidad + 1) } : m))} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">
                  +
                </button>
              </div>
            </div>

            {modal.producto.ingredientes.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium opacity-70 mb-1">Ingredientes (desmarca los que el cliente no quiere)</p>
                <div className="space-y-1.5">
                  {modal.producto.ingredientes.map((ing) => (
                    <label key={ing.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!modal.excluidos.has(ing.id)}
                        onChange={(e) =>
                          setModal((m) => {
                            if (!m) return m;
                            const excluidos = new Set(m.excluidos);
                            if (e.target.checked) excluidos.delete(ing.id);
                            else excluidos.add(ing.id);
                            return { ...m, excluidos };
                          })
                        }
                      />
                      {ing.nombre}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {modal.producto.adicionales.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium opacity-70 mb-1">Adicionales</p>
                <div className="space-y-1.5">
                  {modal.producto.adicionales.map((a) => (
                    <label key={a.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={modal.adicionales.has(a.id)}
                          onChange={(e) =>
                            setModal((m) => {
                              if (!m) return m;
                              const adicionales = new Set(m.adicionales);
                              if (e.target.checked) adicionales.add(a.id);
                              else adicionales.delete(a.id);
                              return { ...m, adicionales };
                            })
                          }
                        />
                        {a.nombre}
                      </span>
                      <span className="opacity-60">+{formatoCOP(a.precio)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button onClick={agregarAlPedido} className="w-full text-white rounded-xl py-3 font-semibold mt-5" style={{ background: "var(--color-primario)" }}>
              Agregar al pedido · {formatoCOP(precioUnitarioModal() * modal.cantidad)}
            </button>
          </div>
        </div>
      )}

      {verCarrito && (
        <div className="fixed inset-0 z-20">
          <div className="absolute inset-0 bg-black/50" onClick={() => setVerCarrito(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg">{tituloCarrito}</h3>
              <button onClick={() => setVerCarrito(false)} className="text-2xl leading-none opacity-50">
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {carrito.length === 0 && <p className="text-sm opacity-50 text-center py-6">El pedido está vacío.</p>}
              {carrito.map((linea, idx) => {
                const excluidos = linea.producto.ingredientes.filter((i) => linea.ingredientesRemovidos.includes(i.id));
                const extras = linea.producto.adicionales.filter((a) => linea.adicionales.includes(a.id));
                return (
                  <div key={idx} className="flex items-start gap-3 border-b border-gray-100 pb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {linea.producto.nombre} <span className="opacity-50">× {linea.cantidad}</span>
                      </p>
                      {excluidos.length > 0 && <p className="text-xs opacity-50">Sin: {excluidos.map((i) => i.nombre).join(", ")}</p>}
                      {extras.length > 0 && (
                        <p className="text-xs" style={{ color: "var(--color-primario)" }}>
                          + {extras.map((a) => a.nombre).join(", +")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatoCOP(precioLinea(linea))}</span>
                      <button
                        onClick={() => {
                          setCarrito((prev) => prev.filter((_, i) => i !== idx));
                          if (carrito.length === 1) setVerCarrito(false);
                        }}
                        className="text-red-500 text-lg leading-none"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t border-gray-100">
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Total</span>
                <span>{formatoCOP(totalCarrito)}</span>
              </div>
              <button onClick={enviar} disabled={carrito.length === 0 || enviando} className="w-full text-white rounded-xl py-3 font-semibold disabled:opacity-40" style={{ background: "var(--color-primario)" }}>
                {enviando ? "Enviando..." : "Enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
