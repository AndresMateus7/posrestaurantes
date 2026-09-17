"use client";

import { useState } from "react";
import { TemaTab } from "./TemaTab";
import { ProductosTab } from "./ProductosTab";
import { InventarioTab } from "./InventarioTab";
import { MesasTab } from "./MesasTab";
import { PlanoTab } from "./PlanoTab";
import { UsuariosTab } from "./UsuariosTab";

const TABS = [
  { id: "tema", nombre: "Tema" },
  { id: "productos", nombre: "Productos y receta" },
  { id: "inventario", nombre: "Inventario" },
  { id: "mesas", nombre: "Mesas y QR" },
  { id: "plano", nombre: "Plano del local" },
  { id: "usuarios", nombre: "Usuarios" },
] as const;

export function AdminPanel({ restauranteNombre }: { restauranteNombre: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tema");
  const [toast, setToast] = useState<string | null>(null);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="min-h-screen pb-10 bg-gray-100">
      <header className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="font-bold">⚙️ Panel de Administrador</span>
          <span className="text-xs opacity-50">{restauranteNombre}</span>
          <nav className="flex gap-1 ml-auto flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.id ? "bg-gray-100 text-gray-900" : ""}`}
              >
                {t.nombre}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "tema" && <TemaTab onGuardado={mostrarToast} />}
        {tab === "productos" && <ProductosTab onCambio={mostrarToast} />}
        {tab === "inventario" && <InventarioTab onCambio={mostrarToast} />}
        {tab === "mesas" && <MesasTab onCambio={mostrarToast} />}
        {tab === "plano" && <PlanoTab onCambio={mostrarToast} />}
        {tab === "usuarios" && <UsuariosTab onCambio={mostrarToast} />}
      </main>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg bg-gray-900">{toast}</div>
      )}
    </div>
  );
}
