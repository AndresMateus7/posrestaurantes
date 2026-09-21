"use client";

// Interruptor de encendido/apagado (la perilla queda dentro del carril en ambos estados).
export function Interruptor({ activo, onCambio, etiqueta, deshabilitado }: { activo: boolean; onCambio: (nuevo: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className="w-10 h-[22px] rounded-full relative transition shrink-0 disabled:opacity-50"
      style={{ background: activo ? "var(--color-primario)" : "#D1D5DB" }}
    >
      <span className="w-[18px] h-[18px] rounded-full bg-white absolute top-0.5 left-0 transition-transform" style={{ transform: activo ? "translateX(20px)" : "translateX(2px)" }} />
    </button>
  );
}
