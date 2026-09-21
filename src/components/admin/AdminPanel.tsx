"use client";

import { useCallback, useEffect, useState } from "react";
import { TemaTab } from "./TemaTab";
import { EstadisticasTab } from "./EstadisticasTab";
import { HistorialVentasTab } from "./HistorialVentasTab";
import { ProductosTab } from "./ProductosTab";
import { InventarioTab } from "./InventarioTab";
import { ArqueosInventarioTab } from "./ArqueosInventarioTab";
import { FacturasProveedorTab } from "./FacturasProveedorTab";
import { CostosTab } from "./CostosTab";
import { MesasTab } from "./MesasTab";
import { LinkDomiciliosTab } from "./LinkDomiciliosTab";
import { TicketTab } from "./TicketTab";
import { PlanoTab } from "./PlanoTab";
import { UsuariosTab } from "./UsuariosTab";
import { MeseroPanel } from "@/components/mesero/MeseroPanel";
import { useEventos } from "@/lib/useEventos";
import { useRefrescoPeriodico } from "@/lib/useRefrescoPeriodico";
import { reproducirBeep } from "@/lib/beep";

const TABS = [
  { id: "estadisticas", nombre: "Estadísticas" },
  { id: "salon", nombre: "Salón en vivo" },
  { id: "historial", nombre: "Historial de ventas" },
  { id: "tema", nombre: "Tema" },
  { id: "productos", nombre: "Productos y receta" },
  { id: "inventario", nombre: "Inventario" },
  { id: "arqueos", nombre: "Arqueos de inventario" },
  { id: "facturas", nombre: "Facturas de proveedor" },
  { id: "costos", nombre: "Costos y precios" },
  { id: "mesas", nombre: "Mesas y QR" },
  { id: "domicilios", nombre: "Link de domicilios" },
  { id: "ticket", nombre: "Ticket de impresión" },
  { id: "plano", nombre: "Plano del local" },
  { id: "usuarios", nombre: "Usuarios" },
] as const;

export function AdminPanel({ restauranteNombre, usuarioId }: { restauranteNombre: string; usuarioId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("estadisticas");
  const [toast, setToast] = useState<string | null>(null);
  // Conteos de inventario que envio Caja y esperan la revision del administrador.
  const [arqueosPendientes, setArqueosPendientes] = useState(0);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const cargarPendientes = useCallback(() => {
    fetch("/api/arqueos-inventario?resumen=pendientes")
      .then((r) => r.json())
      .then((d: { pendientes?: number }) => {
        if (typeof d.pendientes === "number") setArqueosPendientes(d.pendientes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  // Red de seguridad del canal en vivo.
  useRefrescoPeriodico(cargarPendientes, 30000);

  useEventos({
    "arqueo-enviado": (payload) => {
      const p = payload as { por?: string };
      cargarPendientes();
      reproducirBeep();
      mostrarToast(`📋 Nuevo conteo de inventario${p.por ? ` de ${p.por}` : ""}: ábrelo en "Arqueos de inventario"`);
    },
    "arqueo-actualizado": () => cargarPendientes(),
  });

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
                {t.id === "arqueos" && arqueosPendientes > 0 && (
                  <span className="ml-1.5 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold" title="Conteos por revisar">
                    {arqueosPendientes}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "estadisticas" && <EstadisticasTab />}
        {tab === "salon" && <MeseroPanel embebido usuarioId={usuarioId} rol="admin" />}
        {tab === "historial" && <HistorialVentasTab onCambio={mostrarToast} />}
        {tab === "tema" && <TemaTab onGuardado={mostrarToast} />}
        {tab === "productos" && <ProductosTab onCambio={mostrarToast} />}
        {tab === "inventario" && <InventarioTab onCambio={mostrarToast} />}
        {tab === "arqueos" && <ArqueosInventarioTab onCambio={mostrarToast} />}
        {tab === "facturas" && <FacturasProveedorTab onCambio={mostrarToast} onIrACostos={() => setTab("costos")} />}
        {tab === "costos" && <CostosTab onCambio={mostrarToast} />}
        {tab === "mesas" && <MesasTab onCambio={mostrarToast} />}
        {tab === "domicilios" && <LinkDomiciliosTab onCambio={mostrarToast} />}
        {tab === "ticket" && <TicketTab onCambio={mostrarToast} />}
        {tab === "plano" && <PlanoTab onCambio={mostrarToast} />}
        {tab === "usuarios" && <UsuariosTab onCambio={mostrarToast} />}
      </main>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm shadow-lg bg-gray-900">{toast}</div>
      )}
    </div>
  );
}
