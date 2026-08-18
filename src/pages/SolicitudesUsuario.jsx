import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("PENDIENTES");
  const [modalConfirmacion, setModalConfirmacion] = useState({ abierto: false, solicitud: null, accion: "" });
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

  // Filtrar solicitudes según el estado seleccionado
  const solicitudesFiltradas = solicitudes.filter(s => {
    if (filtro === "PENDIENTES") return s.estatus === "PENDIENTE";
    if (filtro === "APROBADAS") return s.estatus === "APROBADA";
    if (filtro === "RECHAZADAS") return s.estatus === "RECHAZADA";
    return true;
  });

  const pendientes = solicitudes.filter(s => s.estatus === "PENDIENTE").length;
  const aprobadas = solicitudes.filter(s => s.estatus === "APROBADA").length;
  const rechazadas = solicitudes.filter(s => s.estatus === "RECHAZADA").length;

  const ejecutarAprobacion = async (solicitud) => {
    try {
      setLoading(true);

      // 🔥 1. Búsqueda robusta del correo (por si la columna se llama 'email' o 'correo')
      const correoRaw = solicitud.correo || solicitud.email || "";
      const passwordRaw = solicitud.password || "";

      // Depuración: muestra en consola qué está llegando realmente
      console.log("🔍 Datos de la solicitud a aprobar:", solicitud);

      const correoLimpio = String(correoRaw).trim().toLowerCase();
      const passwordLimpio = String(passwordRaw).trim();

      // 2. Validación básica con mensaje de error detallado
      if (!correoLimpio || !correoLimpio.includes('@')) {
        alert(`⚠️ El correo electrónico es inválido o está vacío.\n\nValor recibido en el sistema: "${correoRaw}"\n\nPor favor, rechaza esta solicitud y pide al usuario que se registre con un correo válido.`);
        setLoading(false);
        return;
      }

      if (passwordLimpio.length < 6) {
        alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
        setLoading(false);
        return;
      }

      // 3. Crear el usuario en Supabase Authentication
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: correoLimpio,
        password: passwordLimpio,
        options: {
          data: { nombre: solicitud.nombre, rol: "SUPERVISOR" },
        },
      });

      if (authError) throw new Error(`Supabase rechazó el correo: ${authError.message}`);

      const nuevoUserId = authData.user?.id;

      if (nuevoUserId) {
        // 4. Crear o actualizar el perfil
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: nuevoUserId,
            nombre: solicitud.nombre,
            correo: correoLimpio,
            telefono: solicitud.telefono,
            rol: "SUPERVISOR",
            activo: true,
          },
          { onConflict: "id" }
        );

        if (profileError) throw profileError;

        // 5. ACTUALIZACIÓN OPTIMISTA: Cambiar estado localmente al instante
        setSolicitudes(prev => prev.map(s => 
          s.id === solicitud.id ? { ...s, estatus: "APROBADA" } : s
        ));

        // Refetch de respaldo en la BD
        const { error: updateError } = await supabase
          .from("solicitudes_usuario")
          .update({ estatus: "APROBADA" })
          .eq("id", solicitud.id);

        if (updateError) throw updateError;

        await supabase.auth.signOut();
        alert("✅ Usuario creado exitosamente. Por seguridad, inicia sesión nuevamente.");
        navigate("/login");
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la solicitud: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
      setModalConfirmacion({ abierto: false, solicitud: null, accion: "" });
    }
  };

  const ejecutarRechazo = async (solicitud) => {
    try {
      setLoading(true);

      // ACTUALIZACIÓN OPTIMISTA
      setSolicitudes(prev => prev.map(s => 
        s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s
      ));

      setModalConfirmacion({ abierto: false, solicitud: null, accion: "" });

      const { error } = await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);

      if (error) throw error;

      await cargarSolicitudes();
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
    }
  };

  // 🔥 NUEVO: Eliminar definitivamente de la base de datos
  const eliminarDefinitivamente = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar esta solicitud permanentemente?")) return;
    try {
      const { error } = await supabase.from("solicitudes_usuario").delete().eq("id", id);
      if (error) throw error;
      
      // Actualizar estado local
      setSolicitudes(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* HEADER */}
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

      {/* KPIs + FILTROS */}
      <div className="grid md:grid-cols-4 gap-3">
        <button onClick={() => setFiltro("PENDIENTES")} className={`rounded-xl p-4 border-2 text-left transition ${filtro === "PENDIENTES" ? "bg-amber-50 border-amber-400 shadow-md" : "bg-white border-slate-200 hover:border-amber-200"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Pendientes</div>
          <div className="text-3xl font-black text-amber-600">{pendientes}</div>
        </button>
        <button onClick={() => setFiltro("APROBADAS")} className={`rounded-xl p-4 border-2 text-left transition ${filtro === "APROBADAS" ? "bg-emerald-50 border-emerald-400 shadow-md" : "bg-white border-slate-200 hover:border-emerald-200"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Aprobadas</div>
          <div className="text-3xl font-black text-emerald-600">{aprobadas}</div>
        </button>
        <button onClick={() => setFiltro("RECHAZADAS")} className={`rounded-xl p-4 border-2 text-left transition ${filtro === "RECHAZADAS" ? "bg-red-50 border-red-400 shadow-md" : "bg-white border-slate-200 hover:border-red-200"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Rechazadas</div>
          <div className="text-3xl font-black text-red-600">{rechazadas}</div>
        </button>
        <button onClick={() => setFiltro("TODAS")} className={`rounded-xl p-4 border-2 text-left transition ${filtro === "TODAS" ? "bg-blue-50 border-blue-400 shadow-md" : "bg-white border-slate-200 hover:border-blue-200"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Todas</div>
          <div className="text-3xl font-black text-blue-600">{solicitudes.length}</div>
        </button>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && solicitudes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-4xl mb-2">⏳</div>
            Cargando solicitudes...
          </div>
        ) : solicitudesFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-6xl mb-3">📭</div>
            <p className="font-semibold">
              {filtro === "PENDIENTES" && "No hay solicitudes pendientes"}
              {filtro === "APROBADAS" && "No hay solicitudes aprobadas"}
              {filtro === "RECHAZADAS" && "No hay solicitudes rechazadas"}
              {filtro === "TODAS" && "No hay solicitudes registradas"}
            </p>
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
                {solicitudesFiltradas.map((solicitud) => (
                  <tr key={solicitud.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-semibold text-slate-800">{solicitud.nombre}</td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{solicitud.correo || solicitud.email || "No disponible"}</td>
                    <td className="p-4 text-slate-600">{solicitud.telefono || "-"}</td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" && <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold">🟡 Pendiente</span>}
                      {solicitud.estatus === "APROBADA" && <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">✅ Aprobada</span>}
                      {solicitud.estatus === "RECHAZADA" && <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">❌ Rechazada</span>}
                    </td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" ? (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setModalConfirmacion({ abierto: true, solicitud, accion: "aprobar" })} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm">✅ Aprobar</button>
                          <button onClick={() => setModalConfirmacion({ abierto: true, solicitud, accion: "rechazar" })} disabled={loading} className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm">❌ Rechazar</button>
                        </div>
                      ) : (
                        // 🔥 Botón de eliminar para solicitudes ya procesadas
                        <button 
                          onClick={() => eliminarDefinitivamente(solicitud.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 mx-auto"
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN */}
      {modalConfirmacion.abierto && modalConfirmacion.solicitud && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 ${modalConfirmacion.accion === "aprobar" ? "bg-emerald-100" : "bg-red-100"}`}>
                {modalConfirmacion.accion === "aprobar" ? "✅" : "❌"}
              </div>
              <h3 className="text-xl font-bold text-slate-800">{modalConfirmacion.accion === "aprobar" ? "Aprobar Solicitud" : "Rechazar Solicitud"}</h3>
              <div className="bg-slate-50 rounded-lg p-3 mt-3 text-left">
                <div className="font-bold text-slate-800">{modalConfirmacion.solicitud.nombre}</div>
                <div className="text-xs text-slate-600 font-mono">{modalConfirmacion.solicitud.correo || modalConfirmacion.solicitud.email}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirmacion({ abierto: false, solicitud: null, accion: "" })} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold transition">Cancelar</button>
              <button
                onClick={() => modalConfirmacion.accion === "aprobar" ? ejecutarAprobacion(modalConfirmacion.solicitud) : ejecutarRechazo(modalConfirmacion.solicitud)}
                disabled={loading}
                className={`flex-1 text-white py-2.5 rounded-lg font-semibold transition disabled:opacity-50 ${modalConfirmacion.accion === "aprobar" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {loading ? "Procesando..." : modalConfirmacion.accion === "aprobar" ? "✅ Confirmar" : "❌ Rechazar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}