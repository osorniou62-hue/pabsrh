import { useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const formatearNombreColumna = (texto) =>
  String(texto || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const normalizar = (texto) =>
  String(texto || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const esCampoMonetario = (campo) => {
  const n = normalizar(campo);
  return ['valor', 'monto', 'bono', 'descuento', 'sueldo', 'pago', 'total',
    'neto', 'apoyo', 'gratificacion', 'aguinaldo', 'ptu', 'infonavit', 'imss',
    'saldo', 'deduccion', 'percepcion', 'prima', 'comision'].some(p => n.includes(p));
};

// 🔥 Función helper para limpiar payload antes de enviar a Supabase
const limpiarPayload = (payload) => {
  const limpio = { ...payload };
  // Eliminar campos que no deben enviarse
  delete limpio.id;
  delete limpio.created_at;
  delete limpio.updated_at;
  delete limpio.deleted_at;
  
  // Eliminar valores vacíos
  Object.keys(limpio).forEach(k => {
    if (limpio[k] === "" || limpio[k] === null || limpio[k] === undefined) {
      delete limpio[k];
    }
  });
  return limpio;
};

export default function Incidencias() {
  // Estados principales
  const [empleados, setEmpleados] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [puestosLista, setPuestosLista] = useState([]);
  const [departamentosLista, setDepartamentosLista] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros y vista
  const [vistaActual, setVistaActual] = useState("supervisor");
  const [periodoId, setPeriodoId] = useState("");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("TODOS");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  // Modales
  const [modalCaptura, setModalCaptura] = useState({ abierto: false, empleado: null });
  const [modalRevision, setModalRevision] = useState({ abierto: false, registro: null });
  const [modalPermisos, setModalPermisos] = useState(false);
  const [modalConfigColumnas, setModalConfigColumnas] = useState(false);
  const [permisosSupervisor, setPermisosSupervisor] = useState({});
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Configuración
  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [ordenColumnas, setOrdenColumnas] = useState(() => {
    try { return JSON.parse(localStorage.getItem("incidencias_orden_columnas")) || []; } catch { return []; }
  });
  const [columnasVisibles, setColumnasVisibles] = useState(() => {
    try { return JSON.parse(localStorage.getItem("incidencias_columnas_visibles")) || {}; } catch { return {}; }
  });

  // 🔥 Columnas del mapeo con permisos
  const columnasDelMapeo = useMemo(() => {
    if (!configuracionMapeo?.asignacion) return [];
    const validas = [];
    Object.entries(configuracionMapeo.asignacion).forEach(([colOriginal, info]) => {
      if (info.tablaDestino === 'incidencias' && (info.campoDestino || info.campoManual)) {
        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
        if (campoFinal) {
          validas.push({
            original: colOriginal,
            campo: campoFinal,
            etiqueta: formatearNombreColumna(campoFinal),
            permite_supervisor: permisosSupervisor[campoFinal] || false,
          });
        }
      }
    });
    const unicas = new Map();
    validas.forEach(item => { if (!unicas.has(item.campo)) unicas.set(item.campo, item); });
    return Array.from(unicas.values());
  }, [configuracionMapeo, permisosSupervisor]);

  const columnasActivas = useMemo(() => {
    const visibles = columnasDelMapeo.filter(c => columnasVisibles[c.campo] !== false);
    return visibles.sort((a, b) => {
      const idxA = ordenColumnas.indexOf(a.campo);
      const idxB = ordenColumnas.indexOf(b.campo);
      return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
    });
  }, [columnasDelMapeo, columnasVisibles, ordenColumnas]);

  const columnasSupervisor = useMemo(() => columnasActivas.filter(c => c.permite_supervisor), [columnasActivas]);

  // 🔥 Carga inicial robusta
  useEffect(() => {
    cargarPeriodos();
    cargarCatalogos();
    cargarEmpleados();
    cargarConfiguracion();
    cargarPermisos();
  }, []);

  useEffect(() => {
    if (periodoId && empleados.length > 0) cargarIncidencias();
  }, [periodoId]);

  useEffect(() => {
    if (columnasDelMapeo.length > 0) {
      setColumnasVisibles(prev => {
        const nuevo = { ...prev };
        columnasDelMapeo.forEach(col => { if (nuevo[col.campo] === undefined) nuevo[col.campo] = true; });
        return nuevo;
      });
      setOrdenColumnas(prev => {
        const nuevo = [...prev];
        columnasDelMapeo.forEach(col => { if (!nuevo.includes(col.campo)) nuevo.push(col.campo); });
        return nuevo;
      });
    }
  }, [columnasDelMapeo]);

  useEffect(() => { localStorage.setItem("incidencias_columnas_visibles", JSON.stringify(columnasVisibles)); }, [columnasVisibles]);
  useEffect(() => { localStorage.setItem("incidencias_orden_columnas", JSON.stringify(ordenColumnas)); }, [ordenColumnas]);

  const cargarPeriodos = async () => {
    const { data } = await supabase.from("periodos_nomina").select("*").order("fecha_inicio", { ascending: false });
    setPeriodos(data || []);
    if (data?.length > 0) setPeriodoId(data[0].id);
  };

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepts] = await Promise.all([
        supabase.from("puestos").select("*").order("nombre"),
        supabase.from("departamentos").select("*").order("nombre"),
      ]);
      const puestosUnicos = new Map();
      (resPuestos.data || []).forEach(p => {
        const nombre = String(p.nombre || "").trim();
        if (nombre && !puestosUnicos.has(nombre.toLowerCase())) {
          puestosUnicos.set(nombre.toLowerCase(), { ...p, nombre });
        }
      });
      setPuestosLista(Array.from(puestosUnicos.values()));
      setDepartamentosLista(resDepts.data || []);
    } catch (e) { console.error("Error cargando catálogos:", e); }
  };

  // 🔥 CARGA ROBUSTA DE EMPLEADOS
  const cargarEmpleados = async () => {
    try {
      const { data: emps, error } = await supabase.from("empleados").select("*").order("nombre_completo");
      if (error) throw error;

      const empleadosProcesados = (emps || []).map(emp => {
        let deptoObj = null;
        if (emp.departamento_id) deptoObj = departamentosLista.find(d => d.id === emp.departamento_id);
        if (!deptoObj && emp.departamento) deptoObj = { nombre: emp.departamento };

        let puestoObj = null;
        if (emp.puesto_id) puestoObj = puestosLista.find(p => p.id === emp.puesto_id);
        if (!puestoObj && emp.puesto) puestoObj = { nombre: emp.puesto };

        return { ...emp, departamentos: deptoObj, puestos: puestoObj };
      });

      setEmpleados(empleadosProcesados);
    } catch (err) {
      console.error("❌ Error cargando empleados:", err);
      setEmpleados([]);
    }
  };

  const cargarIncidencias = async () => {
    if (!periodoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
      if (error) throw error;
      setIncidencias(data || []);
    } catch (err) {
      console.error("Error cargando incidencias:", err);
      setIncidencias([]);
    } finally { setLoading(false); }
  };

  const cargarConfiguracion = async () => {
    try {
      const { data } = await supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle();
      if (data?.configuracion) setConfiguracionMapeo(data.configuracion);
      else {
        const local = localStorage.getItem("config_mapeo_columnas_dinamico");
        if (local) setConfiguracionMapeo(JSON.parse(local));
      }
    } catch (err) { console.error("Error:", err); }
  };

  const cargarPermisos = async () => {
    try {
      const { data } = await supabase.from("configuracion_tablas").select("configuracion").eq("clave", "permisos_incidencias").maybeSingle();
      if (data?.configuracion) setPermisosSupervisor(data.configuracion);
      else {
        const local = localStorage.getItem("permisos_incidencias");
        if (local) setPermisosSupervisor(JSON.parse(local));
      }
    } catch (err) { console.error("Error:", err); }
  };

  const guardarPermisos = async () => {
    setGuardandoPermisos(true);
    try {
      await supabase.from("configuracion_tablas").upsert({
        clave: "permisos_incidencias",
        configuracion: permisosSupervisor,
      }, { onConflict: "clave" });
      localStorage.setItem("permisos_incidencias", JSON.stringify(permisosSupervisor));
      alert("✅ Permisos guardados");
      setModalPermisos(false);
    } catch (err) { alert("Error: " + err.message); }
    finally { setGuardandoPermisos(false); }
  };

  // 🔥 GUARDAR CAPTURA RÁPIDA (CORREGIDO)
  const guardarCapturaRapida = async (empleadoId, valores) => {
    setGuardando(true);
    try {
      // 🔥 Construir payload SIN incluir 'id' ni campos del sistema
      const payload = limpiarPayload({
        empleado_id: empleadoId,
        periodo_id: Number(periodoId),
        estado: "pendiente",
        ...valores
      });

      // 🔥 Verificar si ya existe un registro para este empleado/período
      const { data: existente, error: errorBusqueda } = await supabase
        .from("incidencias")
        .select("id")
        .eq("empleado_id", empleadoId)
        .eq("periodo_id", periodoId)
        .maybeSingle();

      if (errorBusqueda) throw errorBusqueda;

      let error;
      if (existente) {
        // Si existe, hacer UPDATE
        const resultado = await supabase
          .from("incidencias")
          .update(payload)
          .eq("id", existente.id);
        error = resultado.error;
      } else {
        // Si no existe, hacer INSERT
        const resultado = await supabase
          .from("incidencias")
          .insert([payload]);
        error = resultado.error;
      }

      if (error) throw error;
      
      setModalCaptura({ abierto: false, empleado: null });
      await cargarIncidencias();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // 🔥 GUARDAR REVISIÓN RH (CORREGIDO)
  const guardarRevision = async (incidenciaId, valores, estado, comentario) => {
    setGuardando(true);
    try {
      // 🔥 Construir payload SIN incluir 'id' ni campos del sistema
      const payload = limpiarPayload({
        ...valores,
        estado,
        comentarios_rrhh: comentario || null,
        fecha_revision: new Date().toISOString()
      });

      // 🔥 Usar UPDATE directo con el ID existente
      const { error } = await supabase
        .from("incidencias")
        .update(payload)
        .eq("id", incidenciaId);

      if (error) throw error;
      
      setModalRevision({ abierto: false, registro: null });
      await cargarIncidencias();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // 🔥 Edición inline desde la tabla
  const actualizarCampoInline = async (incidenciaId, campo, valor) => {
    try {
      const { error } = await supabase
        .from("incidencias")
        .update({ [campo]: valor })
        .eq("id", incidenciaId);
      if (error) throw error;
      await cargarIncidencias();
    } catch (err) { alert("Error: " + err.message); }
  };

  // Helpers
  const cambiarVisibilidadColumna = (campo) => setColumnasVisibles(prev => ({ ...prev, [campo]: !prev[campo] }));
  const moverColumna = (campo, direccion) => {
    setOrdenColumnas(prev => {
      const idx = prev.indexOf(campo);
      if (idx === -1) return prev;
      const nuevo = [...prev];
      if (direccion === 'arriba' && idx > 0) [nuevo[idx - 1], nuevo[idx]] = [nuevo[idx], nuevo[idx - 1]];
      else if (direccion === 'abajo' && idx < prev.length - 1) [nuevo[idx], nuevo[idx + 1]] = [nuevo[idx + 1], nuevo[idx]];
      return nuevo;
    });
  };

  // 🔥 Combinar empleados con incidencias
  const registros = useMemo(() => {
    return empleados.map(emp => {
      const inc = incidencias.find(i => i.empleado_id === emp.id);
      return { empleado: emp, incidencia: inc || null };
    });
  }, [empleados, incidencias]);

  const registrosFiltrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return registros.filter(r => {
      const emp = r.empleado;
      const coincide = [emp.nombre_completo, emp.numero_empleado, emp.departamentos?.nombre, emp.puestos?.nombre]
        .some(c => String(c || "").toLowerCase().includes(texto));
      const coincideDepto = departamentoFiltro === "TODOS" || emp.departamentos?.nombre === departamentoFiltro;
      const estado = r.incidencia?.estado || "sin_captura";
      const coincideEstado = estadoFiltro === "TODOS" || estado === estadoFiltro;
      return coincide && coincideDepto && coincideEstado;
    });
  }, [registros, busqueda, departamentoFiltro, estadoFiltro]);

  const kpis = useMemo(() => {
    const total = empleados.length;
    const conCaptura = incidencias.length;
    const pendientes = incidencias.filter(i => i.estado === "pendiente").length;
    const aprobados = incidencias.filter(i => i.estado === "aprobado").length;
    const rechazados = incidencias.filter(i => i.estado === "rechazado").length;
    return { total, conCaptura, pendientes, aprobados, rechazados, sinCaptura: total - conCaptura };
  }, [empleados, incidencias]);

  const departamentos = ["TODOS", ...new Set(empleados.map(e => e?.departamentos?.nombre).filter(Boolean))].sort();
  const periodoActual = periodos.find(p => p.id === periodoId);

  return (
    <Layout>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">⚡ Incidencias</h1>
            <p className="text-gray-500 mt-2">
              {vistaActual === "supervisor" ? "👷 Captura rápida por Supervisor" : "🔍 Validación y análisis por RH"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
            <button onClick={() => setModalPermisos(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 rounded-xl font-semibold text-sm">🔒 Permisos</button>
            <button onClick={() => setModalConfigColumnas(true)} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-3 rounded-xl font-semibold text-sm">⚙️ Columnas</button>
          </div>
        </div>

        {/* SELECTOR DE PERÍODO */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-200">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <label className="font-bold text-slate-800">📅 Período:</label>
            <select value={periodoId} onChange={e => setPeriodoId(e.target.value)} className="flex-1 border-2 border-blue-300 rounded-xl p-3 bg-white font-semibold focus:ring-2 focus:ring-blue-500 outline-none">
              {periodos.map(p => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
            </select>
            {periodoActual && <div className="text-xs text-slate-600">📆 {new Date(periodoActual.fecha_inicio).toLocaleDateString('es-MX')} - {new Date(periodoActual.fecha_fin).toLocaleDateString('es-MX')}</div>}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <KpiCard titulo="Empleados" valor={kpis.total} icono="👥" color="text-blue-600" />
          <KpiCard titulo="Con Captura" valor={kpis.conCaptura} icono="📝" color="text-indigo-600" />
          <KpiCard titulo="Sin Captura" valor={kpis.sinCaptura} icono="⚠️" color="text-gray-600" />
          <KpiCard titulo="Pendientes" valor={kpis.pendientes} icono="⏳" color="text-amber-600" />
          <KpiCard titulo="Aprobados" valor={kpis.aprobados} icono="✅" color="text-emerald-600" />
          <KpiCard titulo="Rechazados" valor={kpis.rechazados} icono="❌" color="text-red-600" />
        </div>

        {/* TABS */}
        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl">
          <button onClick={() => setVistaActual("supervisor")} className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${vistaActual === "supervisor" ? "bg-white text-blue-700 shadow-md" : "text-slate-600"}`}>
            👷 Supervisor
          </button>
          <button onClick={() => setVistaActual("rrhh")} className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${vistaActual === "rrhh" ? "bg-white text-purple-700 shadow-md" : "text-slate-600"}`}>
            🔍 RH
          </button>
        </div>

        {/* FILTROS */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <div className="grid md:grid-cols-4 gap-3">
            <input type="text" placeholder="🔍 Buscar por nombre, número..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
            <select value={departamentoFiltro} onChange={e => setDepartamentoFiltro(e.target.value)} className="border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none">
              {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className="border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="TODOS">Todos los estados</option>
              <option value="sin_captura">⚠️ Sin captura</option>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="aprobado">✅ Aprobado</option>
              <option value="rechazado">❌ Rechazado</option>
            </select>
            <div className="flex items-center justify-end text-sm text-slate-600">
              Mostrando <strong className="mx-1">{registrosFiltrados.length}</strong> de <strong>{empleados.length}</strong>
            </div>
          </div>
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 text-gray-700 font-bold border-b sticky top-0">
              <tr>
                <th className="p-3">No.</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Departamento</th>
                <th className="p-3">Puesto</th>
                <th className="p-3">Estado</th>
                {columnasActivas.map(col => (
                  <th key={col.campo} className={`p-3 text-right ${esCampoMonetario(col.campo) ? 'bg-emerald-50 text-emerald-900' : col.permite_supervisor ? 'bg-blue-50 text-blue-900' : 'bg-gray-50'}`}>
                    {col.etiqueta}
                    {col.permite_supervisor && <span className="ml-1 text-[9px] bg-blue-200 text-blue-800 px-1 rounded">👷</span>}
                  </th>
                ))}
                {vistaActual === "rrhh" && <th className="p-3">💬</th>}
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={20} className="p-6 text-center text-gray-500">Cargando...</td></tr>}
              {!loading && registrosFiltrados.map(({ empleado, incidencia }) => {
                const estado = incidencia?.estado || "sin_captura";
                const estadoColor = { sin_captura: "bg-gray-100 text-gray-600", pendiente: "bg-amber-100 text-amber-800", aprobado: "bg-emerald-100 text-emerald-800", rechazado: "bg-red-100 text-red-800" }[estado];
                const estadoIcono = { sin_captura: "⚠️", pendiente: "⏳", aprobado: "✅", rechazado: "❌" }[estado];
                const estadoLabel = { sin_captura: "Sin captura", pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado" }[estado];

                return (
                  <tr key={empleado.id} className={`border-t hover:bg-slate-50 transition ${estado === "rechazado" ? "bg-red-50/30" : ""}`}>
                    <td className="p-3 font-mono">{empleado.numero_empleado || "S/N"}</td>
                    <td className="p-3 font-semibold text-gray-800">{empleado.nombre_completo || "Sin nombre"}</td>
                    <td className="p-3">{empleado.departamentos?.nombre || "N/A"}</td>
                    <td className="p-3">{empleado.puestos?.nombre || "Sin asignar"}</td>
                    <td className="p-3">
                      <span className={`${estadoColor} px-2 py-0.5 rounded-full text-[10px] font-bold`}>
                        {estadoIcono} {estadoLabel}
                      </span>
                    </td>
                    {columnasActivas.map(col => {
                      const val = incidencia?.[col.campo];
                      const esMonet = esCampoMonetario(col.campo);
                      const displayVal = val !== null && val !== undefined && val !== ""
                        ? (esMonet ? `$${Number(val).toFixed(2)}` : val)
                        : <span className="text-slate-300">-</span>;
                      return (
                        <td key={col.campo} className={`p-3 text-right ${esMonet ? 'text-emerald-700 font-semibold' : ''}`}>
                          {displayVal}
                        </td>
                      );
                    })}
                    {vistaActual === "rrhh" && (
                      <td className="p-3 max-w-[120px] truncate text-[10px] text-slate-600" title={incidencia?.comentarios_rrhh || ""}>
                        {incidencia?.comentarios_rrhh || <span className="text-slate-300">-</span>}
                      </td>
                    )}
                    <td className="p-3">
                      {vistaActual === "supervisor" ? (
                        <button onClick={() => setModalCaptura({ abierto: true, empleado: { ...empleado, incidencia } })} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs">
                          {incidencia ? "✏️ Editar" : "📝 Capturar"}
                        </button>
                      ) : (
                        <button onClick={() => setModalRevision({ abierto: true, registro: { empleado, incidencia } })} className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs">
                          🔍 Validar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && registrosFiltrados.length === 0 && <tr><td colSpan={20} className="p-6 text-center text-gray-500">No hay resultados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CAPTURA SUPERVISOR */}
      {modalCaptura.abierto && modalCaptura.empleado && (
        <ModalCaptura
          empleado={modalCaptura.empleado}
          columnas={columnasSupervisor}
          guardando={guardando}
          onGuardar={guardarCapturaRapida}
          onCerrar={() => setModalCaptura({ abierto: false, empleado: null })}
        />
      )}

      {/* MODAL REVISIÓN RH */}
      {modalRevision.abierto && modalRevision.registro && (
        <ModalRevision
          registro={modalRevision.registro}
          columnas={columnasActivas}
          guardando={guardando}
          onGuardar={guardarRevision}
          onCerrar={() => setModalRevision({ abierto: false, registro: null })}
        />
      )}

      {/* MODAL PERMISOS */}
      {modalPermisos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">🔒 Permisos de Captura</h3>
                <p className="text-xs text-gray-500">Marca qué campos puede llenar el supervisor. Los demás son exclusivos de RH.</p>
              </div>
              <button onClick={() => setModalPermisos(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {columnasDelMapeo.map(col => (
                <label key={col.campo} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 cursor-pointer">
                  <input type="checkbox" checked={permisosSupervisor[col.campo] || false} onChange={e => setPermisosSupervisor(prev => ({ ...prev, [col.campo]: e.target.checked }))} className="w-5 h-5 text-amber-600 rounded" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-700 text-sm">{col.etiqueta}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{col.campo}</div>
                  </div>
                  {permisosSupervisor[col.campo] ? (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">👷 Supervisor</span>
                  ) : (
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-bold">🔒 Solo RH</span>
                  )}
                </label>
              ))}
              {columnasDelMapeo.length === 0 && <div className="text-center text-gray-500 py-8">No hay columnas mapeadas a incidencias.</div>}
            </div>
            <div className="pt-3 border-t flex justify-end gap-2">
              <button onClick={() => setModalPermisos(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
              <button onClick={guardarPermisos} disabled={guardandoPermisos} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-amber-300">
                {guardandoPermisos ? "Guardando..." : "💾 Guardar Permisos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIG COLUMNAS */}
      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold text-slate-800">⚙️ Columnas de Incidencias</h3><p className="text-xs text-gray-500">Arrastra para reordenar</p></div>
              <button onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {columnasDelMapeo.map(col => {
                const idx = ordenColumnas.indexOf(col.campo);
                return (
                  <div key={col.campo} draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', col.campo); e.currentTarget.classList.add('opacity-40'); }}
                    onDragEnd={(e) => { e.currentTarget.classList.remove('opacity-40', 'ring-2', 'ring-blue-400'); }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-400'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-400'); }}
                    onDrop={(e) => {
                      e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                      const campoArrastrado = e.dataTransfer.getData('text/plain');
                      if (campoArrastrado !== col.campo) {
                        setOrdenColumnas(prev => { const nuevo = prev.filter(c => c !== campoArrastrado); nuevo.splice(nuevo.indexOf(col.campo), 0, campoArrastrado); return nuevo; });
                      }
                    }}
                    className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 cursor-move">
                    <div className="text-slate-400 cursor-grab select-none">⋮⋮</div>
                    <div className="bg-slate-200 text-slate-700 text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">{idx + 1}</div>
                    <input type="checkbox" checked={columnasVisibles[col.campo] !== false} onChange={(e) => { e.stopPropagation(); cambiarVisibilidadColumna(col.campo); }} className="w-4 h-4 text-blue-600 rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-700 text-sm truncate flex items-center gap-2">
                        {col.etiqueta}
                        {col.permite_supervisor && <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">👷</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">📄 {col.original}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moverColumna(col.campo, 'arriba')} disabled={idx === 0} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↑</button>
                      <button onClick={() => moverColumna(col.campo, 'abajo')} disabled={idx === ordenColumnas.length - 1} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t flex justify-end"><button onClick={() => setModalConfigColumnas(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold">Aplicar</button></div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ================================
// MODAL CAPTURA SUPERVISOR (SIMPLIFICADO)
// ================================
function ModalCaptura({ empleado, columnas, guardando, onGuardar, onCerrar }) {
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(col => { init[col.campo] = empleado.incidencia?.[col.campo] ?? 0; });
    return init;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(empleado.id, valores); }} className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col">
        <div className="border-b pb-3 px-6 pt-5 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-blue-800">📝 Captura de Incidencias</h3>
            <p className="text-xs text-gray-500">
              <strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre} · {empleado.puestos?.nombre}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="text-gray-400 font-bold text-2xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {columnas.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-3">
              {columnas.map(col => (
                <div key={col.campo} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-blue-800 mb-1">{col.etiqueta}</label>
                  <input type="number" step="0.01" min="0" value={valores[col.campo] ?? 0} onChange={e => setValores(prev => ({ ...prev, [col.campo]: e.target.value }))} className="w-full border border-blue-300 p-2 rounded text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-center">
              ⚠️ RH no ha habilitado campos para captura. Solicita permisos.
            </div>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
          <button type="submit" disabled={guardando || columnas.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-blue-300">
            {guardando ? "Guardando..." : "📝 Enviar a RH"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ================================
// MODAL REVISIÓN RH (COMPLETO)
// ================================
function ModalRevision({ registro, columnas, guardando, onGuardar, onCerrar }) {
  const { empleado, incidencia } = registro;
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(col => { init[col.campo] = incidencia?.[col.campo] ?? 0; });
    return init;
  });
  const [estadoFinal, setEstadoFinal] = useState(incidencia?.estado || "pendiente");
  const [comentario, setComentario] = useState(incidencia?.comentarios_rrhh || "");

  const columnasSup = columnas.filter(c => c.permite_supervisor);
  const columnasRHOnly = columnas.filter(c => !c.permite_supervisor);

  // Cálculo de totales
  const totalSumas = columnas.filter(c => esCampoMonetario(c.campo) && !normalizar(c.campo).match(/descuento|deduccion|adeudo|falta|prestamo|infonavit|imss|sancion/))
    .reduce((acc, c) => acc + Number(valores[c.campo] || 0), 0);
  const totalRestas = columnas.filter(c => esCampoMonetario(c.campo) && normalizar(c.campo).match(/descuento|deduccion|adeudo|falta|prestamo|infonavit|imss|sancion/))
    .reduce((acc, c) => acc + Number(valores[c.campo] || 0), 0);
  const neto = totalSumas - totalRestas;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(incidencia?.id, valores, estadoFinal, comentario); }} className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl max-h-[95vh] flex flex-col">
        <div className="border-b pb-3 px-6 pt-5 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-purple-800">🔍 Validación de RH</h3>
            <p className="text-xs text-gray-500">
              <strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre} · {empleado.puestos?.nombre}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="text-gray-400 font-bold text-2xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Selector de estado */}
          <div className="grid grid-cols-3 gap-2">
            {["pendiente", "aprobado", "rechazado"].map(est => (
              <button key={est} type="button" onClick={() => setEstadoFinal(est)} className={`p-3 rounded-xl font-bold text-sm border-2 transition ${estadoFinal === est ? (est === "aprobado" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : est === "rechazado" ? "bg-red-100 border-red-500 text-red-800" : "bg-amber-100 border-amber-500 text-amber-800") : "bg-white border-slate-200 text-slate-500"}`}>
                {est === "pendiente" ? "⏳ Pendiente" : est === "aprobado" ? "✅ Aprobar" : "❌ Rechazar"}
              </button>
            ))}
          </div>

          {/* Datos del supervisor */}
          {columnasSup.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                👷 Propuesta del Supervisor ({columnasSup.length})
                <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-normal">Verifica con reloj checador</span>
              </h4>
              <div className="grid md:grid-cols-3 gap-3">
                {columnasSup.map(col => (
                  <div key={col.campo}>
                    <label className="block text-xs font-semibold text-blue-800 mb-1">{col.etiqueta}</label>
                    <input type="number" step="0.01" value={valores[col.campo] ?? 0} onChange={e => setValores(prev => ({ ...prev, [col.campo]: e.target.value }))} className="w-full border border-blue-300 p-2 rounded text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campos exclusivos RH */}
          {columnasRHOnly.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-900 mb-3">🔒 Exclusivos de RH ({columnasRHOnly.length})</h4>
              <div className="grid md:grid-cols-3 gap-3">
                {columnasRHOnly.map(col => (
                  <div key={col.campo}>
                    <label className="block text-xs font-semibold text-purple-800 mb-1">{col.etiqueta}</label>
                    <input type="number" step="0.01" value={valores[col.campo] ?? 0} onChange={e => setValores(prev => ({ ...prev, [col.campo]: e.target.value }))} className="w-full border border-purple-300 p-2 rounded text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comentario */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">💬 Observaciones de RH</label>
            <textarea rows="3" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: Ajustado según reloj checador..." className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        {/* Footer con totales */}
        <div className="border-t bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4">
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="text-center"><div className="text-xs text-slate-500 uppercase font-semibold">Percepciones</div><div className="text-xl font-bold text-emerald-600">+ ${totalSumas.toFixed(2)}</div></div>
            <div className="text-center border-x border-slate-300 px-4"><div className="text-xs text-slate-500 uppercase font-semibold">Deducciones</div><div className="text-xl font-bold text-red-600">- ${totalRestas.toFixed(2)}</div></div>
            <div className="text-center bg-white rounded-xl p-3 shadow-md border-2 border-purple-500"><div className="text-xs text-purple-600 uppercase font-bold">Neto</div><div className="text-2xl font-black text-purple-900">${neto.toFixed(2)}</div></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
            <button type="submit" disabled={guardando} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-purple-300">
              {guardando ? "Guardando..." : `💾 Guardar como ${estadoFinal.toUpperCase()}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}