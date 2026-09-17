"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

type Seccion = { href: string; titulo: string; descripcion: string };

const ETIQUETA_ROL: Record<string, string> = {
  admin: "Administrador",
  mesero: "Mesero",
  cocina: "Cocina",
  caja: "Caja",
};

export function HomeHub({ restauranteNombre, rol, secciones }: { restauranteNombre: string; rol: string; secciones: Seccion[] }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-fondo)", fontFamily: "var(--fuente)" }}>
      <header className="shadow-sm bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--color-secundario)" }}>
            {restauranteNombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-semibold leading-tight">{restauranteNombre}</h1>
            <p className="text-xs opacity-60">Sesión de {ETIQUETA_ROL[rol] ?? rol}</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="ml-auto text-xs font-semibold rounded-full px-3 py-2 border border-gray-300">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-3">¿A dónde quieres ir?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {secciones.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="bg-white rounded-2xl shadow-sm p-5 hover:brightness-95 transition border-2 border-transparent hover:border-current"
              style={{ color: "var(--color-primario)" }}
            >
              <p className="text-lg font-semibold" style={{ color: "var(--color-texto)" }}>
                {s.titulo}
              </p>
              <p className="text-sm opacity-60 mt-1" style={{ color: "var(--color-texto)" }}>
                {s.descripcion}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
