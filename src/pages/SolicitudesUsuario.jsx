import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  const cargarSolicitudes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("solicitudes_usuario")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando solicitudes:", error);
    } else {
      setSolicitudes(data || []);
    }
    setLoading(false);
  };

  const aprobarSolicitud = async (solicitud) => {
    if (!window.confirm(`¿Aprobar y crear cuenta de Supervisor para ${solicitud.nombre}?`)) return;

    try {
      setLoading(true);

      // 1. Crear el usuario en Supabase Authentication
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: solicitud.correo,
        password: solicitud.password,
        options: {
          data: {
            nombre: solicitud.nombre,
            rol: "SUPERVISOR", // 🔥 Asignamos el rol para que el Login lo detecte
          },
        },
      });

      if (authError) throw authError;

      const nuevoUserId = authData.user?.id;

      if (nuevoUserId) {
        // 2. Crear o actualizar el perfil con el nuevo ID de Auth
        // ⚠️ IMPORTANTE: Si tu tabla principal es "empleados" en lugar de "profiles", 
        // cambia "profiles" por "empleados" en la siguiente línea.
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: nuevoUserId,
            nombre: solicitud.nombre,
            correo: solicitud.correo,
            telefono: solicitud.telefono,
            rol: "supervisor",
            activo: true,
          },
          { onConflict: "id" }
        );

        if (profileError) throw profileError;

        // 3. Actualizar el estatus de la solicitud
        const { error: updateError } = await supabase
          .from("solicitudes_usuario")
          .update({ estatus: "APROBADA" })
          .eq("id", solicitud.id);

        if (updateError) throw updateError;

        alert("✅ Usuario creado y aprobado exitosamente como Supervisor.");

        // 4. Cerrar sesión del usuario recién creado y redirigir al admin al login
        // Esto es necesario porque signUp cambia la sesión activa al nuevo usuario.
        await supabase.auth.signOut();
        alert("⚠️ Por seguridad, la sesión se ha cerrado. Por favor, inicia sesión nuevamente con tu cuenta de administrador.");
        navigate("/login");
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la solicitud: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const rechazarSolicitud = async (solicitud) => {
    if (!window.confirm(`¿Rechazar la solicitud de ${solicitud.nombre}?`)) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);

      if (error) throw error;

      alert("Solicitud rechazada.");
      cargarSolicitudes();
    } catch (error) {
      alert("Error al rechazar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📨 Solicitudes de Usuario</h1>
          <p className="text-slate-500 mt-1">Aprueba solicitudes para crear cuentas de Supervisores</p>
        </div>
        <Link
          to="/dashboard"
          className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
        >
          ← Volver al Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-4xl mb-2">⏳</div>
            Cargando solicitudes...
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-6xl mb-3">📭</div>
            <p className="font-semibold">No hay solicitudes pendientes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 font-bold text-slate-700">Nombre</th>
                  <th className="p-4 font-bold text-slate-700">Correo</th>
                  <th className="p-4 font-bold text-slate-700">Teléfono</th>
                  <th className="p-4 font-bold text-slate-700 text-center">Estatus</th>
                  <th className="p-4 font-bold text-slate-700 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {solicitudes.map((solicitud) => (
                  <tr key={solicitud.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-semibold text-slate-800">{solicitud.nombre}</td>
                    <td className="p-4 text-slate-600">{solicitud.correo}</td>
                    <td className="p-4 text-slate-600">{solicitud.telefono || "-"}</td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" && (
                        <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold">🟡 Pendiente</span>
                      )}
                      {solicitud.estatus === "APROBADA" && (
                        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">✅ Aprobada</span>
                      )}
                      {solicitud.estatus === "RECHAZADA" && (
                        <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">❌ Rechazada</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" && (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => aprobarSolicitud(solicitud)}
                            disabled={loading}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => rechazarSolicitud(solicitud)}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                      {solicitud.estatus !== "PENDIENTE" && (
                        <span className="text-slate-400 text-xs">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}