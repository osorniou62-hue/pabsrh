import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { cargarUsuarios(); }, []);

  const cargarUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("nombre");
    if (error) console.error(error);
    else setUsuarios(data || []);
    setLoading(false);
  };

  const cambiarRol = async (id, rol) => {
    const { error } = await supabase.from("profiles").update({ rol }).eq("id", id);
    if (error) alert(error.message);
    else cargarUsuarios();
  };

  const cambiarEstatus = async (usuario) => {
    const { error } = await supabase
      .from("profiles")
      .update({ activo: !usuario.activo })
      .eq("id", usuario.id);
    if (error) alert(error.message);
    else cargarUsuarios();
  };

  const activos = usuarios.filter(u => u.activo).length;
  const inactivos = usuarios.filter(u => !u.activo).length;
  const admins = usuarios.filter(u => u.rol === "ADMIN").length;
  const supervisores = usuarios.filter(u => u.rol === "SUPERVISOR").length;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-800">👥 Usuarios</h1>
          <p className="text-gray-500 mt-2">Administración de accesos y roles del sistema</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Inactivos" valor={inactivos} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Administradores" valor={admins} icono="👑" color="text-purple-600" />
          <KpiCard titulo="Supervisores" valor={supervisores} icono="👷" color="text-blue-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="animate-spin text-4xl mb-2">⏳</div>
              Cargando usuarios...
            </div>
          ) : usuarios.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <div className="text-6xl mb-3">📭</div>
              <p className="font-semibold">No hay usuarios registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-bold text-slate-700">Nombre</th>
                    <th className="p-4 font-bold text-slate-700">Correo</th>
                    <th className="p-4 font-bold text-slate-700 text-center">Rol</th>
                    <th className="p-4 font-bold text-slate-700 text-center">Estado</th>
                    <th className="p-4 font-bold text-slate-700 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-semibold text-slate-800">{usuario.nombre}</td>
                      <td className="p-4 text-slate-600">{usuario.correo || "-"}</td>
                      <td className="p-4 text-center">
                        <select
                          value={usuario.rol}
                          onChange={(e) => cambiarRol(usuario.id, e.target.value)}
                          className={`border-2 rounded-lg px-3 py-1.5 font-semibold text-xs ${
                            usuario.rol === "ADMIN" ? "border-purple-300 bg-purple-50 text-purple-700" :
                            usuario.rol === "RH" ? "border-blue-300 bg-blue-50 text-blue-700" :
                            usuario.rol === "SUPERVISOR" ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                            "border-slate-300 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <option value="ADMIN">👑 ADMIN</option>
                          <option value="RH">💼 RH</option>
                          <option value="SUPERVISOR">👷 SUPERVISOR</option>
                          <option value="CONSULTA">👁️ CONSULTA</option>
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        {usuario.activo ? (
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">✅ Activo</span>
                        ) : (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">🚫 Inactivo</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => cambiarEstatus(usuario)}
                          className={`px-4 py-2 rounded-lg text-white text-xs font-semibold transition shadow-sm ${
                            usuario.activo ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                          }`}
                        >
                          {usuario.activo ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}