"use client";

import { useEffect, useState } from "react";

type Tema = {
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  fuente: string;
};

const FUENTES = ["Poppins", "Inter", "Playfair Display"];

export function TemaTab({ onGuardado }: { onGuardado: (msg: string) => void }) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    fetch("/api/tema").then((r) => r.json()).then(setTema);
  }, []);

  if (!tema) return <p className="text-sm opacity-50">Cargando...</p>;

  async function guardar() {
    if (!tema) return;
    await fetch("/api/tema", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tema) });
    onGuardado("Tema guardado (PUT /api/tema) ✅ — ya se ve en /menu/[token]");
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold">Personalización y branding</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={tema.colorPrimario} onChange={(e) => setTema({ ...tema, colorPrimario: e.target.value })} className="w-9 h-9 rounded-full" />
            Color primario
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={tema.colorSecundario} onChange={(e) => setTema({ ...tema, colorSecundario: e.target.value })} className="w-9 h-9 rounded-full" />
            Color secundario
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={tema.colorFondo} onChange={(e) => setTema({ ...tema, colorFondo: e.target.value })} className="w-9 h-9 rounded-full" />
            Fondo
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={tema.colorTexto} onChange={(e) => setTema({ ...tema, colorTexto: e.target.value })} className="w-9 h-9 rounded-full" />
            Texto
          </label>
        </div>
        <label className="block text-sm">
          <span className="block mb-1 opacity-70">Tipografía</span>
          <select value={tema.fuente} onChange={(e) => setTema({ ...tema, fuente: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2">
            {FUENTES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <button onClick={guardar} className="text-white rounded-xl px-4 py-2 font-semibold text-sm" style={{ background: "var(--color-primario)" }}>
          Guardar cambios
        </button>
      </div>

      <div>
        <h2 className="font-semibold mb-2 text-sm opacity-70">Vista previa</h2>
        <div className="rounded-2xl shadow-sm overflow-hidden border border-black/5" style={{ fontFamily: tema.fuente }}>
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: tema.colorFondo }}>
            <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: tema.colorSecundario }}>LG</div>
            <div>
              <p className="font-semibold" style={{ color: tema.colorTexto }}>Restaurante La Gorda</p>
              <p className="text-xs opacity-60" style={{ color: tema.colorTexto }}>Menú digital</p>
            </div>
          </div>
          <div className="px-4 pb-3 flex gap-2" style={{ background: tema.colorFondo }}>
            <span className="text-white text-xs font-medium rounded-full px-3 py-1" style={{ background: tema.colorPrimario }}>Entradas</span>
            <span className="text-xs font-medium rounded-full px-3 py-1 border" style={{ color: tema.colorTexto, borderColor: "currentColor" }}>Bebidas</span>
          </div>
          <div className="p-4 bg-white">
            <p className="font-semibold" style={{ color: tema.colorTexto }}>Patacones con hogao</p>
            <div className="flex items-center justify-between mt-2">
              <span className="font-bold" style={{ color: tema.colorPrimario }}>$18.000</span>
              <span className="text-white text-xs font-medium rounded-full px-3 py-1.5" style={{ background: tema.colorPrimario }}>Agregar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
