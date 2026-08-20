import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("PENDIENTES");
  const [empleados, setEmpleados] = useState([]);
  
  const [modalConfirmacion, setModalConfirmacion] = useState({ 
    abierto: false, 
    solicitud: null, 
    accion: "", 
    rolSeleccionado: "SUPERVISOR",
    empleadoSeleccionado: "",
    titulo: "",
    descripcion: "",
    colorIcono: "",
    icono: "",
    colorBoton: "",
    textoBoton: ""
  });

  useEffect(() => { 
    cargarSolicitudes();
    cargarEmpleados();
  }, []);

  const cargarSolicitudes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("solicitudes_usuario")
        .select("*")
        .order("created_at", { ascending: false });
        
      if (error) {
        console.error("❌ Error cargando solicitudes:", error);
        alert("Error al cargar las solicitudes. Revisa tu conexión.");
      } else {
        setSolicitudes(data || []);
      }
    } catch (err) {
      console.error("Excepción en cargarSolicitudes:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 CONSULTA AUTÓNOMA Y ROBUSTA: Sin joins complejos que puedan fallar
  const cargarEmpleados = async () => {
    try {
      console.log("🔄 Cargando lista de empleados para vinculación...");
      
      // Obtenemos solo los campos planos que sabemos que existen en la tabla empleados
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre_completo, numero_empleado, puesto, departamento, activo")
        .eq("activo", true)
        .order("nombre_completo");
      
      if (error) {
        console.error("⚠️ Error con filtro 'activo', intentando sin filtro:", error);
        
        // Fallback: intentar traer todos los empleados sin filtrar por si la columna 'activo' no existe o falla
        const { data: dataFallback, error: errorFallback } = await supabase
          .from("empleados")
          .select("id, nombre_completo, numero_empleado, puesto")
          .order("nombre_completo");
        
        if (!errorFallback && dataFallback) {
          console.warn("⚠️ Usando lista de empleados sin filtro de 'activo'");
          setEmpleados(dataFallback);
        } else {
          console.error("❌ Error crítico al cargar empleados:", errorFallback);
        }
      } else {
        console.log(`✅ Se cargaron ${data?.length || 0} empleados para vincular.`);
        setEmpleados(data || []);
      }
    } catch (err) {
      console.error("Excepción en cargarEmpleados:", err);
    }
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

  // 🔥 APROBAR SOLICITUD
  const ejecutarAprobacion = async (solicitud, rol, empleadoId) => {
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

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: correoLimpio,
        password: passwordLimpio,
        options: { data: { nombre: solicitud.nombre, rol: rol } },
      });

      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already in use")) {
          alert("⚠️ El correo \"" + correoLimpio + "\" ya tiene una cuenta.\n\nVe al módulo de Usuarios y asegúrate de que su Rol sea " + rol + ".\n\nLuego elimina esta solicitud con 🗑️.");
          setLoading(false);
          setModalConfirmacion(prev => ({ ...prev, abierto: false }));
          return;
        }
        throw new Error("Error de autenticación: " + authError.message);
      }

      const nuevoUserId = authData.user?.id;
      if (nuevoUserId) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          { id: nuevoUserId, nombre: solicitud.nombre, rol: rol, activo: true }, 
          { onConflict: "id" }
        );
        if (profileError) throw profileError;

        if (empleadoId) {
          console.log("🔗 Vinculando usuario con empleado:", empleadoId);
          
          // Actualizamos el campo id_usuario (o el campo que uses para vincular) en lugar de sobreescribir el id primario
          const { error: updateEmpleadoError } = await supabase
            .from("empleados")
            .update({ id_usuario: nuevoUserId }) // Asumiendo que tienes un campo id_usuario. Si no, ajusta al nombre correcto de tu columna de vinculación.
            .eq("id", empleadoId);

          if (updateEmpleadoError) {
            console.warn("⚠️ No se pudo actualizar la vinculación del empleado:", updateEmpleadoError.message);
          } else {
            console.log("✅ Empleado vinculado correctamente");

            const { error: updateSupervisorError } = await supabase
              .from("empleados")
              .update({ supervisor_id: nuevoUserId })
              .eq("supervisor_id", empleadoId); // Ojo: verifica si esta lógica de reasignar supervisor es la deseada

            if (updateSupervisorError) {
              console.warn("⚠️ No se pudieron actualizar las referencias de supervisor:", updateSupervisorError.message);
            }
          }
        }

        setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "APROBADA" } : s));
        await supabase.from("solicitudes_usuario").update({ estatus: "APROBADA" }).eq("id", solicitud.id);

        const empleadoInfo = empleados.find(e => e.id === empleadoId);
        const mensajeEmpleado = empleadoInfo 
          ? "\n\n🔗 Vinculado a: " + empleadoInfo.nombre_completo + " (#" + empleadoInfo.numero_empleado + ")"
          : "\n\n⚠️ No se vinculó a ningún empleado existente.";

        alert("✅ Usuario creado exitosamente con rol: " + rol + ".\n\nCorreo: " + correoLimpio + "\nContraseña: " + passwordLimpio + mensajeEmpleado + "\n\n💡 Para probar, abre una ventana de incógnito e inicia sesión.");
        await cargarSolicitudes();
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la solicitud: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "" }));
    }
  };

  // 🔥 RECHAZAR SOLICITUD
  const ejecutarRechazo = async (solicitud) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);
        
      if (error) throw new Error("Error de base de datos: " + error.message);
      
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "" }));
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
    }
  };

  // 🔥 DAR DE BAJA (DESHABILITAR TEMPORALMENTE)
  const darDeBajaUsuario = async (solicitud) => {
    try {
      setLoading(true);
      
      const { data: perfiles, error: errorBusqueda } = await supabase
        .from("profiles")
        .select("id, nombre, rol")
        .eq("nombre", solicitud.nombre);
        
      if (errorBusqueda) throw errorBusqueda;

      if (perfiles && perfiles.length > 0) {
        const idsPerfiles = perfiles.map(p => p.id);
        
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ 
            activo: false,
            fecha_baja: new Date().toISOString()
          })
          .in("id", idsPerfiles);

        if (updateError) throw updateError;
        console.log("✅ Usuario(s) dado(s) de baja correctamente:", idsPerfiles);
      }

      const { error } = await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);

      if (error) throw error;
      
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      
      alert(
        "✅ Usuario dado de baja correctamente.\n\n" +
        "🔒 No podrá iniciar sesión hasta ser reactivado.\n" +
        "🔄 Para reactivarlo, ve al módulo de Usuarios y cambia su estado a 'Activo'.\n" +
        "📋 La solicitud quedará registrada en 'Rechazadas' para historial."
      );
    } catch (error) {
      console.error("Error al dar de baja:", error);
      alert("Error al dar de baja: " + error.message);
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "" }));
    }
  };

  // 🔥 ELIMINACIÓN PERMANENTE
  const eliminarDefinitivamente = async (solicitud) => {
    try {
      setLoading(true);
      
      const { data: perfiles, error: errorBusqueda } = await supabase
        .from("profiles")
        .select("id, nombre")
        .eq("nombre", solicitud.nombre);
        
      if (!errorBusqueda && perfiles && perfiles.length > 0) {
        const idsPerfiles = perfiles.map(p => p.id);
        const { error: deleteProfileError } = await supabase
          .from("profiles")
          .delete()
          .in("id", idsPerfiles);

        if (deleteProfileError) {
          console.warn("⚠️ No se pudo eliminar el perfil:", deleteProfileError.message);
        } else {
          console.log("✅ Perfil eliminado:", idsPerfiles);
        }
      }

      const { error: deleteSolicitudError } = await supabase
        .from("solicitudes_usuario")
        .delete()
        .eq("id", solicitud.id);

      if (deleteSolicitudError) throw deleteSolicitudError;
      
      setSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
      
      alert(
        "✅ Usuario y solicitud eliminados permanentemente.\n\n" +
        "⚠️ Nota: El correo puede seguir registrado en Supabase Authentication.\n" +
        "Si necesitas eliminarlo completamente, ve a Supabase > Authentication > Users."
      );
    } catch (error) {
      console.error("Error al eliminar:", error);
      alert("Error al eliminar: " + error.message);
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "" }));
    }
  };

  // 🔥 MODAL DE CONFIRMACIÓN DINÁMICO
  const confirmarAccion = (solicitud, accion) => {
    let titulo = "";
    let descripcion = "";
    let colorIcono = "";
    let icono = "";
    let colorBoton = "";
    let textoBoton = "";

    switch (accion) {
      case "aprobar":
        titulo = "Aprobar Solicitud";
        descripcion = "Se creará una cuenta con el rol y vinculación seleccionados.";
        colorIcono = "bg-emerald-100";
        icono = "✅";
        colorBoton = "bg-emerald-600 hover:bg-emerald-700";
        textoBoton = "✅ Confirmar Aprobación";
        break;
      case "rechazar":
        titulo = "Rechazar Solicitud";
        descripcion = "La solicitud se marcará como rechazada. El usuario NO tendrá acceso.";
        colorIcono = "bg-red-100";
        icono = "❌";
        colorBoton = "bg-red-600 hover:bg-red-700";
        textoBoton = "❌ Confirmar Rechazo";
        break;
      case "baja":
        titulo = "Dar de Baja al Usuario";
        descripcion = "El usuario NO podrá iniciar sesión hasta ser reactivado. Sus datos se conservarán.";
        colorIcono = "bg-orange-100";
        icono = "🚫";
        colorBoton = "bg-orange-600 hover:bg-orange-700";
        textoBoton = "🚫 Confirmar Baja";
        break;
      case "eliminar":
        titulo = "⚠️ ELIMINACIÓN PERMANENTE";
        descripcion = "Esta acción NO se puede deshacer. Se eliminará el perfil y la solicitud.";
        colorIcono = "bg-red-100";
        icono = "🗑️";
        colorBoton = "bg-red-700 hover:bg-red-800";
        textoBoton = "🗑️ Sí, Eliminar Permanentemente";
        break;
      default:
        return;
    }

    setModalConfirmacion({
      abierto: true,
      solicitud,
      accion,
      rolSeleccionado: "SUPERVISOR",
      empleadoSeleccionado: "",
      titulo,
      descripcion,
      colorIcono,
      icono,
      colorBoton,
      textoBoton
    });
  };

  const ejecutarAccion = () => {
    const { accion, solicitud, rolSeleccionado, empleadoSeleccionado } = modalConfirmacion;
    
    switch (accion) {
      case "aprobar":
        ejecutarAprobacion(solicitud, rolSeleccionado, empleadoSeleccionado);
        break;
      case "rechazar":
        ejecutarRechazo(solicitud);
        break;
      case "baja":
        darDeBajaUsuario(solicitud);
        break;
      case "eliminar":
        eliminarDefinitivamente(solicitud);
        break;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📨 Solicitudes de Usuario</h1>
          <p className="text-slate-500 mt-1">Aprueba solicitudes, asigna roles y gestiona usuarios</p>
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
                        <div className="flex gap-2 justify-center flex-wrap">
                          <button onClick={() => confirmarAccion(solicitud, "aprobar")} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm">✅ Aprobar</button>
                          <button onClick={() => confirmarAccion(solicitud, "rechazar")} disabled={loading} className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm">❌ Rechazar</button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center flex-wrap">
                          {solicitud.estatus === "APROBADA" && (
                            <button 
                              onClick={() => confirmarAccion(solicitud, "baja")} 
                              disabled={loading}
                              className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1"
                            >
                              🚫 Dar de Baja
                            </button>
                          )}
                          <button 
                            onClick={() => confirmarAccion(solicitud, "eliminar")} 
                            disabled={loading}
                            className="bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1"
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🔥 MODAL DE CONFIRMACIÓN DINÁMICO */}
      {modalConfirmacion.abierto && modalConfirmacion.solicitud && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className={"w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 " + (modalConfirmacion.colorIcono || "bg-slate-100")}>
                {modalConfirmacion.icono || "❓"}
              </div>
              <h3 className="text-xl font-bold text-slate-800">{modalConfirmacion.titulo}</h3>
              <p className="text-sm text-slate-600 mt-2">{modalConfirmacion.descripcion}</p>
              
              {/* 🔥 SELECTORES SOLO PARA APROBACIÓN */}
              {modalConfirmacion.accion === "aprobar" && (
                <div className="mt-4 text-left space-y-3">
                  <div>
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

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      🔗 Vincular a Empleado Existente:
                    </label>
                    <select 
                      value={modalConfirmacion.empleadoSeleccionado}
                      onChange={(e) => setModalConfirmacion(prev => ({ ...prev, empleadoSeleccionado: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
                    >
                      <option value="">-- Sin vincular (crear solo usuario) --</option>
                      
                      {empleados.length === 0 && (
                        <option disabled>⏳ Cargando lista de empleados...</option>
                      )}
                      
                      {empleados.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          #{emp.numero_empleado || "S/N"} - {emp.nombre_completo || "Sin nombre"} 
                          {emp.puesto ? ` (${emp.puesto})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      💡 Selecciona el empleado al que pertenece este usuario. Total disponibles: {empleados.length}
                    </p>
                  </div>
                </div>
              )}

              {/* 🔥 ALERTA ESPECIAL PARA ELIMINACIÓN */}
              {modalConfirmacion.accion === "eliminar" && (
                <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-lg p-3 text-left">
                  <p className="text-sm text-red-800 font-semibold">⚠️ ADVERTENCIA</p>
                  <p className="text-xs text-red-700 mt-1">
                    Esta acción es <strong>IRREVERSIBLE</strong>. Se eliminarán:
                  </p>
                  <ul className="text-xs text-red-700 mt-2 list-disc list-inside space-y-1">
                    <li>El perfil del usuario en la base de datos</li>
                    <li>La solicitud de esta lista</li>
                    <li>Todos los datos asociados</li>
                  </ul>
                  <p className="text-xs text-red-700 mt-2">
                    💡 Si solo quieres bloquear el acceso temporalmente, usa "Dar de Baja" en su lugar.
                  </p>
                </div>
              )}

              {/* 🔥 ALERTA ESPECIAL PARA BAJA */}
              {modalConfirmacion.accion === "baja" && (
                <div className="mt-4 bg-orange-50 border-2 border-orange-300 rounded-lg p-3 text-left">
                  <p className="text-sm text-orange-800 font-semibold">ℹ️ ¿Qué sucede al dar de baja?</p>
                  <ul className="text-xs text-orange-700 mt-2 list-disc list-inside space-y-1">
                    <li>El usuario NO podrá iniciar sesión</li>
                    <li>Sus datos se CONSERVAN en el sistema</li>
                    <li>Puede ser reactivado desde el módulo de Usuarios</li>
                    <li>Se registra la fecha de baja</li>
                  </ul>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 mt-3 text-left">
                <div className="font-bold text-slate-800">{modalConfirmacion.solicitud.nombre}</div>
                <div className="text-xs text-slate-600 font-mono">{modalConfirmacion.solicitud.correo || modalConfirmacion.solicitud.email}</div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "" }))} 
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold transition"
              >
                Cancelar
              </button>
              <button 
                onClick={ejecutarAccion}
                disabled={loading}
                className={"flex-1 text-white py-2.5 rounded-lg font-semibold transition disabled:opacity-50 " + (modalConfirmacion.colorBoton || "bg-blue-600")}
              >
                {loading ? "Procesando..." : modalConfirmacion.textoBoton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}