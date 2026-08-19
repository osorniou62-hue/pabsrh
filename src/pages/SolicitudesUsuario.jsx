import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("PENDIENTES");
  const [modalConfirmacion, setModalConfirmacion] = useState({ 
    abierto: false, 
    solicitud: null, 
    accion: "", 
    rolSeleccionado: "SUPERVISOR" // 🔥 Nuevo estado para el rol
  });
  const navigate = useNavigate();

  useEffect(() => { cargarSolicitudes(); }, []);

  const cargarSolicitudes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("solicitudes_usuario").select("*").order("created_at", { ascending: false });
    if (error) console.error("Error cargando solicitudes:", error);
    else setSolicitudes(data || []);
    setLoading(false);
  };

  const solicitudesFiltradas = solicitudes.filter(s => {
    if (filtro === "PENDIENTES") return s.estatus === "PENDIENTE";
    if (filtro === "APROBADAS") return s.estatus === "APROBADA";
    if (filtro === "RECHAZADAS") return s.estatus === "RECHAZADA";
    return true;
  });

  const pendientes = solicitudes.filter(s => s.estatus === "PENDIENTE").length;
  const aprobadas = solicitudes.filter(s => s.estatus === "APROBADA").length;
  const rechazadas = solicitudes.filter(s => s.estatus === "RECHAZADA").length;

  // 🔥 Ahora recibe el 'rol' como parámetro
  const ejecutarAprobacion = async (solicitud, rol) => {
    try {
      setLoading(true);
      const correoRaw = solicitud.correo || solicitud.email || "";
      const passwordRaw = solicitud.password || "";
      const correoLimpio = String(correoRaw).trim().toLowerCase();
      const passwordLimpio = String(passwordRaw).trim();

      if (!correoLimpio || !correoLimpio.includes('@')) {
        alert("⚠️ El correo electrónico es inválido o está vacío.\nValor recibido: \"" + correoRaw + "\"");
        setLoading(false);
        return;
      }
      if (passwordLimpio.length < 6) {
        alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
        setLoading(false);
        return;
      }

      // 1. Crear el usuario en Supabase Authentication con el rol seleccionado
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: correoLimpio,
        password: passwordLimpio,
        options: { data: { nombre: solicitud.nombre, rol: rol } },
      });

      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already in use")) {
          alert("⚠️ El correo \"" + correoLimpio + "\" ya tiene una cuenta.\n\nVe al módulo de Usuarios y asegúrate de que su Rol sea " + rol + ".\n\nLuego elimina esta solicitud con 🗑️.");
          setLoading(false);
          setModalConfirmacion({ abierto: false, solicitud: null, accion: "", rolSeleccionado: "SUPERVISOR" });
          return;
        }
        throw new Error("Error de autenticación: " + authError.message);
      }

      const nuevoUserId = authData.user?.id;
      if (nuevoUserId) {
        // 2. Crear el perfil con el rol seleccionado dinámicamente
        const { error: profileError } = await supabase.from("profiles").upsert(
          { id: nuevoUserId, nombre: solicitud.nombre, rol: rol, activo: true }, 
          { onConflict: "id" }
        );
        if (profileError) throw profileError;

        const { data: verificacion } = await supabase.from("profiles").select("rol").eq("id", nuevoUserId).single();
        console.log("✅ Rol guardado:", verificacion?.rol);

        // 3. Actualizar estado de la solicitud
        setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "APROBADA" } : s));
        await supabase.from("solicitudes_usuario").update({ estatus: "APROBADA" }).eq("id", solicitud.id);

        alert(`✅ Usuario creado exitosamente con rol: ${rol}.\n\nCorreo: ${correoLimpio}\nContraseña: ${passwordLimpio}\n\n💡 Para probar, abre una ventana de incógnito e inicia sesión.`);
        await cargarSolicitudes();
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la solicitud: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
      setModalConfirmacion({ abierto: false, solicitud: null, accion: "", rolSeleccionado: "SUPERVISOR" });
    }
  };

  const ejecutarRechazo = async (solicitud) => {
    try {
      setLoading(true);
      const { error } = await supabase.from("solicitudes_usuario").update({ estatus: "RECHAZADA" }).eq("id", solicitud.id).select();
      if (error) throw new Error("Error de base de datos: " + error.message);
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      setModalConfirmacion({ abierto: false, solicitud: null, accion: "", rolSeleccionado: "SUPERVISOR" });
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
    }
  };

  // 🔥 ELIMINACIÓN EN CASCADA: Borra la solicitud y el perfil de usuario asociado
  const eliminarDefinitivamente = async (id) => {
    const confirmacion = window.confirm(
      "¿Eliminar esta solicitud permanentemente?\n\n" +
      "⚠️ Nota: Si la solicitud fue APROBADA, se eliminará el perfil de usuario asociado de la base de datos. " +
      "El correo quedará registrado en el sistema de autenticación de Supabase, pero el usuario no podrá iniciar sesión al no tener perfil."
    );
    
    if (!confirmacion) return;

    try {
      const solicitud = solicitudes.find(s => s.id === id);
      
      // Si fue aprobada, intentamos limpiar el perfil asociado
      if (solicitud && solicitud.estatus === "APROBADA") {
        // Buscamos perfiles que coincidan con el nombre de la solicitud
        const { data: perfiles, error: errorBusqueda } = await supabase
          .from("profiles")
          .select("id")
          .eq("nombre", solicitud.nombre);
          
        if (!errorBusqueda && perfiles && perfiles.length > 0) {
          const idsPerfiles = perfiles.map(p => p.id);
          await supabase.from("profiles").delete().in("id", idsPerfiles);
          console.log("✅ Perfiles de usuario asociados eliminados");
        }
      }

      // Eliminar la solicitud
      const { error } = await supabase.from("solicitudes_usuario").delete().eq("id", id);
      if (error) throw error;
      
      setSolicitudes(prev => prev.filter(s => s.id !== id));
      alert("✅ Solicitud y perfil de usuario eliminados correctamente.");
    } catch (error) {
      console.error("Error al eliminar:", error);
      alert("Error al eliminar: " + error.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📨 Solicitudes de Usuario</h1>
          <p className="text-slate-500 mt-1">Aprueba solicitudes y asigna roles de acceso</p>
        </div>
        <Link to="/dashboard" className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm">← Volver al Dashboard</Link>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <button onClick={() => setFiltro("PENDIENTES")} className={"rounded-xl p-4 border-2 text-left transition " + (filtro === "PENDIENTES" ? "bg-amber-50 border-amber-400 shadow-md" : "bg-white border-slate-200 hover:border-amber-200")}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Pendientes</div>
          <div className="text-3xl font-black text-amber-600">{pendientes}</div>
        </button>
        <button onClick={() => setFiltro("APROBADAS")} className={"rounded-xl p-4 border-2 text-left transition " + (filtro === "APROBADAS" ? "bg-emerald-50 border-emerald-400 shadow-md" : "bg-white border-slate-200 hover:border-emerald-200")}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Aprobadas</div>
          <div className="text-3xl font-black text-emerald-600">{aprobadas}</div>
        </button>
        <button onClick={() => setFiltro("RECHAZADAS")} className={"rounded-xl p-4 border-2 text-left transition " + (filtro === "RECHAZADAS" ? "bg-red-50 border-red-400 shadow-md" : "bg-white border-slate-200 hover:border-red-200")}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Rechazadas</div>
          <div className="text-3xl font-black text-red-600">{rechazadas}</div>
        </button>
        <button onClick={() => setFiltro("TODAS")} className={"rounded-xl p-4 border-2 text-left transition " + (filtro === "TODAS" ? "bg-blue-50 border-blue-400 shadow-md" : "bg-white border-slate-200 hover:border-blue-200")}>
          <div className="text-xs text-slate-500 font-semibold uppercase">Todas</div>
          <div className="text-3xl font-black text-blue-600">{solicitudes.length}</div>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && solicitudes.length === 0 ? (
          <div className="p-12 text-center text-slate-500"><div className="animate-spin text-4xl mb-2">⏳</div>Cargando...</div>
        ) : solicitudesFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-6xl mb-3">📭</div>
            <p className="font-semibold">No hay solicitudes en esta categoría</p>
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
                    <td className="p-4 text-slate-600 font-mono text-xs">{solicitud.correo || solicitud.email || "N/A"}</td>
                    <td className="p-4 text-slate-600">{solicitud.telefono || "-"}</td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" && <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold">🟡 Pendiente</span>}
                      {solicitud.estatus === "APROBADA" && <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">✅ Aprobada</span>}
                      {solicitud.estatus === "RECHAZADA" && <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">❌ Rechazada</span>}
                    </td>
                    <td className="p-4 text-center">
                      {solicitud.estatus === "PENDIENTE" ? (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setModalConfirmacion({ abierto: true, solicitud, accion: "aprobar", rolSeleccionado: "SUPERVISOR" })} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm">✅ Aprobar</button>
                          <button onClick={() => setModalConfirmacion({ abierto: true, solicitud, accion: "rechazar", rolSeleccionado: "SUPERVISOR" })} disabled={loading} className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-sm">❌ Rechazar</button>
                        </div>
                      ) : (
                        <button onClick={() => eliminarDefinitivamente(solicitud.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 mx-auto">🗑️ Eliminar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalConfirmacion.abierto && modalConfirmacion.solicitud && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className={"w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 " + (modalConfirmacion.accion === "aprobar" ? "bg-emerald-100" : "bg-red-100")}>
                {modalConfirmacion.accion === "aprobar" ? "✅" : "❌"}
              </div>
              <h3 className="text-xl font-bold text-slate-800">{modalConfirmacion.accion === "aprobar" ? "Aprobar Solicitud" : "Rechazar Solicitud"}</h3>
              
              {/* 🔥 Selector de Rol (Solo visible al aprobar) */}
              {modalConfirmacion.accion === "aprobar" && (
                <div className="mt-4 text-left">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Asignar Rol de Acceso:</label>
                  <select 
                    value={modalConfirmacion.rolSeleccionado}
                    onChange={(e) => setModalConfirmacion(prev => ({ ...prev, rolSeleccionado: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
                  >
                    <option value="SUPERVISOR">👷 Supervisor</option>
                    <option value="ADMINISTRATIVO">💼 Administrativo</option>
                    <option value="VISOR">👁️ Visor (Solo lectura)</option>
                  </select>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 mt-3 text-left">
                <div className="font-bold text-slate-800">{modalConfirmacion.solicitud.nombre}</div>
                <div className="text-xs text-slate-600 font-mono">{modalConfirmacion.solicitud.correo || modalConfirmacion.solicitud.email}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirmacion({ abierto: false, solicitud: null, accion: "", rolSeleccionado: "SUPERVISOR" })} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold transition">Cancelar</button>
              <button 
                onClick={() => {
                  if (modalConfirmacion.accion === "aprobar") {
                    ejecutarAprobacion(modalConfirmacion.solicitud, modalConfirmacion.rolSeleccionado);
                  } else {
                    ejecutarRechazo(modalConfirmacion.solicitud);
                  }
                }} 
                disabled={loading} 
                className={"flex-1 text-white py-2.5 rounded-lg font-semibold transition disabled:opacity-50 " + (modalConfirmacion.accion === "aprobar" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}
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