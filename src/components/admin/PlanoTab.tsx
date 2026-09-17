"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TipoElemento = "mesa" | "barra" | "pared" | "caja" | "cocina" | "decoracion";
type Forma = "cuadrada" | "redonda" | "rectangular";
type ElementoPlano = { id: string; tipo: TipoElemento; forma?: Forma; x: number; y: number; ancho: number; alto: number; rotacion: number };
type Mesa = { id: string; elementoId: string; numero: string; capacidad: number; estado: string };

const ESTILO_MESA: Record<string, string> = {
  libre: "bg-gray-100 border-gray-400 text-gray-700",
  ocupada: "bg-blue-100 border-blue-500 text-blue-800",
  pedido_servido: "bg-green-100 border-green-500 text-green-800",
  cuenta_solicitada: "bg-amber-100 border-amber-500 text-amber-800",
  reservada: "bg-purple-100 border-purple-500 text-purple-800",
};
const ICONO: Record<string, string> = { barra: "🍹 Barra", pared: "Pared", caja: "💳 Caja", cocina: "🍳 Cocina", decoracion: "Decoración" };

function tamanoDefault(tipo: TipoElemento, forma?: Forma) {
  if (tipo === "mesa") return forma === "rectangular" ? { ancho: 110, alto: 70 } : { ancho: 70, alto: 70 };
  if (tipo === "barra") return { ancho: 140, alto: 50 };
  if (tipo === "pared") return { ancho: 120, alto: 14 };
  if (tipo === "caja") return { ancho: 90, alto: 60 };
  if (tipo === "cocina") return { ancho: 130, alto: 100 };
  return { ancho: 60, alto: 60 };
}

export function PlanoTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [layout, setLayout] = useState<ElementoPlano[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; offsetX: number; offsetY: number; movido: boolean } | null>(null);

  const cargar = useCallback(() => {
    fetch("/api/plano").then((r) => r.json()).then((data) => {
      setLayout(data.plano.layout);
      setMesas(data.mesas);
    });
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(nuevoLayout: ElementoPlano[]) {
    const res = await fetch("/api/plano", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: nuevoLayout }),
    });
    const data = await res.json();
    setMesas(data.mesas);
  }

  function agregar(tipo: TipoElemento, forma?: Forma) {
    const id = `el-${Date.now()}`;
    const tam = tamanoDefault(tipo, forma);
    const idx = layout.length;
    const nuevo: ElementoPlano = { id, tipo, forma, x: 30 + (idx % 6) * 95, y: 20 + Math.floor(idx / 6) * 95, ancho: tam.ancho, alto: tam.alto, rotacion: 0 };
    const nuevoLayout = [...layout, nuevo];
    setLayout(nuevoLayout);
    guardar(nuevoLayout);
    onCambio(tipo === "mesa" ? "Mesa agregada — arrástrala a su lugar" : "Elemento agregado");
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, figura: ElementoPlano) {
    const canvasRect = canvasRef.current!.getBoundingClientRect();
    arrastre.current = { id: figura.id, offsetX: e.clientX - canvasRect.left - figura.x, offsetY: e.clientY - canvasRect.top - figura.y, movido: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastre.current) return;
    arrastre.current.movido = true;
    const canvasRect = canvasRef.current!.getBoundingClientRect();
    const { id, offsetX, offsetY } = arrastre.current;
    setLayout((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              x: Math.max(0, Math.min(canvasRect.width - f.ancho, e.clientX - canvasRect.left - offsetX)),
              y: Math.max(0, Math.min(canvasRect.height - f.alto, e.clientY - canvasRect.top - offsetY)),
            }
          : f
      )
    );
  }

  function onPointerUp() {
    if (!arrastre.current) return;
    const { id, movido } = arrastre.current;
    arrastre.current = null;
    if (movido) {
      setLayout((prev) => {
        guardar(prev);
        return prev;
      });
    } else {
      setSeleccionado(id);
    }
  }

  async function actualizarMesa(mesaId: string, data: Partial<Mesa>) {
    await fetch(`/api/mesas/${mesaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    cargar();
  }

  function cambiarForma(figuraId: string, forma: Forma) {
    const nuevoLayout = layout.map((f) => (f.id === figuraId ? { ...f, forma } : f));
    setLayout(nuevoLayout);
    guardar(nuevoLayout);
  }

  function cambiarRotacion(figuraId: string, rotacion: number) {
    const nuevoLayout = layout.map((f) => (f.id === figuraId ? { ...f, rotacion } : f));
    setLayout(nuevoLayout);
    guardar(nuevoLayout);
  }

  function cambiarTamano(figuraId: string, campo: "ancho" | "alto", valor: number) {
    const nuevoLayout = layout.map((f) => (f.id === figuraId ? { ...f, [campo]: Math.max(20, valor) } : f));
    setLayout(nuevoLayout);
    guardar(nuevoLayout);
  }

  function eliminar(figuraId: string) {
    const nuevoLayout = layout.filter((f) => f.id !== figuraId);
    setLayout(nuevoLayout);
    guardar(nuevoLayout);
    setSeleccionado(null);
    onCambio("Elemento eliminado");
  }

  const figuraSeleccionada = layout.find((f) => f.id === seleccionado);
  const mesaSeleccionada = figuraSeleccionada ? mesas.find((m) => m.elementoId === figuraSeleccionada.id) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase opacity-50 mr-1">Agregar:</span>
        <button onClick={() => agregar("mesa", "cuadrada")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">▢ Mesa cuadrada</button>
        <button onClick={() => agregar("mesa", "redonda")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">○ Mesa redonda</button>
        <button onClick={() => agregar("mesa", "rectangular")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">▭ Mesa rectangular</button>
        <button onClick={() => agregar("barra")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">🍹 Barra</button>
        <button onClick={() => agregar("pared")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">▬ Pared</button>
        <button onClick={() => agregar("caja")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">💳 Caja</button>
        <button onClick={() => agregar("cocina")} className="text-xs border border-gray-300 bg-white rounded-full px-3 py-1.5">🍳 Cocina</button>
      </div>
      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative"
          style={{ height: 520, backgroundImage: "radial-gradient(#E5E7EB 1px, transparent 1px)", backgroundSize: "16px 16px", touchAction: "none" }}
        >
          {layout.map((f) => {
            const mesa = f.tipo === "mesa" ? mesas.find((m) => m.elementoId === f.id) : undefined;
            const seleccionadoClase = seleccionado === f.id ? "shadow-[0_0_0_2px_#111827]" : "";
            if (f.tipo === "mesa") {
              const clase = ESTILO_MESA[mesa?.estado ?? "libre"];
              return (
                <div
                  key={f.id}
                  onPointerDown={(e) => onPointerDown(e, f)}
                  className={`absolute flex flex-col items-center justify-center border-2 cursor-move select-none rounded-lg ${clase} ${seleccionadoClase}`}
                  style={{ left: f.x, top: f.y, width: f.ancho, height: f.alto, borderRadius: f.forma === "redonda" ? 9999 : 10, transform: `rotate(${f.rotacion ?? 0}deg)` }}
                >
                  <span className="font-bold text-lg leading-none">{mesa?.numero ?? "?"}</span>
                  <span className="text-[10px] opacity-70">{mesa ? `${mesa.capacidad}p` : ""}</span>
                </div>
              );
            }
            return (
              <div
                key={f.id}
                onPointerDown={(e) => onPointerDown(e, f)}
                className={`absolute flex items-center justify-center text-center text-xs font-medium border-2 border-dashed border-gray-400 bg-gray-50 text-gray-500 cursor-move select-none rounded-lg px-1 ${seleccionadoClase}`}
                style={{ left: f.x, top: f.y, width: f.ancho, height: f.alto, transform: `rotate(${f.rotacion ?? 0}deg)` }}
              >
                {ICONO[f.tipo] ?? f.tipo}
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex gap-3 text-[11px] flex-wrap mb-4">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" />Libre</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" />Ocupada</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400" />Servido</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Cuenta</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" />Reservada</span>
          </div>

          {!figuraSeleccionada && <p className="text-sm opacity-40">Arrastra un elemento para moverlo, o tócalo (sin arrastrar) para editarlo.</p>}

          {figuraSeleccionada && figuraSeleccionada.tipo === "mesa" && mesaSeleccionada && (
            <div key={figuraSeleccionada.id}>
              <p className="text-xs font-semibold uppercase opacity-50 mb-2">Mesa seleccionada</p>
              <label className="block text-sm mb-2">
                Número
                <input
                  defaultValue={mesaSeleccionada.numero}
                  onBlur={(e) => actualizarMesa(mesaSeleccionada.id, { numero: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                />
              </label>
              <label className="block text-sm mb-2">
                Capacidad
                <input
                  type="number"
                  defaultValue={mesaSeleccionada.capacidad}
                  onBlur={(e) => actualizarMesa(mesaSeleccionada.id, { capacidad: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                />
              </label>
              <label className="block text-sm mb-3">
                Forma
                <select
                  value={figuraSeleccionada.forma}
                  onChange={(e) => cambiarForma(figuraSeleccionada.id, e.target.value as Forma)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                >
                  <option value="cuadrada">Cuadrada</option>
                  <option value="redonda">Redonda</option>
                  <option value="rectangular">Rectangular</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="block text-sm">
                  Ancho
                  <input
                    type="number"
                    defaultValue={figuraSeleccionada.ancho}
                    onBlur={(e) => cambiarTamano(figuraSeleccionada.id, "ancho", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                  />
                </label>
                <label className="block text-sm">
                  Alto
                  <input
                    type="number"
                    defaultValue={figuraSeleccionada.alto}
                    onBlur={(e) => cambiarTamano(figuraSeleccionada.id, "alto", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                  />
                </label>
              </div>
              <label className="block text-sm mb-3">
                Rotación ({figuraSeleccionada.rotacion ?? 0}°)
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={figuraSeleccionada.rotacion ?? 0}
                  onChange={(e) => cambiarRotacion(figuraSeleccionada.id, Number(e.target.value))}
                  className="w-full mt-1"
                />
              </label>
              <p className="text-xs opacity-50 mb-3">
                Estado actual: <b>{mesaSeleccionada.estado.replace("_", " ")}</b> (lo cambia el mesero/cliente, no se edita aquí)
              </p>
              <button onClick={() => eliminar(figuraSeleccionada.id)} className="w-full border border-red-300 text-red-600 rounded-xl py-2 text-sm font-semibold">
                Eliminar mesa
              </button>
            </div>
          )}

          {figuraSeleccionada && figuraSeleccionada.tipo !== "mesa" && (
            <div key={figuraSeleccionada.id}>
              <p className="text-xs font-semibold uppercase opacity-50 mb-3">{ICONO[figuraSeleccionada.tipo] ?? figuraSeleccionada.tipo}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="block text-sm">
                  Ancho
                  <input
                    type="number"
                    defaultValue={figuraSeleccionada.ancho}
                    onBlur={(e) => cambiarTamano(figuraSeleccionada.id, "ancho", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                  />
                </label>
                <label className="block text-sm">
                  Alto
                  <input
                    type="number"
                    defaultValue={figuraSeleccionada.alto}
                    onBlur={(e) => cambiarTamano(figuraSeleccionada.id, "alto", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-1"
                  />
                </label>
              </div>
              <label className="block text-sm mb-3">
                Rotación ({figuraSeleccionada.rotacion ?? 0}°)
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={figuraSeleccionada.rotacion ?? 0}
                  onChange={(e) => cambiarRotacion(figuraSeleccionada.id, Number(e.target.value))}
                  className="w-full mt-1"
                />
              </label>
              <button onClick={() => eliminar(figuraSeleccionada.id)} className="w-full border border-red-300 text-red-600 rounded-xl py-2 text-sm font-semibold">
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
