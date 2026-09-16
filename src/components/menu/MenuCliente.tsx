"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Ingrediente = { id: string; nombre: string };
type AdicionalMenu = { id: string; nombre: string; precio: number };
type Alergeno = { id: string; nombre: string; icono: string | null };
type Producto = {
  id: string;
  categoriaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponibleEfectivo: boolean;
  alergenos: Alergeno[];
  ingredientes: Ingrediente[];
  adicionales: AdicionalMenu[];
};
type Categoria = { id: string; nombre: string };
type Tema = { colorPrimario: string; colorSecundario: string; colorFondo: string; colorTexto: string; fuente: string };
type MenuData = {
  restaurante: { nombre: string; rotaQr: boolean };
  tema: Tema;
  mesa: { numero: string; estado: string };
  puedeEnviarPedido: boolean;
  categorias: Categoria[];
  productos: Producto[];
};
type ItemCarrito = { producto: Producto; cantidad: number; ingredientesRemovidos: string[]; adicionales: string[] };

const ICONOS_ALERGENOS: Record<string, string> = { Gluten: "🌾", Lácteos: "🥛", "Frutos secos": "🥜", Mariscos: "🦐", Huevo: "🥚" };
const formatoCOP = (v: number) => "$" + v.toLocaleString("es-CO");

export function MenuCliente({ token }: { token: string }) {
  const [data, setData] = useState<MenuData | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [modalProducto, setModalProducto] = useState<{ producto: Producto; cantidad: number; excluidos: Set<string>; adicionales: Set<string> } | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cargar = useCallback(() => {
    fetch(`/api/public/menu/${token}`).then((r) => r.json()).then((d: MenuData) => {
      setData(d);
      setCategoriaActiva((prev) => prev ?? d.categorias[0]?.id ?? null);
    });
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const es = new EventSource(`/api/public/eventos/${token}`);
    ["mesa-actualizada", "tema-actualizado", "producto-actualizado", "inventario-actualizado", "restaurante-actualizado"].forEach((tipo) => {
      es.addEventListener(tipo, () => cargar());
    });
    return () => es.close();
  }, [token, cargar]);

  function mostrarToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 2200);
  }

  function abrirModal(producto: Producto) {
    setModalProducto({ producto, cantidad: 1, excluidos: new Set(), adicionales: new Set() });
  }

  function precioUnitarioModal() {
    if (!modalProducto) return 0;
    const extras = modalProducto.producto.adicionales.filter((a) => modalProducto.adicionales.has(a.id)).reduce((acc, a) => acc + a.precio, 0);
    return modalProducto.producto.precio + extras;
  }

  function agregarAlCarrito() {
    if (!modalProducto) return;
    setCarrito((prev) => [
      ...prev,
      {
        producto: modalProducto.producto,
        cantidad: modalProducto.cantidad,
        ingredientesRemovidos: [...modalProducto.excluidos],
        adicionales: [...modalProducto.adicionales],
      },
    ]);
    mostrarToast(`${modalProducto.producto.nombre} agregado (${modalProducto.cantidad})`);
    setModalProducto(null);
  }

  function precioLinea(item: ItemCarrito) {
    const extras = item.producto.adicionales.filter((a) => item.adicionales.includes(a.id)).reduce((acc, a) => acc + a.precio, 0);
    return (item.producto.precio + extras) * item.cantidad;
  }

  const totalCarrito = carrito.reduce((acc, i) => acc + precioLinea(i), 0);
  const cantidadCarrito = carrito.reduce((acc, i) => acc + i.cantidad, 0);

  async function enviarPedido() {
    setEnviando(true);
    try {
      const res = await fetch("/api/public/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken: token,
          items: carrito.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad, ingredientesRemovidos: i.ingredientesRemovidos, adicionales: i.adicionales })),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        mostrarToast(body.codigo === "producto_agotado" ? "Un producto se agotó justo ahora, revisa tu pedido 😕" : "No se pudo enviar el pedido");
        return;
      }
      mostrarToast("Pedido enviado a cocina 👨‍🍳");
      setCarrito([]);
      setCarritoAbierto(false);
      cargar();
    } finally {
      setEnviando(false);
    }
  }

  async function accionRapida(ruta: "llamar-mesero" | "solicitar-cuenta", mensaje: string) {
    await fetch(`/api/public/mesas/${token}/${ruta}`, { method: "POST" });
    mostrarToast(mensaje);
  }

  if (!data) return null;

  const tema = data.tema;
  const vars = {
    "--color-primario": tema.colorPrimario,
    "--color-secundario": tema.colorSecundario,
    "--color-fondo": tema.colorFondo,
    "--color-texto": tema.colorTexto,
    "--fuente": tema.fuente,
  } as React.CSSProperties;

  const productosVisibles = data.productos.filter((p) => p.categoriaId === categoriaActiva);

  return (
    <div style={{ ...vars, background: "var(--color-fondo)", color: "var(--color-texto)", fontFamily: "var(--fuente)" }} className="min-h-screen pb-28">
      {!data.puedeEnviarPedido && (
        <div className="bg-amber-500/90 text-white text-xs px-4 py-2 text-center font-medium">
          🔒 Esta mesa aún no ha sido abierta por un mesero — puedes ver el menú, pero el pedido se habilita cuando la abran.
        </div>
      )}

      <header className="sticky top-0 z-30 shadow-sm" style={{ background: "#fff" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full grid place-items-center text-white font-bold text-lg shrink-0" style={{ background: "var(--color-secundario)" }}>
            {data.restaurante.nombre.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight truncate">{data.restaurante.nombre}</h1>
            <p className="text-xs opacity-60">Menú digital</p>
          </div>
          <div className="ml-auto shrink-0 flex flex-col items-end gap-1.5">
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wide opacity-60 block">Mesa</span>
              <span className="font-bold text-lg leading-none" style={{ color: "var(--color-primario)" }}>{data.mesa.numero}</span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => accionRapida("llamar-mesero", "Mesero avisado, ya te atiende 🛎️")} className="w-8 h-8 rounded-full grid place-items-center text-base bg-black/5 active:scale-90 transition">🛎️</button>
              <button onClick={() => accionRapida("solicitar-cuenta", "Cuenta solicitada 🧾")} className="w-8 h-8 rounded-full grid place-items-center text-base bg-black/5 active:scale-90 transition">🧾</button>
            </div>
          </div>
        </div>
        <nav className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {data.categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoriaActiva(c.id)}
              className="shrink-0 px-4 py-1.5 rounded-full border text-sm font-medium transition"
              style={
                categoriaActiva === c.id
                  ? { background: "var(--color-primario)", color: "#fff", borderColor: "var(--color-primario)" }
                  : { borderColor: "#D1D5DB" }
              }
            >
              {c.nombre}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {productosVisibles.map((p) => (
            <article key={p.id} className={`rounded-2xl overflow-hidden shadow-sm border border-black/5 flex flex-col ${!p.disponibleEfectivo ? "grayscale opacity-60" : ""}`} style={{ background: "#fff" }}>
              <div className="h-28 grid place-items-center text-4xl relative" style={{ background: "color-mix(in srgb, var(--color-primario) 10%, transparent)" }}>
                🍽️
                {!p.disponibleEfectivo && <span className="absolute top-2 right-2 bg-gray-800 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">AGOTADO</span>}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold">{p.nombre}</h3>
                <p className="text-xs opacity-60 mt-1 flex-1">{p.descripcion}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.alergenos.map((a) => (
                    <span key={a.id} className="text-[10px] bg-black/5 rounded-full px-2 py-0.5">{ICONOS_ALERGENOS[a.nombre] ?? "⚠️"} {a.nombre}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold" style={{ color: "var(--color-primario)" }}>{formatoCOP(p.precio)}</span>
                  {p.disponibleEfectivo ? (
                    <button onClick={() => abrirModal(p)} className="text-white text-sm font-medium rounded-full px-4 py-1.5" style={{ background: "var(--color-primario)" }}>
                      Agregar
                    </button>
                  ) : (
                    <button disabled className="bg-gray-200 text-gray-500 text-sm font-medium rounded-full px-4 py-1.5 cursor-not-allowed">Agotado</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {cantidadCarrito > 0 && (
        <button
          onClick={() => setCarritoAbierto(true)}
          className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto text-white rounded-2xl shadow-xl px-5 py-4 flex items-center justify-between z-30"
          style={{ background: "var(--color-primario)" }}
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="bg-white/25 rounded-full w-6 h-6 grid place-items-center text-sm">{cantidadCarrito}</span>
            Ver pedido
          </span>
          <span className="font-bold">{formatoCOP(totalCarrito)}</span>
        </button>
      )}

      {modalProducto && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalProducto(null)} />
          <div className="absolute bottom-0 left-0 right-0 sm:m-auto sm:relative sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl" style={{ background: "#fff" }}>
            <div className="p-5">
              <div className="w-full h-32 rounded-2xl grid place-items-center text-5xl mb-4" style={{ background: "color-mix(in srgb, var(--color-primario) 12%, transparent)" }}>🍽️</div>
              <h3 className="text-lg font-semibold">{modalProducto.producto.nombre}</h3>
              <p className="text-sm opacity-70 mt-1">{modalProducto.producto.descripcion}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {modalProducto.producto.alergenos.map((a) => (
                  <span key={a.id} className="text-[10px] bg-black/5 rounded-full px-2 py-0.5">{ICONOS_ALERGENOS[a.nombre] ?? "⚠️"} {a.nombre}</span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xl font-bold" style={{ color: "var(--color-primario)" }}>{formatoCOP(precioUnitarioModal())}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setModalProducto((m) => (m ? { ...m, cantidad: Math.max(1, m.cantidad - 1) } : m))} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">−</button>
                  <span className="w-6 text-center font-medium">{modalProducto.cantidad}</span>
                  <button onClick={() => setModalProducto((m) => (m ? { ...m, cantidad: m.cantidad + 1 } : m))} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">+</button>
                </div>
              </div>

              {modalProducto.producto.ingredientes.length > 0 && (
                <div className="mt-4">
                  <label className="block text-xs font-medium opacity-70 mb-1">Quitar algún ingrediente</label>
                  <div className="space-y-1.5">
                    {modalProducto.producto.ingredientes.map((ing) => (
                      <label key={ing.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!modalProducto.excluidos.has(ing.id)}
                          onChange={(e) => {
                            setModalProducto((m) => {
                              if (!m) return m;
                              const excluidos = new Set(m.excluidos);
                              if (e.target.checked) excluidos.delete(ing.id); else excluidos.add(ing.id);
                              return { ...m, excluidos };
                            });
                          }}
                        />
                        <span>{ing.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {modalProducto.producto.adicionales.length > 0 && (
                <div className="mt-4">
                  <label className="block text-xs font-medium opacity-70 mb-1">Adicionar</label>
                  <div className="space-y-1.5">
                    {modalProducto.producto.adicionales.map((a) => (
                      <label key={a.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={modalProducto.adicionales.has(a.id)}
                            onChange={(e) => {
                              setModalProducto((m) => {
                                if (!m) return m;
                                const adicionales = new Set(m.adicionales);
                                if (e.target.checked) adicionales.add(a.id); else adicionales.delete(a.id);
                                return { ...m, adicionales };
                              });
                            }}
                          />
                          {a.nombre}
                        </span>
                        <span className="opacity-60">+{formatoCOP(a.precio)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={agregarAlCarrito} className="w-full text-white rounded-xl py-3 font-semibold mt-4 flex items-center justify-center gap-2" style={{ background: "var(--color-primario)" }}>
                Agregar al pedido <span className="font-bold">{formatoCOP(precioUnitarioModal() * modalProducto.cantidad)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {carritoAbierto && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCarritoAbierto(false)} />
          <div className="absolute bottom-0 left-0 right-0 sm:top-0 sm:right-0 sm:left-auto sm:h-full sm:w-96 flex flex-col max-h-[85vh] sm:max-h-full rounded-t-3xl sm:rounded-none" style={{ background: "#fff" }}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-lg">Tu pedido — Mesa {data.mesa.numero}</h3>
              <button onClick={() => setCarritoAbierto(false)} className="text-2xl leading-none opacity-50">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {carrito.length === 0 && <p className="text-sm opacity-50 text-center py-8">Tu pedido está vacío.</p>}
              {carrito.map((item, idx) => {
                const excluidos = item.producto.ingredientes.filter((i) => item.ingredientesRemovidos.includes(i.id));
                const extras = item.producto.adicionales.filter((a) => item.adicionales.includes(a.id));
                return (
                  <div key={idx} className="flex items-start gap-3 border-b border-gray-100 pb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.producto.nombre} <span className="opacity-50">× {item.cantidad}</span></p>
                      {excluidos.length > 0 && <p className="text-xs opacity-50">Sin: {excluidos.map((i) => i.nombre).join(", ")}</p>}
                      {extras.length > 0 && <p className="text-xs" style={{ color: "var(--color-primario)" }}>+ {extras.map((a) => a.nombre).join(", +")}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatoCOP(precioLinea(item))}</span>
                      <button onClick={() => setCarrito((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 text-lg leading-none">&times;</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t border-gray-100">
              <div className="flex justify-between text-sm mb-1"><span>Subtotal</span><span>{formatoCOP(totalCarrito)}</span></div>
              <div className="flex justify-between font-bold text-lg mb-4"><span>Total</span><span>{formatoCOP(totalCarrito)}</span></div>
              <button
                onClick={enviarPedido}
                disabled={carrito.length === 0 || !data.puedeEnviarPedido || enviando}
                className="w-full text-white rounded-xl py-3 font-semibold disabled:opacity-40"
                style={{ background: "var(--color-primario)" }}
              >
                {enviando ? "Enviando..." : data.puedeEnviarPedido ? "Enviar pedido a cocina" : "Esperando a que el mesero abra la mesa..."}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg" style={{ background: "var(--color-secundario)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
