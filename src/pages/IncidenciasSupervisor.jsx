import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

const formatearNombreColumna = (texto) => String(texto || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const esCampoMonetario = (campo) => {
  const n = String(campo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ['valor', 'monto', 'bono', 'descuento', 'sueldo', 'pago', 'total', 'neto', 'apoyo', 'gratificacion', 'aguinaldo', 'ptu', 'infonavit', 'imss', 'saldo', 'deduccion', 'percepcion', 'prima', 'comision'].some(p => n.includes(p));
};

const limpiarPayload = (payload) => {
  const limpio = { ...payload };
  ['id', 'created_at', 'updated_at', 'deleted_at'].forEach(k => delete limpio[k]);
  Object.keys(limpio).forEach(k => {
    if (limpio[k] === "" || limpio[k] === null || limpio[k] === undefined) delete limpio[k];
  });
  return limpio;
};

const MENSAJE_SIN_PERFIL = 
  "No hemos podido asociar tu cuenta con un perfil de empleado activo.\n\n" +
  "Por favor, contacta a Recursos Humanos indicando tu correo electrónico registrado.";

export default function IncidenciasSupervisor() {
  const navigate = useNavigate();
  
  const [supervisorActual, setSupervisorActual] = useState(null);
  const [empleadosSupervisados, setEmpleadosSupervisados] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [periodoActivo, setPeriodoActivo] = useState(null); // 🔥 Cambiado a un solo objeto
  const [columnasSupervisor, setColumnasSupervisor] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [modalCaptura, setModalCaptura] = useState({ abierto: false, empleado: null });

  useEffect(() => {
    const cargarInicial = async () => {
      setLoading(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          navigate("/login");
          return;
        }

        // 1. Verificar rol
        const { data: perfil } = await supabase
          .from("profiles")
          .select("rol")
          .eq("id", user.id)
          .maybeSingle();

        const rolNormalizado = String(perfil?.rol || "").trim().toUpperCase();
        if (rolNormalizado !== "SUPERVISOR" && rolNormalizado !== "VISOR") {
          alert("⛔ Acceso denegado. Esta sección es exclusiva para Supervisores.");
          navigate("/dashboard");
          return;
        }

        // 2. 🔍 BÚSQUEDA ESTRICTA POR id_usuario (SIN JOINS AMBIGUOS)
        const { data: supervisorData, error: errSup } = await supabase
          .from("empleados")
          .select("id, nombre_completo, numero_empleado, puesto, departamento, activo")
          .eq("id_usuario", user.id)
          .maybeSingle();

        if (!supervisorData) {
          alert(MENSAJE_SIN_PERFIL);
          await supabase.auth.signOut();
          navigate("/login");
          return;
        }

        setSupervisorActual(supervisorData);

        // 3. Cargar períodos y configuración
        const [resPeriodos, resConfig] = await Promise.all([
          supabase.from("periodos_nomina").select("*").order("fecha_inicio", { ascending: false }),
          supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle(),
        ]);

        // 🔥 FILTRAR PARA OBTENER SOLO EL PERÍODO ACTIVO
        const todosLosPeriodos = resPeriodos.data || [];
        const hoy = new Date();
        
        const periodoEncontrado = todosLosPeriodos.find(p => {
          const inicio = new Date(p.fecha_inicio);
          const fin = new Date(p.fecha_fin);
          // Ajustamos la hora para evitar problemas de zona horaria al comparar fechas
          return hoy >= new Date(inicio.setHours(0,0,0,0)) && hoy <= new Date(fin.setHours(23,59,59,999));
        }) || todosLosPeriodos[0]; // Fallback al más reciente si no hay coincidencia exacta de fechas

        if (periodoEncontrado) {
          setPeriodoActivo(periodoEncontrado);
        } else {
          alert("⚠️ No hay períodos de nómina configurados en el sistema.");
          navigate("/dashboard");
          return;
        }

        // 4. Cargar columnas permitidas para supervisor
        let config = resConfig.data?.configuracion;
        if (!config) {
          const local = localStorage.getItem("config_mapeo_columnas_dinamico");
          if (local) config = JSON.parse(local);
        }

        if (config?.asignacion) {
          const columnas = [];
          Object.entries(config.asignacion).forEach(([colOriginal, info]) => {
            if (info.tablaDestino === 'incidencias' && info.permite_supervisor) {
              const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
              if (campoFinal) {
                columnas.push({ original: colOriginal, campo: campoFinal, etiqueta: formatearNombreColumna(campoFinal) });
              }
            }
          });
          setColumnasSupervisor(columnas);
        }

        // 5. Cargar empleados a cargo (SIN JOINS AMBIGUOS)
        const { data: empleadosData } = await supabase
          .from("empleados")
          .select("id, nombre_completo, numero_empleado, puesto, departamento, activo")
          .eq("supervisor_id", supervisorData.id)
          .eq("activo", true)
          .order("nombre_completo");
        
        setEmpleadosSupervisados(empleadosData || []);

      } catch (err) {
        console.error("Error en cargarInicial:", err);
      } finally {
        setLoading(false);
      }
    };
    cargarInicial();
  }, [navigate]);

  // Cargar incidencias del período activo
  useEffect(() => {
    if (!periodoActivo || !supervisorActual) return;
    const cargarIncidencias = async () => {
      const idsEmpleados = empleadosSupervisados.map(e => e.id);
      if (idsEmpleados.length === 0) {
        setIncidencias([]);
        return;
      }
      const { data, error } = await supabase
        .from("incidencias")
        .select("*")
        .eq("periodo_id", periodoActivo.id)
        .in("empleado_id", idsEmpleados);
      if (!error) setIncidencias(data || []);
    };
    cargarIncidencias();
  }, [periodoActivo, empleadosSupervisados, supervisorActual]);

  // Guardar captura
  const guardarCaptura = async (empleadoId, valores) => {
    setGuardando(true);
    try {
      const payload = limpiarPayload({
        empleado_id: empleadoId,
        periodo_id: periodoActivo.id, // 🔥 Forzamos el uso del período activo
        estado: "pendiente",
        ...valores,
      });

      const { data: existente } = await supabase
        .from("incidencias")
        .select("id")
        .eq("empleado_id", empleadoId)
        .eq("periodo_id", periodoActivo.id)
        .maybeSingle();

      let error;
      if (existente) {
        const { error: e } = await supabase.from("incidencias").update(payload).eq("id", existente.id);
        error = e;
      } else {
        const { error: e } = await supabase.from("incidencias").insert([payload]);
        error = e;
      }
      if (error) throw error;

      setModalCaptura({ abierto: false, empleado: null });
      
      const idsEmpleados = empleadosSupervisados.map(e => e.id);
      const { data } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoActivo.id).in("empleado_id", idsEmpleados);
      setIncidencias(data || []);
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const empleadosConIncidencias = useMemo(() => {
    return empleadosSupervisados.map(emp => ({
      empleado: emp,
      incidencia: incidencias.find(i => i.empleado_id === emp.id) || null,
    }));
  }, [empleadosSupervisados, incidencias]);

  const empleadosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return empleadosConIncidencias;
    const texto = busqueda.toLowerCase().trim();
    return empleadosConIncidencias.filter(({ empleado }) =>
      [empleado.nombre_completo, empleado.numero_empleado, empleado.puesto]
        .some(c => String(c || "").toLowerCase().includes(texto))
    );
  }, [empleadosConIncidencias, busqueda]);

  const kpis = useMemo(() => {
    const total = empleadosSupervisados.length;
    const conCaptura = incidencias.length;
    const pendientes = incidencias.filter(i => i.estado === "pendiente").length;
    return { total, conCaptura, pendientes, sinCaptura: total - conCaptura };
  }, [empleadosSupervisados, incidencias]);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-slate-600 font-semibold">Cargando tu portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black">👷</div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Portal del Supervisor</h1>
              <p className="text-xs text-slate-500">Captura de incidencias</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {supervisorActual && (
              <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {supervisorActual.nombre_completo?.charAt(0).toUpperCase()}
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-800">{supervisorActual.nombre_completo}</div>
                  <div className="text-slate-500">{supervisorActual.puesto || "Sin puesto"}</div>
                </div>
              </div>
            )}
            <button onClick={cerrarSesion} className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-1.5">
              🚪 <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl font-black">
              {supervisorActual?.nombre_completo?.charAt(0).toUpperCase() || "S"}
            </div>
            <div>
              <h2 className="text-2xl font-black">¡Hola, {supervisorActual?.nombre_completo?.split(' ')[0]}!</h2>
              <p className="text-white/80 text-sm mt-0.5">
                {supervisorActual?.puesto || "Sin puesto"} · {supervisorActual?.departamento || "Sin departamento"}
              </p>
            </div>
          </div>
        </div>

        {supervisorActual && periodoActivo && (
          <>
            {/* 🔥 VISUALIZACIÓN DE PERÍODO ACTIVO (SOLO LECTURA) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">📅</div>
                  <div>
                    <div className="text-xs text-slate-500 font-semibold uppercase">Período Activo</div>
                    <div className="text-sm font-bold text-slate-800">Solo puedes capturar incidencias en el período actual</div>
                  </div>
                </div>
                
                {/* Campo de solo lectura que muestra el período activo */}
                <div className="flex-1 w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-semibold text-slate-700 flex items-center justify-between">
                  <span>{periodoActivo.descripcion || "Período sin nombre"}</span>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold flex items-center gap-1">
                    🔒 Bloqueado
                  </span>
                </div>

                <div className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-medium whitespace-nowrap">
                  📆 {new Date(periodoActivo.fecha_inicio).toLocaleDateString('es-MX')} - {new Date(periodoActivo.fecha_fin).toLocaleDateString('es-MX')}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Mi Equipo</div>
                <div className="text-2xl font-black text-blue-600">{kpis.total}</div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Capturados</div>
                <div className="text-2xl font-black text-emerald-600">{kpis.conCaptura}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <div className="text-xs text-amber-700 font-medium">⚠️ Sin Captura</div>
                <div className="text-2xl font-black text-amber-700">{kpis.sinCaptura}</div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Pendientes RH</div>
                <div className="text-2xl font-black text-indigo-600">{kpis.pendientes}</div>
              </div>
            </div>

            {/* LISTA DE EMPLEADOS */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-xl">👥</span> Mi Equipo ({empleadosFiltrados.length})
                  </h3>
                  <div className="text-xs text-slate-500">{columnasSupervisor.length} campos disponibles</div>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar empleado por nombre o número..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {empleadosFiltrados.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="text-6xl mb-3">📭</div>
                    <div className="text-slate-500 font-semibold">
                      {busqueda ? "No se encontraron empleados" : "No tienes empleados a cargo"}
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {empleadosFiltrados.map(({ empleado, incidencia }) => {
                      const estado = incidencia?.estado || "sin_captura";
                      const estadoConfig = {
                        sin_captura: { color: "bg-slate-100 text-slate-600", icono: "⚠️", label: "Sin captura", bgRow: "" },
                        pendiente: { color: "bg-amber-100 text-amber-800", icono: "⏳", label: "Pendiente", bgRow: "bg-amber-50/30" },
                        aprobado: { color: "bg-emerald-100 text-emerald-800", icono: "✅", label: "Aprobado", bgRow: "" },
                        rechazado: { color: "bg-red-100 text-red-800", icono: "❌", label: "Rechazado", bgRow: "bg-red-50/30" },
                      }[estado];

                      return (
                        <div key={empleado.id} className={`p-4 hover:bg-slate-50 transition ${estadoConfig.bgRow}`}>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-slate-400 to-slate-600 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0">
                              {empleado.nombre_completo?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-500">#{empleado.numero_empleado}</span>
                                <h4 className="font-bold text-slate-800 truncate">{empleado.nombre_completo}</h4>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                                  {empleado.puesto || "Sin puesto"}
                                </span>
                                <span className={`${estadoConfig.color} px-2 py-0.5 rounded-full font-bold`}>
                                  {estadoConfig.icono} {estadoConfig.label}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => setModalCaptura({ abierto: true, empleado: { ...empleado, incidencia } })}
                              disabled={columnasSupervisor.length === 0}
                              className={`px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition flex-shrink-0 ${
                                incidencia ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
                              } disabled:bg-slate-300 disabled:cursor-not-allowed`}
                            >
                              {incidencia ? "✏️ Editar" : "📝 Capturar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* MODAL DE CAPTURA */}
      {modalCaptura.abierto && modalCaptura.empleado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <ModalCapturaSupervisor
            empleado={modalCaptura.empleado}
            periodo={periodoActivo}
            columnas={columnasSupervisor}
            guardando={guardando}
            onGuardar={guardarCaptura}
            onCerrar={() => setModalCaptura({ abierto: false, empleado: null })}
          />
        </div>
      )}
    </div>
  );
}

// COMPONENTE MODAL DE CAPTURA
function ModalCapturaSupervisor({ empleado, periodo, columnas, guardando, onGuardar, onCerrar }) {
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(col => { init[col.campo] = empleado.incidencia?.[col.campo] ?? 0; });
    return init;
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onGuardar(empleado.id, valores); }} className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-4 rounded-t-2xl">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2"><span>📝</span> Captura de Incidencia</h3>
            <p className="text-sm text-white/90 mt-1"><strong>{empleado.nombre_completo}</strong></p>
            <p className="text-xs text-white/70 mt-0.5">
              {empleado.puesto || "Sin puesto"} · {empleado.departamento || "Sin departamento"}
            </p>
            <p className="text-xs text-blue-100 mt-1 font-semibold">
              📅 Período: {periodo?.descripcion}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl leading-none">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {columnas.length > 0 ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              💡 Llena los campos con la información del día. Los datos quedarán pendientes de validación por RH.
            </div>
            {columnas.map(col => {
              const esMonet = esCampoMonetario(col.campo);
              return (
                <div key={col.campo} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    {col.etiqueta}
                    {esMonet && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">💰</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valores[col.campo] ?? 0}
                    onChange={e => setValores(prev => ({ ...prev, [col.campo]: e.target.value }))}
                    className="w-full border-2 border-slate-200 p-3 rounded-lg text-base font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <p className="text-amber-800 font-semibold">No hay campos habilitados</p>
            <p className="text-amber-700 text-sm mt-1">Contacta a Recursos Humanos para que habilite los campos de captura.</p>
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
        <button type="button" onClick={onCerrar} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50">Cancelar</button>
        <button type="submit" disabled={guardando || columnas.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-blue-300 shadow-sm">
          {guardando ? "⏳ Guardando..." : "📝 Enviar a RH"}
        </button>
      </div>
    </form>
  );
}