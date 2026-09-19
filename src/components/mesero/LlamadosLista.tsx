"use client";

export type LlamadoPendiente = {
  id: string;
  tipo: "llamar_mesero" | "solicitar_cuenta";
  mesaNumero: string;
  comentario: string | null;
  creadoEn: string;
  // Solo lo trae la API para caja/admin (mesero que atiende la mesa; null = sin mesero).
  meseroNombre?: string | null;
};

/**
 * Lista de "Llaman al mesero" / "Piden la cuenta" pendientes. La usan el panel
 * del mesero y Caja; un llamado sale de la lista cuando alguien pulsa "Atender"
 * o cuando se cobra la cuenta de esa mesa.
 */
export function LlamadosLista({
  llamados,
  nuevosIds,
  mostrarMesero,
  onAtender,
}: {
  llamados: LlamadoPendiente[];
  nuevosIds: Set<string>;
  mostrarMesero: boolean;
  onAtender: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {llamados.map((l) => (
        <div
          key={l.id}
          className={`flex items-center gap-3 bg-white rounded-xl border border-amber-200 px-4 py-2.5 shadow-sm ${nuevosIds.has(l.id) ? "animate-pulse" : ""}`}
        >
          <span className="text-xl">{l.tipo === "llamar_mesero" ? "🛎️" : "🧾"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {l.tipo === "llamar_mesero" ? "Llaman al mesero" : "Piden la cuenta"} — Mesa {l.mesaNumero}
            </p>
            {mostrarMesero && <p className="text-xs opacity-60">🧑‍🍳 {l.meseroNombre ?? "Sin mesero"}</p>}
            {l.comentario && <p className="text-sm mt-0.5 opacity-80 break-words">&ldquo;{l.comentario}&rdquo;</p>}
          </div>
          <button onClick={() => onAtender(l.id)} className="text-white text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "var(--color-primario)" }}>
            Atender
          </button>
        </div>
      ))}
      {llamados.length === 0 && <p className="text-sm opacity-50">No hay llamados pendientes. 👍</p>}
    </div>
  );
}
