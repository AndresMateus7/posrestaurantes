"use client";

import { useCallback, useEffect, useState } from "react";

type Usuario = { id: string; nombre: string; email: string; rol: string; activo: boolean; creadoEn: string };

const ETIQUETA_ROL: Record<string, string> = { admin: "Administrador", mesero: "Mesero", cocina: "Cocina", caja: "Caja" };

export function UsuariosTab({ onCambio }: { onCambio: (msg: string) => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("mesero");
  const [error, setError] = useState<string | null>(null);
  const [cambiandoPasswordDe, setCambiandoPasswordDe] = useState<string | null>(null);
  const [passwordNueva, setPasswordNueva] = useState("");

  const cargar = useCallback(() => fetch("/api/usuarios").then((r) => r.json()).then(setUsuarios), []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, password, rol }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el usuario");
      return;
    }
    setNombre("");
    setEmail("");
    setPassword("");
    setRol("mesero");
    cargar();
    onCambio(`Usuario ${data.nombre} creado`);
  }

  async function actualizarUsuario(u: Usuario, cambios: Partial<{ rol: string; activo: boolean; password: string }>) {
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok) {
      onCambio(data.error ?? "No se pudo actualizar el usuario");
      return;
    }
    cargar();
  }

  function confirmarPassword(u: Usuario) {
    if (!passwordNueva || passwordNueva.length < 6) {
      onCambio("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    actualizarUsuario(u, { password: passwordNueva });
    setCambiandoPasswordDe(null);
    setPasswordNueva("");
    onCambio(`Contraseña de ${u.nombre} actualizada`);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <p className="text-sm font-semibold mb-3">Agregar usuario</p>
        <form onSubmit={crearUsuario} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-start">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Contraseña" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={rol} onChange={(e) => setRol(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {Object.entries(ETIQUETA_ROL).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>{etiqueta}</option>
            ))}
          </select>
          <button type="submit" className="text-white rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "var(--color-primario)" }}>
            Crear usuario
          </button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase opacity-60">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{u.nombre}</td>
                <td className="px-4 py-3 opacity-70">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.rol}
                    onChange={(e) => actualizarUsuario(u, { rol: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                  >
                    {Object.entries(ETIQUETA_ROL).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${u.activo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {cambiandoPasswordDe === u.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="password"
                        value={passwordNueva}
                        onChange={(e) => setPasswordNueva(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-32"
                      />
                      <button onClick={() => confirmarPassword(u)} className="text-xs font-semibold text-white rounded-lg px-2 py-1" style={{ background: "var(--color-primario)" }}>
                        Guardar
                      </button>
                      <button onClick={() => { setCambiandoPasswordDe(null); setPasswordNueva(""); }} className="text-xs px-2 py-1">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => actualizarUsuario(u, { activo: !u.activo })} className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button onClick={() => setCambiandoPasswordDe(u.id)} className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                        Contraseña
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
