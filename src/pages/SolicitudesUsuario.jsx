import { useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function SolicitudesUsuario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("PENDIENTES");
  const [empleados, setEmpleados] = useState([]);
  const [campoVinculacion, setCampoVinculacion] = useState(null); // 🔥 NUEVO
  
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
    detectarCampoVinculacion(); // 🔥 NUEVO
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

  const cargarEmpleados = async () => {
    try {
      console.log("🔄 Cargando lista de empleados para vinculación...");
      
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre_completo, numero_empleado, puesto, departamento, activo")
        .eq("activo", true)
        .order("nombre_completo");
      
      if (error) {
        console.error("⚠️ Error con filtro 'activo', intentando sin filtro:", error);
        
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

  // 🔥 NUEVO: Detectar y crear automáticamente el campo de vinculación
  const detectarCampoVinculacion = async () => {
    try {
      console.log("🔍 Detectando campo de vinculación en tabla empleados...");
      
      // Obtener un empleado para ver qué columnas tiene
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .limit(1);
      
      if (error || !data || data.length === 0) {
        console.warn("⚠️ No se pudo detectar columnas de empleados");
        return;
      }
      
      const columnasExistentes = Object.keys(data[0]);
      console.log("📋 Columnas existentes en empleados:", columnasExistentes);
      
      // Buscar si ya existe un campo de vinculación
      const camposPosibles = ["id_usuario", "user_id", "auth_id"];
      let campoEncontrado = null;
      
      for (const campo of camposPosibles) {
        if (columnasExistentes.includes(campo)) {
          campoEncontrado = campo;
          console.log(`✅ Campo de vinculación encontrado: ${campo}`);
          break;
        }
      }
      
      // Si no existe, crearlo automáticamente
      if (!campoEncontrado) {
        console.log("🔨 Creando campo 'id_usuario' automáticamente...");
        
        const { error: createError } = await supabase.rpc("agregar_columna_dinamica", {
          p_tabla: "empleados",
          p_columna: "id_usuario",
          p_tipo: "UUID"
        });
        
        if (createError) {
          console.error("❌ No se pudo crear el campo 'id_usuario':", createError.message);
          alert("⚠️ No se pudo crear automáticamente el campo de vinculación.\n\nPor favor, ejecuta este SQL en Supabase:\nALTER TABLE empleados ADD COLUMN id_usuario UUID;");
        } else {
          console.log("✅ Campo 'id_usuario' creado exitosamente");
          campoEncontrado = "id_usuario";
        }
      }
      
      setCampoVinculacion(campoEncontrado);
    } catch (err) {
      console.error("Error detectando campo de vinculación:", err);
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
    setModalConfirmacion(prev => ({
      ...prev,
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
    }));
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

  // 🔥 CORREGIDO: Vinculación usando el campo detectado
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
          console.log("🔗 Intentando vincular usuario con empleado ID:", empleadoId);
          
          empleadoInfo = empleados.find(e => String(e.id) === String(empleadoId));
          
          if (empleadoInfo) {
            console.log("✅ Empleado encontrado localmente:", empleadoInfo.nombre_completo);
            
            // 🔥 USAR EL CAMPO DETECTADO O CREADO AUTOMÁTICAMENTE
            if (campoVinculacion) {
              console.log(`🔗 Usando campo de vinculación: ${campoVinculacion}`);
              
              const { error: updateError } = await supabase
                .from("empleados")
                .update({ [campoVinculacion]: nuevoUserId })
                .eq("id", empleadoId);
              
              if (!updateError) {
                console.log(`✅ Vinculación exitosa usando el campo: ${campoVinculacion}`);
                vinculadoCorrectamente = true;
                campoUsado = campoVinculacion;
              } else {
                console.error(`❌ Error al vincular usando ${campoVinculacion}:`, updateError.message);
              }
            } else {
              console.error("❌ No se detectó ni pudo crear un campo de vinculación");
            }
          } else {
            console.warn("⚠️ No se encontró el empleado en la lista local con ID:", empleadoId);
          }
        }

        setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "APROBADA" } : s));
        await supabase.from("solicitudes_usuario").update({ estatus: "APROBADA" }).eq("id", solicitud.id);

        console.log("🔄 Restaurando sesión del administrador...");
        await supabase.auth.signOut();
        
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailAdmin,
          password: passwordAdmin
        });

        if (signInError) {
          console.error("❌ No se pudo restaurar la sesión del admin:", signInError.message);
          alert(
            "✅ Usuario creado exitosamente con rol: " + rol + 
            ".\n\n⚠️ IMPORTANTE: Tu sesión fue cerrada por seguridad.\n" +
            "Por favor, inicia sesión nuevamente con tus credenciales de administrador.\n\n" +
            "Correo del nuevo usuario: " + correoLimpio + 
            "\nContraseña del nuevo usuario: " + passwordLimpio
          );
        } else {
          console.log("✅ Sesión del administrador restaurada correctamente");
          
          let mensajeEmpleado = "";
          if (empleadoInfo && vinculadoCorrectamente) {
            mensajeEmpleado = 
              "\n\n🔗 Vinculado exitosamente a: " + empleadoInfo.nombre_completo + 
              " (#" + empleadoInfo.numero_empleado + ")" +
              "\n📋 Campo usado: " + campoUsado;
          } else if (empleadoInfo && !vinculadoCorrectamente) {
            mensajeEmpleado = 
              "\n\n⚠️ Se encontró al empleado " + empleadoInfo.nombre_completo + 
              " (#" + empleadoInfo.numero_empleado + "), pero NO se pudo vincular." +
              "\n💡 Verifica la consola (F12) para más detalles.";
          } else {
            mensajeEmpleado = "\n\n⚠️ No se vinculó a ningún empleado existente.";
          }

          alert(
            "✅ Usuario creado exitosamente con rol: " + rol + 
            ".\n\nCorreo: " + correoLimpio + 
            "\nContraseña: " + passwordLimpio + 
            mensajeEmpleado + 
            "\n\n💡 Tu sesión se mantuvo activa. Puedes continuar trabajando normalmente."
          );
        }
        
        await cargarSolicitudes();
      }
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la solicitud: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "", busquedaEmpleado: "" }));
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
        
      if (error) throw new Error("Error de base de datos: " + error.message);
      
      setSolicitudes(prev => prev.map(s => s.id === solicitud.id ? { ...s, estatus: "RECHAZADA" } : s));
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "", busquedaEmpleado: "" }));
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar: " + error.message);
      await cargarSolicitudes();
    } finally {
      setLoading(false);
    }
  };

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
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "", busquedaEmpleado: "" }));
    }
  };

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
      setModalConfirmacion(prev => ({ ...prev, abierto: false, solicitud: null, accion: "", busquedaEmpleado: "" }));
    }
  };

  const confirmarAccion = (solicitud, accion) => {
    if (accion === "aprobar") {
      solicitarAprobacion(solicitud);
      return;
    }

    let titulo = "";
    let descripcion = "";
    let colorIcono = "";
    let icono = "";
    let colorBoton = "";
    let textoBoton = "";

    switch (accion) {
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
      busquedaEmpleado: "",
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
                            className="bg-red-700 hover:bg-red-80