import { useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("PENDIENTES");
  const [empleados, setEmpleados] = useState([]);
  const [campoVinculacion, setCampoVinculacion] = useState(null);
  
  const [modalConfirmacion, setModalConfirmacion] = useState({ 
    abierto: false, 
    solicitud: null, 
    accion: "", 
    rolSeleccionado: "SUPERVISOR",
    empleadoSeleccionado: "",
    busquedaEmpleado: "",
    titulo: "",
    descripcion: "",
    colorIcono: "",
    icono: "",
    colorBoton: "",
    textoBoton: ""
  });

  const [modalPasswordAdmin, setModalPasswordAdmin] = useState({
    abierto: false,
    password: "",
    solicitud: null,
    rolSeleccionado: "",
    empleadoSeleccionado: ""
  });

  useEffect(() => { 
    cargarSolicitudes();
    cargarEmpleados();
    detectarCampoVinculacion();
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
        alert("Error al cargar las solicitudes.");
      } else {
        setSolicitudes(data || []);
      }
    } catch (err) {
      console.error("Excepción en cargarSolicitudes:", err);
    } finally {
      setLoading(false);
    }
  };

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre_completo, numero_empleado, puesto, departamento, activo")
        .eq("activo", true)
        .order("nombre_completo");
      
      if (error) {
        const { data: dataFallback } = await supabase
          .from("empleados")
          .select("id, nombre_completo, numero_empleado, puesto")
          .order("nombre_completo");
        if (dataFallback) setEmpleados(dataFallback);
      } else {
        setEmpleados(data || []);
      }
    } catch (err) {
      console.error("Excepción en cargarEmpleados:", err);
    }
  };

  const detectarCampoVinculacion = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .limit(1);
      
      if (error || !data || data.length === 0) return;
      
      const columnasExistentes = Object.keys(data[0]);
      const camposPosibles = ["id_usuario", "user_id", "auth_id"];
      let campoEncontrado = null;
      
      for (const campo of camposPosibles) {
        if (columnasExistentes.includes(campo)) {
          campoEncontrado = campo;
          break;
        }
      }
      
      if (!campoEncontrado) {
        const { error: createError } = await supabase.rpc("agregar_columna_dinamica", {
          p_tabla: "empleados",
          p_columna: "id_usuario",
          p_tipo: "UUID"
        });
        
        if (!createError) {
          campoEncontrado = "id_usuario";
        }
      }
      
      setCampoVinculacion(campoEncontrado);
    } catch (err) {
      console.error("Error detectando campo:", err);
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

  const solicitarAprobacion = (solicitud) => {
    setModalConfirmacion({
      abierto: true,
      solicitud,
      accion: "aprobar",
      rolSeleccionado: "SUPERVISOR",
      empleadoSeleccionado: "",
      busquedaEmpleado: "",
      titulo: "Aprobar Solicitud",
      descripcion: "Se creará una cuenta con el rol y vinculación seleccionados.",
      colorIcono: "bg-emerald-100",
      icono: "✅",
      colorBoton: "bg-emerald-600 hover:bg-emerald-700",
      textoBoton: "✅ Continuar"
    });
  };

  const confirmarAprobacionInicial = () => {
    const { solicitud, rolSeleccionado, empleadoSeleccionado } = modalConfirmacion;
    setModalPasswordAdmin({
      abierto: true,
      password: "",
      solicitud,
      rolSeleccionado,
      empleadoSeleccionado
    });
    setModalConfirmacion(prev => ({ ...prev, abierto: false }));
  };

  const ejecutarAprobacion = async (solicitud, rol, empleadoId, passwordAdmin) => {
    try {
      setLoading(true);
      
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      const emailAdmin = adminUser?.email;
      
      if (!emailAdmin || !passwordAdmin) {
        throw new Error("No se pudo obtener las credenciales del administrador");
      }

      const correoRaw = solicitud.correo || solicitud.email || "";
      const passwordRaw = solicitud.password || "";
      const correoLimpio = String(correoRaw).trim().toLowerCase();
      const passwordLimpio = String(passwordRaw).trim();

      if (!correoLimpio || !correoLimpio.includes('@')) {
        alert("⚠️ El correo electrónico es inválido.");
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
          alert("⚠️ El correo ya tiene una cuenta.");
          setLoading(false);
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

        let vinculadoCorrectamente = false;
        let empleadoInfo = null;
        let campoUsado = "";

        if (empleadoId) {
          empleadoInfo = empleados.find(e => String(e.id) === String(empleadoId));
          
          if (empleadoInfo && campoVinculacion) {
            const { error: updateError } = await supabase
              .from("empleados")
              .update({ [campoVinculacion]: nuevoUserId })
              .eq("id", empleadoId);
            
            if (!updateError) {
              vinculadoCorrectamente = true;
              campoUsado = campoVinculacion;
            }
          }
        }

        setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "APROBADA" } : s));
        await supabase.from("solicitudes_usuario").update({ estatus: "APROBADA" }).eq("id", solicitud.id);

        await supabase.auth.signOut();
        
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailAdmin,
          password: passwordAdmin
        });

        if (signInError) {
          alert(
            "✅ Usuario creado.\n\n⚠️ Tu sesión fue cerrada. Inicia sesión nuevamente.\n\n" +
            "Correo: " + correoLimpio + 
            "\nContraseña: " + passwordLimpio
          );
        } else {
          let mensajeEmpleado = "";
          if (empleadoInfo && vinculadoCorrectamente) {
            mensajeEmpleado = "\n\n🔗 Vinculado a: " + empleadoInfo.nombre_completo;
          } else if (empleadoInfo && !vinculadoCorrectamente) {
            mensajeEmpleado = "\n\n⚠️ No se pudo vincular al empleado.";
          } else {
            mensajeEmpleado = "\n\n⚠️ No se vinculó a ningún empleado.";
          }

          alert(
            "✅ Usuario creado exitosamente.\n\n" +
            "Correo: " + correoLimpio + 
            "\nContraseña: " + passwordLimpio + 
            mensajeEmpleado
          );
        }
        
        await cargarSolicitudes();
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false }));
      setModalPasswordAdmin({ abierto: false, password: "", solicitud: null, rolSeleccionado: "", empleadoSeleccionado: "" });
    }
  };

  const ejecutarRechazo = async (solicitud) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);
        
      if (error) throw new Error(error.message);
      
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      setModalConfirmacion(prev => ({ ...prev, abierto: false }));
    } catch (error) {
      alert("Error: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
    }
  };

  const darDeBajaUsuario = async (solicitud) => {
    try {
      setLoading(true);
      
      const { data: perfiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("nombre", solicitud.nombre);

      if (perfiles && perfiles.length > 0) {
        await supabase
          .from("profiles")
          .update({ activo: false, fecha_baja: new Date().toISOString() })
          .in("id", perfiles.map(p => p.id));
      }

      await supabase
        .from("solicitudes_usuario")
        .update({ estatus: "RECHAZADA" })
        .eq("id", solicitud.id);

      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      alert("✅ Usuario dado de baja correctamente.");
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false }));
    }
  };

  const eliminarDefinitivamente = async (solicitud) => {
    try {
      setLoading(true);
      
      const { data: perfiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("nombre", solicitud.nombre);

      if (perfiles && perfiles.length > 0) {
        await supabase
          .from("profiles")
          .delete()
          .in("id", perfiles.map(p => p.id));
      }

      await supabase
        .from("solicitudes_usuario")
        .delete()
        .eq("id", solicitud.id);

      setSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
      alert("✅ Usuario eliminado permanentemente.");
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false }));
    }
  };

  const confirmarAccion = (solicitud, accion) => {
    if (accion === "aprobar") {
      solicitarAprobacion(solicitud);
      return;
    }

    const config = {
      rechazar: {
        titulo: "Rechazar Solicitud",
        descripcion: "La solicitud se marcará como rechazada.",
        colorIcono: "bg-red-100",
        icono: "❌",
        colorBoton: "bg-red-600 hover:bg-red-700",
        textoBoton: "❌ Confirmar Rechazo"
      },
      baja: {
        titulo: "Dar de Baja al Usuario",
        descripcion: "El usuario NO podrá iniciar sesión hasta ser reactivado.",
        colorIcono: "bg-orange-100",
        icono: "🚫",
        colorBoton: "bg-orange-600 hover:bg-orange-700",
        textoBoton: "🚫 Confirmar Baja"
      },
      eliminar: {
        titulo: "⚠️ ELIMINACIÓN PERMANENTE",
        descripcion: "Esta acción NO se puede deshacer.",
        colorIcono: "bg-red-100",
        icono: "🗑️",
        colorBoton: "bg-red-700 hover:bg-red-800",
        textoBoton: "🗑️ Sí, Eliminar"
      }
    };

    const cfg = config[accion];
    if (!cfg) return;

    setModalConfirmacion({
      abierto: true,
      solicitud,
      accion,
      rolSeleccionado: "SUPERVISOR",
      empleadoSeleccionado: "",
      busquedaEmpleado: "",
      ...cfg
    });
  };

  const ejecutarAccion = () => {
    const { accion, solicitud } = modalConfirmacion;
    
    switch (accion) {
      case "aprobar":
        confirmarAprobacionInicial();
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

  const empleadosFiltrados = useMemo(() => {
    if (!modalConfirmacion.busquedaEmpleado) return empleados;
    const texto = modalConfirmacion.busquedaEmpleado.toLowerCase();
    return empleados.filter(emp => 
      (emp.nombre_completo || "").toLowerCase().includes(texto) ||
      (emp.numero_empleado || "").toLowerCase().includes(texto) ||
      (emp.puesto || "").toLowerCase().includes(texto) ||
      (emp.departamento || "").toLowerCase().includes(texto)
    );
  }, [empleados, modalConfirmacion.busquedaEmpleado]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📨 Solicitudes de Usuario</h1>
          <p className="text-slate-500 mt-1">Aprueba solicitudes, asigna roles y gestiona usuarios</p>
        </div>
        <Link to="/dashboard" className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm">
          ← Volver al Dashboard
        </Link>
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
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-4xl mb-2">⏳</div>
            Cargando...
          </div>
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
                          <button 
                            onClick={() => confirmarAccion(solicitud, "aprobar")} 
                            disabled={loading} 
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            ✅ Aprobar
                          </button>
                          <button 
                            onClick={() => confirmarAccion(solicitud, "rechazar")} 
                            disabled={loading} 
                            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            ❌ Rechazar
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center flex-wrap">
                          {solicitud.estatus === "APROBADA" && (
                            <button 
                              onClick={() => confirmarAccion(solicitud, "baja")} 
                              disabled={loading}
                              className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                            >
                              🚫 Dar de Baja
                            </button>
                          )}
                          <button 
                            onClick={() => confirmarAccion(solicitud, "eliminar")} 
                            disabled={loading}
                            className="bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
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

      {modalConfirmacion.abierto && modalConfirmacion.solicitud && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className={"w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 " + (modalConfirmacion.colorIcono || "bg-slate-100")}>
                {modalConfirmacion.icono || "❓"}
              </div>
              <h3 className="text-xl font-bold text-slate-800">{modalConfirmacion.titulo}</h3>
              <p className="text-sm text-slate-600 mt-2">{modalConfirmacion.descripcion}</p>
              
              {modalConfirmacion.accion === "aprobar" && (
                <div className="mt-4 text-left space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Asignar Rol:</label>
                    <select 
                      value={modalConfirmacion.rolSeleccionado}
                      onChange={(e) => setModalConfirmacion(prev => ({ ...prev, rolSeleccionado: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="SUPERVISOR">👷 Supervisor</option>
                      <option value="ADMINISTRATIVO">💼 Administrativo</option>
                      <option value="VISOR">👁️ Visor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">🔗 Vincular a Empleado:</label>
                    
                    <div className="relative mb-2">
                      <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
                      <input 
                        type="text"
                        placeholder="Buscar por nombre, número o puesto..."
                        value={modalConfirmacion.busquedaEmpleado}
                        onChange={(e) => setModalConfirmacion(prev => ({ ...prev, busquedaEmpleado: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg pl-9 p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                      />
                    </div>

                    <select 
                      value={modalConfirmacion.empleadoSeleccionado}
                      onChange={(e) => setModalConfirmacion(prev => ({ ...prev, empleadoSeleccionado: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      size={Math.min(empleadosFiltrados.length, 6)}
                    >
                      <option value="">-- Sin vincular --</option>
                      {empleadosFiltrados.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          #{emp.numero_empleado || "S/N"} - {emp.nombre_completo} {emp.puesto ? `(${emp.puesto})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Mostrando {empleadosFiltrados.length} de {empleados.length}
                    </p>
                  </div>
                </div>
              )}

              {modalConfirmacion.accion === "eliminar" && (
                <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-lg p-3 text-left">
                  <p className="text-sm text-red-800 font-semibold">⚠️ ADVERTENCIA</p>
                  <p className="text-xs text-red-700 mt-1">Esta acción es IRREVERSIBLE.</p>
                </div>
              )}

              {modalConfirmacion.accion === "baja" && (
                <div className="mt-4 bg-orange-50 border-2 border-orange-300 rounded-lg p-3 text-left">
                  <p className="text-sm text-orange-800 font-semibold">ℹ️ El usuario no podrá iniciar sesión hasta ser reactivado.</p>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 mt-3 text-left">
                <div className="font-bold text-slate-800">{modalConfirmacion.solicitud.nombre}</div>
                <div className="text-xs text-slate-600 font-mono">{modalConfirmacion.solicitud.correo || modalConfirmacion.solicitud.email}</div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setModalConfirmacion(prev => ({ ...prev, abierto: false }))} 
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

      {modalPasswordAdmin.abierto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 bg-blue-100">
                🔐
              </div>
              <h3 className="text-xl font-bold text-slate-800">Verificación de Seguridad</h3>
              <p className="text-sm text-slate-600 mt-2">Ingresa tu contraseña de administrador.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tu Contraseña:</label>
                <input 
                  type="password"
                  value={modalPasswordAdmin.password}
                  onChange={(e) => setModalPasswordAdmin(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Ingresa tu contraseña"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  autoFocus
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
                <p className="text-xs text-blue-800">
                  <strong>📋 Resumen:</strong><br/>
                  Usuario: {modalPasswordAdmin.solicitud?.nombre}<br/>
                  Correo: {modalPasswordAdmin.solicitud?.correo || modalPasswordAdmin.solicitud?.email}<br/>
                  Rol: {modalPasswordAdmin.rolSeleccionado}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setModalPasswordAdmin({ abierto: false, password: "", solicitud: null, rolSeleccionado: "", empleadoSeleccionado: "" })}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold transition"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (!modalPasswordAdmin.password || modalPasswordAdmin.password.length < 6) {
                    alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
                    return;
                  }
                  ejecutarAprobacion(
                    modalPasswordAdmin.solicitud,
                    modalPasswordAdmin.rolSeleccionado,
                    modalPasswordAdmin.empleadoSeleccionado,
                    modalPasswordAdmin.password
                  );
                }}
                disabled={loading || !modalPasswordAdmin.password}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg font-semibold transition"
              >
                {loading ? "Creando..." : "✅ Crear Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}