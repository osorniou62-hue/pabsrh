import { useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";

const formatearNombreColumna = (texto) => String(texto || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
const normalizar = (texto) => String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const esCampoMonetario = (campo) => {
  const n = normalizar(campo);
  return ['valor', 'monto', 'bono', 'descuento', 'sueldo', 'pago', 'total', 'neto', 'apoyo', 'gratificacion', 'aguinaldo', 'ptu', 'infonavit', 'imss', 'saldo', 'deduccion', 'percepcion', 'prima', 'comision'].some(p => n.includes(p));
};
const esDeduccion = (campo) => /descuento|deduccion|adeudo|prestamo|infonavit|imss|sancion/.test(normalizar(campo));
const limpiarPayload = (payload) => {
  const limpio = { ...payload };
  ['id', 'created_at', 'updated_at', 'deleted_at'].forEach(k => delete limpio[k]);
  Object.keys(limpio).forEach(k => { if (limpio[k] === "" || limpio[k] === null || limpio[k] === undefined) delete limpio[k]; });
  return limpio;
};

const formatearValor = (valor, tipoDato) => {
  const num = Number(valor || 0);
  switch (tipoDato) {
    case 'dinero': return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    case 'horas': return `${num.toFixed(2)}h`;
    case 'porcentaje': return `${num.toFixed(2)}%`;
    case 'entero': default: return Math.round(num).toString();
  }
};

const ITEMS_POR_PAGINA = 50;

const rubrosIniciales = {
  bonos: { titulo: "Bonos", icono: "💰", color: "emerald", bgLight: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", tipo: "positivo", tipoDato: "dinero" },
  deducciones: { titulo: "Deducciones", icono: "💸", color: "red", bgLight: "bg-red-50", text: "text-red-700", border: "border-red-200", tipo: "negativo", tipoDato: "dinero" },
  aguinaldo: { titulo: "Aguinaldo/PTU", icono: "🎁", color: "amber", bgLight: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", tipo: "positivo", tipoDato: "dinero" },
  horas_extra: { titulo: "Horas Extra", icono: "⏰", color: "blue", bgLight: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", tipo: "positivo", tipoDato: "horas" },
  percepciones: { titulo: "Percepciones", icono: "💵", color: "indigo", bgLight: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", tipo: "positivo", tipoDato: "dinero" },
  otros: { titulo: "Otros", icono: "📋", color: "slate", bgLight: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", tipo: "neutro", tipoDato: "entero" },
};

const tiposDatoConfig = {
  entero: { label: "Número entero", icono: "🔢", ejemplo: "5" },
  horas: { label: "Horas", icono: "⏰", ejemplo: "5.50h" },
  dinero: { label: "Dinero ($)", icono: "💵", ejemplo: "$1,234.56" },
  porcentaje: { label: "Porcentaje (%)", icono: "%", ejemplo: "12.50%" },
};

const clasificarRubroInicial = (campo) => {
  const n = normalizar(campo);
  if (/bono|apoyo|gratificacion|comision|prima/.test(n)) return 'bonos';
  if (/descuento|deduccion|adeudo|prestamo|infonavit|imss|sancion|falta/.test(n)) return 'deducciones';
  if (/aguinaldo|ptu/.test(n)) return 'aguinaldo';
  if (/horas? ?extra|extras?/.test(n)) return 'horas_extra';
  if (/sueldo|salario|neto|total/.test(n)) return 'percepciones';
  return 'otros';
};

export default function Incidencias() {
  const [empleados, setEmpleados] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [loadingEmpleados, setLoadingEmpleados] = useState(true);
  const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  const [vistaActual, setVistaActual] = useState("supervisor");
  const [periodoId, setPeriodoId] = useState("");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("TODOS");
  const [puestoFiltro, setPuestoFiltro] = useState("TODOS");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [modalRubro, setModalRubro] = useState({ abierto: false, rubro: null });
  const [modalConfigRubros, setModalConfigRubros] = useState(false);
  const [rubrosPersonalizados, setRubrosPersonalizados] = useState(() => {
    try { const g = localStorage.getItem("rubros_personalizados"); return g ? JSON.parse(g) : {}; } catch { return {}; }
  });
  const [asignacionesColumnas, setAsignacionesColumnas] = useState(() => {
    try { const g = localStorage.getItem("asignaciones_columnas_rubros"); return g ? JSON.parse(g) : {}; } catch { return {}; }
  });
  const [tiposDatoColumnas, setTiposDatoColumnas] = useState(() => {
    try { const g = localStorage.getItem("tipos_dato_columnas"); return g ? JSON.parse(g) : {}; } catch { return {}; }
  });
  const [modalCaptura, setModalCaptura] = useState({ abierto: false, empleado: null });
  const [modalRevision, setModalRevision] = useState({ abierto: false, registro: null });
  const [modalPermisos, setModalPermisos] = useState(false);
  const [modalConfigColumnas, setModalConfigColumnas] = useState(false);
  const [permisosSupervisor, setPermisosSupervisor] = useState({});
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mostrarBotonArriba, setMostrarBotonArriba] = useState(false);
  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [ordenColumnas, setOrdenColumnas] = useState(() => {
    try { return JSON.parse(localStorage.getItem("incidencias_orden_columnas")) || []; } catch { return []; }
  });
  const [columnasVisibles, setColumnasVisibles] = useState(() => {
    try { return JSON.parse(localStorage.getItem("incidencias_columnas_visibles")) || {}; } catch { return {}; }
  });

  const todosLosRubros = useMemo(() => ({ ...rubrosIniciales, ...rubrosPersonalizados }), [rubrosPersonalizados]);

  const columnasDelMapeo = useMemo(() => {
    if (!configuracionMapeo?.asignacion) return [];
    const validas = [];
    Object.entries(configuracionMapeo.asignacion).forEach(([colOriginal, info]) => {
      if (info.tablaDestino === 'incidencias' && (info.campoDestino || info.campoManual)) {
        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
        if (campoFinal) {
          validas.push({
            original: colOriginal, campo: campoFinal,
            etiqueta: formatearNombreColumna(campoFinal),
            permite_supervisor: permisosSupervisor[campoFinal] || false,
            rubro: asignacionesColumnas[campoFinal] || clasificarRubroInicial(campoFinal),
          });
        }
      }
    });
    const unicas = new Map();
    validas.forEach(item => { if (!unicas.has(item.campo)) unicas.set(item.campo, item); });
    return Array.from(unicas.values());
  }, [configuracionMapeo, permisosSupervisor, asignacionesColumnas]);

  const columnasActivas = useMemo(() => {
    const visibles = columnasDelMapeo.filter(c => columnasVisibles[c.campo] !== false);
    return visibles.sort((a, b) => {
      const idxA = ordenColumnas.indexOf(a.campo);
      const idxB = ordenColumnas.indexOf(b.campo);
      return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
    });
  }, [columnasDelMapeo, columnasVisibles, ordenColumnas]);

  const columnasSupervisor = useMemo(() => columnasActivas.filter(c => c.permite_supervisor), [columnasActivas]);

  const columnasPorRubro = useMemo(() => {
    const agrupado = {};
    Object.keys(todosLosRubros).forEach(r => { agrupado[r] = []; });
    columnasActivas.forEach(col => {
      const rubro = col.rubro || 'otros';
      if (!agrupado[rubro]) agrupado[rubro] = [];
      agrupado[rubro].push(col);
    });
    Object.keys(agrupado).forEach(r => { if (agrupado[r].length === 0) delete agrupado[r]; });
    return agrupado;
  }, [columnasActivas, todosLosRubros]);

  const rubrosActivos = useMemo(() => Object.keys(columnasPorRubro).filter(r => columnasPorRubro[r].length > 0), [columnasPorRubro]);

  useEffect(() => {
    const cargarTodo = async () => {
      setLoadingEmpleados(true);
      try {
        const [resPeriodos, resPuestos, resDepts, resEmpleados, resConfig, resPermisos] = await Promise.all([
          supabase.from("periodos_nomina").select("*").order("fecha_inicio", { ascending: false }),
          supabase.from("puestos").select("*").order("nombre"),
          supabase.from("departamentos").select("*").order("nombre"),
          supabase.from("empleados").select("*").order("nombre_completo"),
          supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle(),
          supabase.from("configuracion_tablas").select("configuracion").eq("clave", "permisos_incidencias").maybeSingle(),
        ]);
        setPeriodos(resPeriodos.data || []);
        if (resPeriodos.data?.length > 0) setPeriodoId(resPeriodos.data[0].id);
        const puestosUnicos = new Map();
        (resPuestos.data || []).forEach(p => {
          const nombre = String(p.nombre || "").trim();
          if (nombre && !puestosUnicos.has(nombre.toLowerCase())) puestosUnicos.set(nombre.toLowerCase(), { ...p, nombre });
        });
        const empleadosProcesados = (resEmpleados.data || []).map(emp => {
          let deptoObj = emp.departamento_id ? (resDepts.data || []).find(d => d.id === emp.departamento_id) : null;
          if (!deptoObj && emp.departamento) deptoObj = { nombre: emp.departamento };
          let puestoObj = emp.puesto_id ? Array.from(puestosUnicos.values()).find(p => p.id === emp.puesto_id) : null;
          if (!puestoObj && emp.puesto) puestoObj = { nombre: emp.puesto };
          return { ...emp, departamentos: deptoObj, puestos: puestoObj };
        });
        setEmpleados(empleadosProcesados);
        if (resConfig.data?.configuracion) setConfiguracionMapeo(resConfig.data.configuracion);
        else { const local = localStorage.getItem("config_mapeo_columnas_dinamico"); if (local) setConfiguracionMapeo(JSON.parse(local)); }
        if (resPermisos.data?.configuracion) setPermisosSupervisor(resPermisos.data.configuracion);
        else { const local = localStorage.getItem("permisos_incidencias"); if (local) setPermisosSupervisor(JSON.parse(local)); }
      } catch (err) { console.error("❌ Error:", err); }
      finally { setLoadingEmpleados(false); }
    };
    cargarTodo();
  }, []);

  useEffect(() => {
    if (!periodoId) return;
    const cargar = async () => {
      setLoadingIncidencias(true);
      try {
        const { data, error } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
        if (error) throw error;
        setIncidencias(data || []);
      } catch (err) { console.error("Error:", err); setIncidencias([]); }
      finally { setLoadingIncidencias(false); }
    };
    cargar();
  }, [periodoId]);

  useEffect(() => {
    if (columnasDelMapeo.length > 0) {
      setColumnasVisibles(prev => { const n = { ...prev }; columnasDelMapeo.forEach(c => { if (n[c.campo] === undefined) n[c.campo] = true; }); return n; });
      setOrdenColumnas(prev => { const n = [...prev]; columnasDelMapeo.forEach(c => { if (!n.includes(c.campo)) n.push(c.campo); }); return n; });
    }
  }, [columnasDelMapeo]);

  useEffect(() => { localStorage.setItem("incidencias_columnas_visibles", JSON.stringify(columnasVisibles)); }, [columnasVisibles]);
  useEffect(() => { localStorage.setItem("incidencias_orden_columnas", JSON.stringify(ordenColumnas)); }, [ordenColumnas]);
  useEffect(() => { localStorage.setItem("rubros_personalizados", JSON.stringify(rubrosPersonalizados)); }, [rubrosPersonalizados]);
  useEffect(() => { localStorage.setItem("asignaciones_columnas_rubros", JSON.stringify(asignacionesColumnas)); }, [asignacionesColumnas]);
  useEffect(() => { localStorage.setItem("tipos_dato_columnas", JSON.stringify(tiposDatoColumnas)); }, [tiposDatoColumnas]);
  useEffect(() => { setPaginaActual(1); }, [busqueda, departamentoFiltro, puestoFiltro, estadoFiltro, periodoId]);
  useEffect(() => {
    const h = () => setMostrarBotonArriba(window.scrollY > 300);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const guardarPermisos = async () => {
    setGuardandoPermisos(true);
    try {
      await supabase.from("configuracion_tablas").upsert({ clave: "permisos_incidencias", configuracion: permisosSupervisor }, { onConflict: "clave" });
      localStorage.setItem("permisos_incidencias", JSON.stringify(permisosSupervisor));
      setModalPermisos(false);
    } catch (err) { alert("Error: " + err.message); }
    finally { setGuardandoPermisos(false); }
  };

  const guardarCapturaRapida = async (empleadoId, valores) => {
    setGuardando(true);
    try {
      const payload = limpiarPayload({ empleado_id: empleadoId, periodo_id: Number(periodoId), estado: "pendiente", ...valores });
      const { data: existente } = await supabase.from("incidencias").select("id").eq("empleado_id", empleadoId).eq("periodo_id", periodoId).maybeSingle();
      let error;
      if (existente) { const { error: e } = await supabase.from("incidencias").update(payload).eq("id", existente.id); error = e; }
      else { const { error: e } = await supabase.from("incidencias").insert([payload]); error = e; }
      if (error) throw error;
      setModalCaptura({ abierto: false, empleado: null });
      const { data } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
      setIncidencias(data || []);
    } catch (err) { alert("Error: " + err.message); }
    finally { setGuardando(false); }
  };

  const guardarRevision = async (incidenciaId, valores, estado, comentario) => {
    setGuardando(true);
    try {
      const payload = limpiarPayload({ ...valores, estado, comentarios_rrhh: comentario || null, fecha_revision: new Date().toISOString() });
      const { error } = await supabase.from("incidencias").update(payload).eq("id", incidenciaId);
      if (error) throw error;
      setModalRevision({ abierto: false, registro: null });
      const { data } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
      setIncidencias(data || []);
    } catch (err) { alert("Error: " + err.message); }
    finally { setGuardando(false); }
  };

  const guardarAjustesRubro = async (rubro, ajustes) => {
    setGuardando(true);
    try {
      let errores = 0;
      for (const a of ajustes) {
        const { error } = await supabase.from("incidencias").update(a.valores).eq("id", a.incidenciaId);
        if (error) errores++;
      }
      alert(errores > 0 ? `⚠️ ${errores} errores` : `✅ ${ajustes.length} ajustes guardados`);
      const { data } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
      setIncidencias(data || []);
      setModalRubro({ abierto: false, rubro: null });
    } catch (err) { alert("Error: " + err.message); }
    finally { setGuardando(false); }
  };

  const cambiarVisibilidadColumna = (campo) => setColumnasVisibles(prev => ({ ...prev, [campo]: !prev[campo] }));
  const moverColumna = (campo, direccion) => {
    setOrdenColumnas(prev => {
      const idx = prev.indexOf(campo);
      if (idx === -1) return prev;
      const n = [...prev];
      if (direccion === 'arriba' && idx > 0) [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      else if (direccion === 'abajo' && idx < prev.length - 1) [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      return n;
    });
  };

  const registros = useMemo(() => {
    return empleados.map(emp => ({ empleado: emp, incidencia: incidencias.find(i => i.empleado_id === emp.id) || null }))
      .sort((a, b) => {
        const dA = (a.empleado.departamentos?.nombre || "Sin Departamento").toLowerCase();
        const dB = (b.empleado.departamentos?.nombre || "Sin Departamento").toLowerCase();
        if (dA !== dB) return dA.localeCompare(dB);
        const pA = (a.empleado.puestos?.nombre || "Sin Puesto").toLowerCase();
        const pB = (b.empleado.puestos?.nombre || "Sin Puesto").toLowerCase();
        if (pA !== pB) return pA.localeCompare(pB);
        return (a.empleado.nombre_completo || "").localeCompare(b.empleado.nombre_completo || "");
      });
  }, [empleados, incidencias]);

  const registrosFiltrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return registros.filter(r => {
      const emp = r.empleado;
      const coincide = [emp.nombre_completo, emp.numero_empleado, emp.departamentos?.nombre, emp.puestos?.nombre].some(c => String(c || "").toLowerCase().includes(texto));
      const cDepto = departamentoFiltro === "TODOS" || (emp.departamentos?.nombre || "Sin Departamento") === departamentoFiltro;
      const cPuesto = puestoFiltro === "TODOS" || (emp.puestos?.nombre || "Sin Puesto") === puestoFiltro;
      const estado = r.incidencia?.estado || "sin_captura";
      const cEstado = estadoFiltro === "TODOS" || estado === estadoFiltro;
      return coincide && cDepto && cPuesto && cEstado;
    });
  }, [registros, busqueda, departamentoFiltro, puestoFiltro, estadoFiltro]);

  const totalesPorRubro = useMemo(() => {
    const t = {};
    rubrosActivos.forEach(r => {
      const cols = columnasPorRubro[r];
      t[r] = registrosFiltrados.reduce((acc, reg) => {
        if (!reg.incidencia) return acc;
        return acc + cols.reduce((s, c) => s + Number(reg.incidencia[c.campo] || 0), 0);
      }, 0);
    });
    return t;
  }, [registrosFiltrados, columnasPorRubro, rubrosActivos]);

  const totalPaginas = Math.ceil(registrosFiltrados.length / ITEMS_POR_PAGINA);
  const registrosPaginados = useMemo(() => {
    const i = (paginaActual - 1) * ITEMS_POR_PAGINA;
    return registrosFiltrados.slice(i, i + ITEMS_POR_PAGINA);
  }, [registrosFiltrados, paginaActual]);

  const registrosConSeparadores = useMemo(() => {
    const resultado = [];
    registrosPaginados.forEach((r, i) => {
      const ant = i > 0 ? registrosPaginados[i - 1] : null;
      const dA = r.empleado.departamentos?.nombre || "Sin Departamento";
      const pA = r.empleado.puestos?.nombre || "Sin Puesto";
      const mostrarHeaderDepto = !ant || (ant.empleado.departamentos?.nombre || "Sin Departamento") !== dA;
      const mostrarHeaderPuesto = !ant || (ant.empleado.departamentos?.nombre || "Sin Departamento") !== dA || (ant.empleado.puestos?.nombre || "Sin Puesto") !== pA;
      
      if (mostrarHeaderDepto) {
        const countDepto = empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === dA).length;
        resultado.push({ tipo: 'header_depto', deptoActual: dA, count: countDepto, key: `depto-${i}` });
      }
      if (mostrarHeaderPuesto) {
        const countPuesto = empleados.filter(e => 
          (e.departamentos?.nombre || "Sin Departamento") === dA && 
          (e.puestos?.nombre || "Sin Puesto") === pA
        ).length;
        resultado.push({ tipo: 'header_puesto', deptoActual: dA, puestoActual: pA, count: countPuesto, key: `puesto-${i}` });
      }
      resultado.push({ tipo: 'empleado', data: r, key: `emp-${r.empleado.id}` });
    });
    return resultado;
  }, [registrosPaginados, empleados]);

  const kpis = useMemo(() => {
    const t = empleados.length;
    const c = incidencias.length;
    return {
      total: t, conCaptura: c, sinCaptura: t - c,
      pendientes: incidencias.filter(i => i.estado === "pendiente").length,
      aprobados: incidencias.filter(i => i.estado === "aprobado").length,
      rechazados: incidencias.filter(i => i.estado === "rechazado").length,
    };
  }, [empleados, incidencias]);

  const conteoPorDepto = useMemo(() => {
    const c = {};
    empleados.forEach(e => { const d = e.departamentos?.nombre || "Sin Departamento"; c[d] = (c[d] || 0) + 1; });
    return c;
  }, [empleados]);

  const conteoPorPuesto = useMemo(() => {
    const c = {};
    const emp = departamentoFiltro === "TODOS" ? empleados : empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === departamentoFiltro);
    emp.forEach(e => { const p = e.puestos?.nombre || "Sin Puesto"; c[p] = (c[p] || 0) + 1; });
    return c;
  }, [empleados, departamentoFiltro]);

  const departamentosUnicos = ["TODOS", ...new Set(empleados.map(e => e?.departamentos?.nombre || "Sin Departamento"))].sort();
  const puestosUnicosFiltrados = useMemo(() => {
    const emp = departamentoFiltro === "TODOS" ? empleados : empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === departamentoFiltro);
    return ["TODOS", ...new Set(emp.map(e => e?.puestos?.nombre || "Sin Puesto"))].sort();
  }, [empleados, departamentoFiltro]);

  const periodoActual = periodos.find(p => p.id === periodoId);
  const abrirRubro = (r) => setModalRubro({ abierto: true, rubro: r });

  return (
    <Layout>
      <div className={pantallaCompleta ? "fixed inset-0 z-50 bg-white overflow-auto p-6" : "space-y-6"}>
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="relative">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">⚡</div>
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">Incidencias</h1>
                <p className="text-white/80 text-sm mt-1">Gestión de nómina con validación en dos niveles</p>
              </div>
              {pantallaCompleta && (
                <button onClick={() => setPantallaCompleta(false)} className="bg-white text-indigo-700 px-4 py-2.5 rounded-xl font-semibold text-sm flex-shrink-0">✕ Salir</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-3 border-t border-white/20">
              <button onClick={() => setModalPermisos(true)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 border border-white/20 transition">🔒 Permisos</button>
              <button onClick={() => setModalConfigColumnas(true)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 border border-white/20 transition">⚙️ Columnas</button>
              <button onClick={() => setModalConfigRubros(true)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 border border-white/20 transition">🏷️ Rubros</button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">📅</div>
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase">Período de Nómina</div>
                <div className="text-sm font-bold text-slate-800">Selecciona el período activo</div>
              </div>
            </div>
            <select value={periodoId} onChange={e => setPeriodoId(e.target.value)} className="flex-1 border-2 border-slate-200 rounded-xl p-3 bg-slate-50 font-semibold outline-none">
              {periodos.map(p => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
            </select>
            {periodoActual && (
              <div className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-medium">
                📆 {new Date(periodoActual.fecha_inicio).toLocaleDateString('es-MX')} - {new Date(periodoActual.fecha_fin).toLocaleDateString('es-MX')}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiModerno titulo="Empleados" valor={kpis.total} icono="👥" color="blue" />
          <KpiModerno titulo="Con Captura" valor={kpis.conCaptura} icono="📝" color="indigo" />
          <KpiModerno titulo="Sin Captura" valor={kpis.sinCaptura} icono="⚠️" color="gray" />
          <KpiModerno titulo="Pendientes" valor={kpis.pendientes} icono="⏳" color="amber" />
          <KpiModerno titulo="Aprobados" valor={kpis.aprobados} icono="✅" color="emerald" />
          <KpiModerno titulo="Rechazados" valor={kpis.rechazados} icono="❌" color="red" />
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setVistaActual("supervisor")} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 ${vistaActual === "supervisor" ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>👷 Supervisor</button>
            <button onClick={() => setVistaActual("rrhh")} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 ${vistaActual === "rrhh" ? "bg-purple-600 text-white border-purple-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"}`}>🔍 Recursos Humanos</button>
          </div>

          {vistaActual === "rrhh" && rubrosActivos.length > 0 && (
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700">💼 Gestión por Rubro</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {rubrosActivos.map(r => {
                  const cfg = todosLosRubros[r];
                  return (
                    <button key={r} onClick={() => abrirRubro(r)} className={`${cfg.bgLight} hover:shadow-md border-2 ${cfg.border} rounded-xl px-4 py-2.5 text-left flex items-center gap-3`}>
                      <span className="text-2xl">{cfg.icono}</span>
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                          {cfg.titulo}
                          <span className="text-[8px] bg-white/60 px-1 rounded">{tiposDatoConfig[cfg.tipoDato || 'entero']?.icono}</span>
                        </div>
                        <div className={`text-lg font-black ${cfg.text}`}>{formatearValor(totalesPorRubro[r] || 0, cfg.tipoDato || 'entero')}</div>
                        <div className="text-[9px] text-slate-400">{columnasPorRubro[r].length} campos</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Buscar empleado..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="TODOS">📊 Todos los estados</option>
              <option value="sin_captura">⚠️ Sin captura</option>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="aprobado">✅ Aprobado</option>
              <option value="rechazado">❌ Rechazado</option>
            </select>
            <div className="flex items-center justify-end bg-slate-50 rounded-xl px-4 py-2.5">
              <span className="text-sm text-slate-600"><strong>{registrosFiltrados.length}</strong> de <strong>{empleados.length}</strong></span>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
              🏢 Filtrar por Departamento
              {(departamentoFiltro !== "TODOS" || puestoFiltro !== "TODOS") && (
                <button onClick={() => { setDepartamentoFiltro("TODOS"); setPuestoFiltro("TODOS"); }} className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">✕ Limpiar</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {departamentosUnicos.map(d => {
                const count = d === "TODOS" ? empleados.length : (conteoPorDepto[d] || 0);
                const activo = departamentoFiltro === d;
                return (
                  <button key={d} onClick={() => { setDepartamentoFiltro(d); setPuestoFiltro("TODOS"); }} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${activo ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"}`}>
                    {d === "TODOS" ? "🌐 Todos" : d}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {departamentoFiltro !== "TODOS" && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase mb-2">💼 Puesto en <span className="text-indigo-600">{departamentoFiltro}</span></div>
              <div className="flex flex-wrap gap-2">
                {puestosUnicosFiltrados.map(p => {
                  const count = p === "TODOS" ? conteoPorDepto[departamentoFiltro] || 0 : (conteoPorPuesto[p] || 0);
                  const activo = puestoFiltro === p;
                  return (
                    <button key={p} onClick={() => setPuestoFiltro(p)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${activo ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"}`}>
                      {p === "TODOS" ? "🌐 Todos" : p}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col ${pantallaCompleta ? "h-[calc(100vh-120px)]" : "max-h-[75vh]"}`}>
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-slate-800 text-sm">📋 Registros del Período</h3>
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">{registrosFiltrados.length} empleados</span>
            </div>
            <button onClick={() => setPantallaCompleta(!pantallaCompleta)} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
              {pantallaCompleta ? "🗗 Minimizar" : "⛶ Pantalla Completa"}
            </button>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
                <tr>
                  <th className="p-4 font-bold text-slate-700 sticky left-0 bg-slate-50 z-40 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">No.</th>
                  <th className="p-4 font-bold text-slate-700">Colaborador</th>
                  <th className="p-4 font-bold text-slate-700">🏢 Depto</th>
                  <th className="p-4 font-bold text-slate-700">💼 Puesto</th>
                  <th className="p-4 font-bold text-slate-700">Estado</th>
                  {rubrosActivos.map(r => {
                    const cfg = todosLosRubros[r];
                    return (
                      <th key={r} className={`p-4 text-right font-bold ${cfg.bgLight} ${cfg.text}`}>
                        <button onClick={() => vistaActual === "rrhh" && abrirRubro(r)} className={`flex items-center justify-end gap-1 w-full ${vistaActual === "rrhh" ? 'cursor-pointer hover:underline' : 'cursor-default'}`}>
                          <span>{cfg.icono}</span>
                          <span>{cfg.titulo}</span>
                          {vistaActual === "rrhh" && <span className="text-[9px]">⚙️</span>}
                        </button>
                      </th>
                    );
                  })}
                  {vistaActual === "rrhh" && <th className="p-4 font-bold text-slate-700">💬 Obs.</th>}
                  <th className="p-4 font-bold text-slate-700 text-center sticky right-0 bg-slate-50 z-40 border-l border-slate-200 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loadingEmpleados ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Array.from({ length: 8 }).map((_, j) => (<td key={j} className="p-4"><div className="h-4 bg-slate-200 rounded animate-pulse"></div></td>))}
                    </tr>
                  ))
                ) : registrosConSeparadores.length === 0 ? (
                  <tr><td colSpan={20} className="p-12 text-center"><div className="text-6xl mb-3">📭</div><div className="text-slate-500 font-semibold">No hay resultados</div></td></tr>
                ) : (
                  registrosConSeparadores.map((item) => {
                    if (item.tipo === 'header_depto') {
                      return (
                        <tr key={item.key} className="bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-[57px] z-20">
                          <td colSpan={20} className="px-4 py-2.5 font-bold text-sm flex items-center gap-2">
                            🏢 <span className="uppercase tracking-wide">{item.deptoActual}</span>
                            <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">{item.count} empleados</span>
                          </td>
                        </tr>
                      );
                    }
                    if (item.tipo === 'header_puesto') {
                      return (
                        <tr key={item.key} className="bg-slate-100 border-b border-slate-300">
                          <td colSpan={20} className="px-6 py-1.5 text-xs font-bold text-slate-600 uppercase flex items-center gap-2">
                            💼 {item.puestoActual}
                            <span className="ml-auto text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{item.count}</span>
                          </td>
                        </tr>
                      );
                    }
                    
                    const { empleado, incidencia } = item.data;
                    const estado = incidencia?.estado || "sin_captura";
                    const estCfg = {
                      sin_captura: { color: "bg-slate-100 text-slate-600", icono: "⚠️", label: "Sin captura" },
                      pendiente: { color: "bg-amber-100 text-amber-800", icono: "⏳", label: "Pendiente" },
                      aprobado: { color: "bg-emerald-100 text-emerald-800", icono: "✅", label: "Aprobado" },
                      rechazado: { color: "bg-red-100 text-red-800", icono: "❌", label: "Rechazado" },
                    }[estado];

                    return (
                      <tr key={item.key} className={`group border-b border-slate-100 hover:bg-slate-50 ${estado === "rechazado" ? "bg-red-50/30" : ""}`}>
                        <td className="p-4 font-mono text-slate-600 sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">{empleado.numero_empleado || "S/N"}</td>
                        <td className="p-4"><div className="font-semibold text-slate-800">{empleado.nombre_completo || "Sin nombre"}</div></td>
                        <td className="p-4 text-slate-600"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{empleado.departamentos?.nombre || "Sin Departamento"}</span></td>
                        <td className="p-4 text-slate-600"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{empleado.puestos?.nombre || "Sin Puesto"}</span></td>
                        <td className="p-4"><span className={`${estCfg.color} px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1`}>{estCfg.icono} {estCfg.label}</span></td>
                        {rubrosActivos.map(r => {
                          const cfg = todosLosRubros[r];
                          const cols = columnasPorRubro[r];
                          const total = incidencia ? cols.reduce((s, c) => s + Number(incidencia[c.campo] || 0), 0) : 0;
                          const tipoDatoRubro = cfg.tipoDato || 'entero';
                          return <td key={r} className={`p-4 text-right font-bold ${cfg.text}`}>{incidencia ? formatearValor(total, tipoDatoRubro) : <span className="text-slate-300">—</span>}</td>;
                        })}
                        {vistaActual === "rrhh" && (
                          <td className="p-4 max-w-[150px]"><div className="truncate text-[11px] text-slate-600">{incidencia?.comentarios_rrhh || <span className="text-slate-300">—</span>}</div></td>
                        )}
                        <td className="p-4 sticky right-0 bg-white group-hover:bg-slate-50 z-20 border-l border-slate-200 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]">
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
                  })
                )}
              </tbody>
              {rubrosActivos.length > 0 && registrosFiltrados.length > 0 && (
                <tfoot className="bg-slate-800 text-white sticky bottom-0 z-20 border-t-2 border-slate-600">
                  <tr>
                    <td colSpan={5} className="p-3 font-bold text-sm text-right">TOTALES ({registrosFiltrados.length})</td>
                    {rubrosActivos.map(r => {
                      const cfg = todosLosRubros[r];
                      return (<td key={r} className="p-3 text-right font-bold text-yellow-300">{formatearValor(totalesPorRubro[r] || 0, cfg.tipoDato || 'entero')}</td>);
                    })}
                    {vistaActual === "rrhh" && <td></td>}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50 sticky bottom-0 z-30">
              <div className="text-xs text-slate-600">Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong></div>
              <div className="flex gap-1">
                <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
                <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Siguiente →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarBotonArriba && !pantallaCompleta && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="fixed bottom-6 right-6 bg-slate-800 hover:bg-slate-900 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl z-40 opacity-80 hover:opacity-100 hover:scale-110" title="Volver arriba">↑</button>
      )}

      {modalConfigRubros && (
        <ModalConfigRubros
          todosLosRubros={todosLosRubros}
          rubrosPersonalizados={rubrosPersonalizados}
          setRubrosPersonalizados={setRubrosPersonalizados}
          columnasDelMapeo={columnasDelMapeo}
          asignacionesColumnas={asignacionesColumnas}
          setAsignacionesColumnas={setAsignacionesColumnas}
          tiposDatoColumnas={tiposDatoColumnas}
          setTiposDatoColumnas={setTiposDatoColumnas}
          onCerrar={() => setModalConfigRubros(false)}
        />
      )}

      {modalRubro.abierto && modalRubro.rubro && (
        <ModalRubro
          rubro={modalRubro.rubro}
          config={todosLosRubros[modalRubro.rubro]}
          columnas={columnasPorRubro[modalRubro.rubro]}
          registros={registros}
          todosLosEmpleados={empleados}
          guardando={guardando}
          tiposDatoColumnas={tiposDatoColumnas}
          onGuardar={(ajustes) => guardarAjustesRubro(modalRubro.rubro, ajustes)}
          onCerrar={() => setModalRubro({ abierto: false, rubro: null })}
        />
      )}

      {modalCaptura.abierto && modalCaptura.empleado && (
        <ModalCaptura empleado={modalCaptura.empleado} columnas={columnasSupervisor} guardando={guardando} onGuardar={guardarCapturaRapida} onCerrar={() => setModalCaptura({ abierto: false, empleado: null })} />
      )}

      {modalRevision.abierto && modalRevision.registro && (
        <ModalRevision registro={modalRevision.registro} columnas={columnasActivas} guardando={guardando} onGuardar={guardarRevision} onCerrar={() => setModalRevision({ abierto: false, registro: null })} />
      )}

      {modalPermisos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold">🔒 Permisos de Captura</h3><p className="text-xs text-gray-500">Marca qué campos puede llenar el supervisor</p></div>
              <button onClick={() => setModalPermisos(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {columnasDelMapeo.map(col => (
                <label key={col.campo} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 cursor-pointer">
                  <input type="checkbox" checked={permisosSupervisor[col.campo] || false} onChange={e => setPermisosSupervisor(prev => ({ ...prev, [col.campo]: e.target.checked }))} className="w-5 h-5 text-amber-600 rounded" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-700 text-sm">{col.etiqueta}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{col.campo}</div>
                  </div>
                  {permisosSupervisor[col.campo] ? <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">👷 Supervisor</span> : <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-bold">🔒 Solo RH</span>}
                </label>
              ))}
            </div>
            <div className="pt-3 border-t flex justify-end gap-2">
              <button onClick={() => setModalPermisos(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
              <button onClick={guardarPermisos} disabled={guardandoPermisos} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-amber-300">
                {guardandoPermisos ? "Guardando..." : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold">⚙️ Columnas de Incidencias</h3></div>
              <button onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {columnasDelMapeo.map(col => {
                const idx = ordenColumnas.indexOf(col.campo);
                return (
                  <div key={col.campo} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100">
                    <div className="bg-slate-200 text-slate-700 text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">{idx + 1}</div>
                    <input type="checkbox" checked={columnasVisibles[col.campo] !== false} onChange={() => cambiarVisibilidadColumna(col.campo)} className="w-4 h-4 text-blue-600 rounded" />
                    <div className="flex-1">
                      <div className="font-semibold text-slate-700 text-sm">{col.etiqueta}</div>
                      <div className="text-[10px] text-slate-500">📄 {col.original}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moverColumna(col.campo, 'arriba')} disabled={idx === 0} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↑</button>
                      <button onClick={() => moverColumna(col.campo, 'abajo')} disabled={idx === ordenColumnas.length - 1} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t flex justify-end">
              <button onClick={() => setModalConfigColumnas(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold">Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// 🔥 MODAL RUBRO RE DISEÑADO: Más compacto, con pantalla completa y mejor navegación
function ModalRubro({ rubro, config, columnas, registros, todosLosEmpleados, guardando, tiposDatoColumnas, onGuardar, onCerrar }) {
  const [filtroDepto, setFiltroDepto] = useState("TODOS");
  const [filtroPuesto, setFiltroPuesto] = useState("TODOS");
  const [busquedaInt, setBusquedaInt] = useState("");
  const [vistaComparativa, setVistaComparativa] = useState(false);
  const [pantallaCompletaModal, setPantallaCompletaModal] = useState(false);
  const [filtrosColapsados, setFiltrosColapsados] = useState(false);
  const tipoDatoRubro = config.tipoDato || 'entero';
  
  const [valoresRH, setValoresRH] = useState(() => {
    const init = {};
    registros.forEach(r => {
      if (r.incidencia) {
        init[r.empleado.id] = {};
        columnas.forEach(c => { init[r.empleado.id][c.campo] = r.incidencia[c.campo] ?? 0; });
      }
    });
    return init;
  });

  const deptosUnicos = useMemo(() => ["TODOS", ...new Set(todosLosEmpleados.map(e => e.departamentos?.nombre || "Sin Departamento"))].sort(), [todosLosEmpleados]);
  const puestosUnicos = useMemo(() => {
    const emp = filtroDepto === "TODOS" ? todosLosEmpleados : todosLosEmpleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === filtroDepto);
    return ["TODOS", ...new Set(emp.map(e => e.puestos?.nombre || "Sin Puesto"))].sort();
  }, [todosLosEmpleados, filtroDepto]);

  const regsFiltrados = useMemo(() => {
    const t = busquedaInt.toLowerCase().trim();
    return registros.filter(r => {
      const e = r.empleado;
      const ct = !t || [e.nombre_completo, e.numero_empleado, e.puestos?.nombre].some(c => String(c || "").toLowerCase().includes(t));
      const cd = filtroDepto === "TODOS" || (e.departamentos?.nombre || "Sin Departamento") === filtroDepto;
      const cp = filtroPuesto === "TODOS" || (e.puestos?.nombre || "Sin Puesto") === filtroPuesto;
      return ct && cd && cp;
    });
  }, [registros, filtroDepto, filtroPuesto, busquedaInt]);

  const totalesComparativos = useMemo(() => {
    const sup = {}, rh = {}, diff = {};
    let totalSup = 0, totalRh = 0;
    columnas.forEach(c => { sup[c.campo] = 0; rh[c.campo] = 0; diff[c.campo] = 0; });
    regsFiltrados.forEach(r => {
      if (r.incidencia) {
        columnas.forEach(c => {
          const vSup = Number(r.incidencia[c.campo] || 0);
          const vRH = Number(valoresRH[r.empleado.id]?.[c.campo] || 0);
          sup[c.campo] += vSup; rh[c.campo] += vRH; diff[c.campo] += (vRH - vSup);
          totalSup += vSup; totalRh += vRH;
        });
      }
    });
    return { sup, rh, diff, totalSup, totalRh, diffTotal: totalRh - totalSup };
  }, [valoresRH, columnas, regsFiltrados]);

  const conteoDiferencias = useMemo(() => {
    const conteo = { conDif: 0, sinDif: 0, sinCaptura: 0 };
    regsFiltrados.forEach(r => {
      if (!r.incidencia) { conteo.sinCaptura++; return; }
      const tieneDif = columnas.some(c => {
        const vSup = Number(r.incidencia[c.campo] || 0);
        const vRH = Number(valoresRH[r.empleado.id]?.[c.campo] || 0);
        return vSup !== vRH;
      });
      if (tieneDif) conteo.conDif++; else conteo.sinDif++;
    });
    return conteo;
  }, [regsFiltrados, columnas, valoresRH]);

  const guardar = () => {
    const ajustes = regsFiltrados.filter(r => r.incidencia).map(r => ({ incidenciaId: r.incidencia.id, valores: valoresRH[r.empleado.id] || {} }));
    if (ajustes.length === 0) { alert("No hay registros"); return; }
    if (!confirm(`¿Guardar ${ajustes.length} ajustes?`)) return;
    onGuardar(ajustes);
  };

  const aplicarTodos = (campo, valor) => {
    const nv = { ...valoresRH };
    regsFiltrados.forEach(r => {
      if (r.incidencia) nv[r.empleado.id] = { ...nv[r.empleado.id], [campo]: valor };
    });
    setValoresRH(nv);
  };

  const aceptarSupervisorTodos = (campo) => {
    const nv = { ...valoresRH };
    regsFiltrados.forEach(r => {
      if (r.incidencia) {
        const vSup = Number(r.incidencia[campo] || 0);
        nv[r.empleado.id] = { ...nv[r.empleado.id], [campo]: vSup };
      }
    });
    setValoresRH(nv);
  };

  // 🔥 Layout dinámico según pantalla completa
  const contenedorClase = pantallaCompletaModal
    ? "fixed inset-0 bg-white z-50 flex flex-col"
    : "fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm";
  
  const modalClase = pantallaCompletaModal
    ? "w-full h-full flex flex-col"
    : "bg-white rounded-2xl shadow-2xl max-w-[95vw] w-full max-h-[95vh] flex flex-col";

  return (
    <div className={contenedorClase}>
      <div className={modalClase}>
        {/* 🔥 HEADER COMPACTO */}
        <div className={`${config.bgLight} border-b ${config.border} px-4 py-3 flex-shrink-0`}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-3xl flex-shrink-0">{config.icono}</span>
              <div className="min-w-0">
                <h3 className={`text-lg font-bold ${config.text} truncate`}>
                  {config.titulo}
                  <span className="text-xs bg-white/60 px-2 py-0.5 rounded font-normal ml-2">
                    {tiposDatoConfig[tipoDatoRubro]?.icono} {tiposDatoConfig[tipoDatoRubro]?.label}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {regsFiltrados.filter(r => r.incidencia).length} empleados · {columnas.length} columnas
                  {conteoDiferencias.conDif > 0 && (
                    <span className="ml-2 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">⚡ {conteoDiferencias.conDif} con ajustes</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 🔥 NUEVO: Botones de control */}
              <button
                onClick={() => setFiltrosColapsados(!filtrosColapsados)}
                className="bg-white/70 hover:bg-white text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200"
                title={filtrosColapsados ? "Mostrar filtros" : "Ocultar filtros"}
              >
                {filtrosColapsados ? "🔽" : "🔼"}
              </button>
              <button
                onClick={() => setVistaComparativa(!vistaComparativa)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  vistaComparativa ? 'bg-slate-800 text-white border-slate-800' : 'bg-white/70 hover:bg-white text-slate-700 border-slate-200'
                }`}
                title="Vista comparativa Supervisor vs RH"
              >
                👁️ {vistaComparativa ? "Ocultar" : "Comparar"}
              </button>
              <button
                onClick={() => setPantallaCompletaModal(!pantallaCompletaModal)}
                className="bg-white/70 hover:bg-white text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200"
                title={pantallaCompletaModal ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {pantallaCompletaModal ? "🗗" : "⛶"}
              </button>
              <button onClick={onCerrar} className="bg-white/70 hover:bg-white text-slate-700 w-8 h-8 rounded-lg font-bold flex items-center justify-center border border-slate-200">✕</button>
            </div>
          </div>

          {/* 🔥 PANEL RESUMEN COMPACTO (4 tarjetas pequeñas en línea) */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="bg-white/70 rounded-lg px-3 py-2 border border-white">
              <div className="text-[9px] text-slate-600 font-semibold uppercase">👷 Supervisor</div>
              <div className="text-sm font-black text-blue-700 truncate">{formatearValor(totalesComparativos.totalSup, tipoDatoRubro)}</div>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2 border border-white">
              <div className="text-[9px] text-slate-600 font-semibold uppercase">🔍 RH</div>
              <div className="text-sm font-black text-purple-700 truncate">{formatearValor(totalesComparativos.totalRh, tipoDatoRubro)}</div>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2 border border-white">
              <div className="text-[9px] text-slate-600 font-semibold uppercase">📊 Diferencia</div>
              <div className={`text-sm font-black truncate ${totalesComparativos.diffTotal > 0 ? 'text-emerald-700' : totalesComparativos.diffTotal < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                {totalesComparativos.diffTotal > 0 ? '+' : ''}{formatearValor(totalesComparativos.diffTotal, tipoDatoRubro)}
              </div>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2 border border-white">
              <div className="text-[9px] text-slate-600 font-semibold uppercase">📈 Estado</div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-1 truncate">
                {conteoDiferencias.sinCaptura > 0 ? (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">{conteoDiferencias.sinCaptura} sin captura</span>
                ) : conteoDiferencias.conDif === 0 ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">✓ Todo OK</span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">⚡ {conteoDiferencias.conDif} ajustes</span>
                )}
              </div>
            </div>
          </div>

          {/* 🔥 FILTROS (colapsables) */}
          {!filtrosColapsados && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                <input 
                  type="text" 
                  placeholder="Buscar empleado..." 
                  value={busquedaInt} 
                  onChange={(e) => setBusquedaInt(e.target.value)} 
                  className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-bold text-slate-500 self-center mr-1">🏢</span>
                {deptosUnicos.slice(0, 8).map(d => {
                  const count = d === "TODOS" ? regsFiltrados.length : regsFiltrados.filter(r => r.incidencia && (r.empleado.departamentos?.nombre || "Sin Departamento") === d).length;
                  const activo = filtroDepto === d;
                  return (
                    <button key={d} onClick={() => { setFiltroDepto(d); setFiltroPuesto("TODOS"); }} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${activo ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"}`}>
                      {d === "TODOS" ? "Todos" : d} <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                    </button>
                  );
                })}
                {deptosUnicos.length > 8 && <span className="text-[10px] text-slate-400 self-center">+{deptosUnicos.length - 8} más</span>}
              </div>
              {filtroDepto !== "TODOS" && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] font-bold text-slate-500 self-center mr-1">💼</span>
                  {puestosUnicos.slice(0, 10).map(p => {
                    const count = p === "TODOS" ? regsFiltrados.filter(r => r.incidencia && (r.empleado.departamentos?.nombre || "Sin Departamento") === filtroDepto).length : regsFiltrados.filter(r => r.incidencia && (r.empleado.departamentos?.nombre || "Sin Departamento") === filtroDepto && (r.empleado.puestos?.nombre || "Sin Puesto") === p).length;
                    const activo = filtroPuesto === p;
                    return (
                      <button key={p} onClick={() => setFiltroPuesto(p)} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${activo ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"}`}>
                        {p === "TODOS" ? "Todos" : p} <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🔥 TABLA CON MEJOR VISIBILIDAD */}
        <div className="flex-1 overflow-auto bg-white">
          {regsFiltrados.filter(r => r.incidencia).length === 0 ? (
            <div className="p-12 text-center"><div className="text-6xl mb-3">📭</div><div className="text-slate-500 font-semibold">Sin registros en este filtro</div></div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-200 sticky top-0 z-10 shadow-md">
                <tr>
                  <th className="p-2 text-left font-bold text-slate-800 sticky left-0 bg-slate-200 z-20 border-b-2 border-slate-400 min-w-[140px]">Empleado</th>
                  <th className="p-2 text-left font-bold text-slate-800 border-b-2 border-slate-400 min-w-[100px]">🏢 Depto</th>
                  <th className="p-2 text-left font-bold text-slate-800 border-b-2 border-slate-400 min-w-[100px]">💼 Puesto</th>
                  {columnas.map(c => {
                    const tipoDatoCol = tiposDatoColumnas[c.campo] || tipoDatoRubro;
                    const tCfg = tiposDatoConfig[tipoDatoCol];
                    return (
                      <th key={c.campo} className="p-2 text-center font-bold text-slate-800 border-b-2 border-slate-400 min-w-[120px] bg-white">
                        <div className="text-[11px] flex items-center justify-center gap-1 font-bold">
                          <span>{tCfg?.icono}</span>
                          <span className="truncate">{c.etiqueta}</span>
                        </div>
                        <div className="flex gap-1 justify-center mt-1">
                          <button onClick={() => { const v = prompt(`Aplicar a todos para "${c.etiqueta}":`, "0"); if (v !== null) aplicarTodos(c.campo, Number(v) || 0); }} className="text-[9px] text-blue-600 hover:text-blue-800 underline font-semibold">todos</button>
                          {vistaComparativa && (
                            <button onClick={() => aceptarSupervisorTodos(c.campo)} className="text-[9px] text-emerald-600 hover:text-emerald-800 underline font-bold">=Sup</button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="p-2 text-center font-bold text-purple-900 bg-purple-100 sticky right-0 z-10 border-b-2 border-slate-400 min-w-[100px]">Total RH</th>
                </tr>
              </thead>
              <tbody>
                {regsFiltrados.filter(r => r.incidencia).map(({ empleado, incidencia }) => {
                  const tieneDiferencias = columnas.some(c => {
                    const vSup = Number(incidencia[c.campo] || 0);
                    const vRH = Number(valoresRH[empleado.id]?.[c.campo] || 0);
                    return vSup !== vRH;
                  });
                  
                  return (
                    <tr key={empleado.id} className={`border-b border-slate-200 hover:bg-blue-50/50 ${tieneDiferencias ? 'bg-amber-50/40' : ''}`}>
                      <td className="p-2 sticky left-0 bg-white z-10 border-r border-slate-200">
                        <div className="font-semibold text-[11px] text-slate-800 flex items-center gap-1">
                          {empleado.nombre_completo}
                          {tieneDiferencias && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-bold">⚡</span>}
                        </div>
                        <div className="text-[10px] text-slate-500">#{empleado.numero_empleado}</div>
                      </td>
                      <td className="p-2 text-[11px]"><span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">{empleado.departamentos?.nombre || "Sin Depto"}</span></td>
                      <td className="p-2 text-[11px]"><span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">{empleado.puestos?.nombre || "Sin Puesto"}</span></td>
                      {columnas.map(c => {
                        const tipoDatoCol = tiposDatoColumnas[c.campo] || tipoDatoRubro;
                        const inputStep = tipoDatoCol === 'entero' ? "1" : "0.01";
                        const vSup = Number(incidencia[c.campo] ?? 0);
                        const vRH = Number(valoresRH[empleado.id]?.[c.campo] ?? 0);
                        const diff = vRH - vSup;
                        
                        return (
                          <td key={c.campo} className={`p-1.5 text-center ${diff !== 0 ? 'bg-amber-50' : 'bg-white'}`}>
                            {vistaComparativa && (
                              <div className="text-[10px] text-blue-700 font-bold mb-1 bg-blue-50 rounded px-1 py-0.5 border border-blue-200">
                                👷 {formatearValor(vSup, tipoDatoCol)}
                              </div>
                            )}
                            <input 
                              type="number" 
                              step={inputStep}
                              value={vRH} 
                              onChange={(e) => setValoresRH(prev => ({ ...prev, [empleado.id]: { ...prev[empleado.id], [c.campo]: e.target.value } }))} 
                              className={`w-full border-2 rounded px-1.5 py-1 text-[11px] text-center font-bold outline-none focus:ring-2 focus:ring-blue-500 ${diff !== 0 ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`} 
                            />
                            {diff !== 0 && (
                              <div className={`text-[9px] font-bold mt-0.5 ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {diff > 0 ? '▲' : '▼'} {formatearValor(Math.abs(diff), tipoDatoCol)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center bg-purple-50 font-black text-purple-900 sticky right-0 z-10 border-l-2 border-purple-300">
                        {formatearValor(columnas.reduce((a, c) => a + Number(valoresRH[empleado.id]?.[c.campo] || 0), 0), tipoDatoRubro)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                {vistaComparativa && (
                  <tr className="bg-blue-900 text-white">
                    <td colSpan={3} className="p-2 text-[11px] font-bold text-blue-200 sticky left-0 bg-blue-900 z-10">👷 TOTAL SUPERVISOR</td>
                    {columnas.map(c => {
                      const tipoDatoCol = tiposDatoColumnas[c.campo] || tipoDatoRubro;
                      return (<td key={c.campo} className="p-2 text-center text-[11px] font-bold text-blue-200">{formatearValor(totalesComparativos.sup[c.campo], tipoDatoCol)}</td>);
                    })}
                    <td className="p-2 text-center text-[11px] font-bold text-blue-200 sticky right-0 bg-blue-900 z-10">{formatearValor(totalesComparativos.totalSup, tipoDatoRubro)}</td>
                  </tr>
                )}
                <tr className="bg-slate-800 text-white">
                  <td colSpan={3} className="p-2 text-[11px] font-bold sticky left-0 bg-slate-800 z-10">🔍 TOTALES RH</td>
                  {columnas.map(c => {
                    const tipoDatoCol = tiposDatoColumnas[c.campo] || tipoDatoRubro;
                    const totalCol = regsFiltrados.filter(r => r.incidencia).reduce((acc, r) => acc + Number(valoresRH[r.empleado.id]?.[c.campo] || 0), 0);
                    return (<td key={c.campo} className="p-2 text-center text-[11px] font-bold">{formatearValor(totalCol, tipoDatoCol)}</td>);
                  })}
                  <td className="p-2 text-center font-black text-sm text-yellow-300 sticky right-0 bg-slate-800 z-10">
                    {formatearValor(regsFiltrados.filter(r => r.incidencia).reduce((acc, r) => acc + columnas.reduce((a, c) => a + Number(valoresRH[r.empleado.id]?.[c.campo] || 0), 0), 0), tipoDatoRubro)}
                  </td>
                </tr>
                {vistaComparativa && (
                  <tr className="bg-slate-900 text-white">
                    <td colSpan={3} className="p-2 text-[11px] font-bold text-slate-300 sticky left-0 bg-slate-900 z-10">📊 DIFERENCIA</td>
                    {columnas.map(c => {
                      const tipoDatoCol = tiposDatoColumnas[c.campo] || tipoDatoRubro;
                      const d = totalesComparativos.diff[c.campo];
                      return (
                        <td key={c.campo} className={`p-2 text-center text-[11px] font-bold ${d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {d !== 0 ? (d > 0 ? '+' : '') + formatearValor(Math.abs(d), tipoDatoCol) : '—'}
                        </td>
                      );
                    })}
                    <td className={`p-2 text-center text-[11px] font-bold sticky right-0 bg-slate-900 z-10 ${totalesComparativos.diffTotal > 0 ? 'text-emerald-400' : totalesComparativos.diffTotal < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {totalesComparativos.diffTotal !== 0 ? (totalesComparativos.diffTotal > 0 ? '+' : '') + formatearValor(Math.abs(totalesComparativos.diffTotal), tipoDatoRubro) : '—'}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          )}
        </div>

        {/* 🔥 FOOTER COMPACTO */}
        <div className="border-t-2 border-slate-300 px-4 py-2.5 bg-slate-50 flex-shrink-0 flex justify-between items-center gap-3">
          <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
            <span><strong>{regsFiltrados.filter(r => r.incidencia).length}</strong> empleados</span>
            {conteoDiferencias.conDif > 0 && (
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">⚡ {conteoDiferencias.conDif} con ajustes</span>
            )}
            {conteoDiferencias.sinDif > 0 && (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">✓ {conteoDiferencias.sinDif} validados</span>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onCerrar} className="bg-white border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 shadow-sm">
              {guardando ? "⏳ Guardando..." : `💾 Guardar ${config.titulo}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalConfigRubros({ todosLosRubros, rubrosPersonalizados, setRubrosPersonalizados, columnasDelMapeo, asignacionesColumnas, setAsignacionesColumnas, tiposDatoColumnas, setTiposDatoColumnas, onCerrar }) {
  const [nuevoRubro, setNuevoRubro] = useState({ clave: "", titulo: "", icono: "📋", color: "slate", tipo: "neutro", tipoDato: "entero" });
  const [mostrarForm, setMostrarForm] = useState(false);

  const colores = [
    { v: "emerald", bg: "bg-emerald-500" }, { v: "red", bg: "bg-red-500" }, { v: "amber", bg: "bg-amber-500" },
    { v: "blue", bg: "bg-blue-500" }, { v: "indigo", bg: "bg-indigo-500" }, { v: "purple", bg: "bg-purple-500" },
    { v: "pink", bg: "bg-pink-500" }, { v: "teal", bg: "bg-teal-500" }, { v: "slate", bg: "bg-slate-500" },
  ];

  const crear = () => {
    if (!nuevoRubro.clave || !nuevoRubro.titulo) { alert("Completa clave y título"); return; }
    if (todosLosRubros[nuevoRubro.clave]) { alert("Ya existe esa clave"); return; }
    const c = nuevoRubro.color;
    setRubrosPersonalizados(prev => ({ ...prev, [nuevoRubro.clave]: { 
      titulo: nuevoRubro.titulo, icono: nuevoRubro.icono, color: c, 
      bgLight: `bg-${c}-50`, text: `text-${c}-700`, border: `border-${c}-200`, 
      tipo: nuevoRubro.tipo, tipoDato: nuevoRubro.tipoDato 
    } }));
    setNuevoRubro({ clave: "", titulo: "", icono: "📋", color: "slate", tipo: "neutro", tipoDato: "entero" });
    setMostrarForm(false);
  };

  const eliminar = (clave) => {
    if (rubrosIniciales[clave]) { alert("No puedes eliminar rubros predeterminados"); return; }
    if (!confirm(`¿Eliminar "${todosLosRubros[clave].titulo}"?`)) return;
    const nA = { ...asignacionesColumnas };
    Object.keys(nA).forEach(c => { if (nA[c] === clave) nA[c] = 'otros'; });
    setAsignacionesColumnas(nA);
    const nR = { ...rubrosPersonalizados };
    delete nR[clave];
    setRubrosPersonalizados(nR);
  };

  const cambiarTipoDatoRubro = (clave, nuevoTipoDato) => {
    if (rubrosIniciales[clave]) {
      setRubrosPersonalizados(prev => ({ ...prev, [clave]: { ...rubrosIniciales[clave], tipoDato: nuevoTipoDato } }));
    } else {
      setRubrosPersonalizados(prev => ({ ...prev, [clave]: { ...prev[clave], tipoDato: nuevoTipoDato } }));
    }
  };

  const cambiarTipoDatoColumna = (campo, nuevoTipoDato) => {
    setTiposDatoColumnas(prev => ({ ...prev, [campo]: nuevoTipoDato }));
  };

  const guardarCambios = () => {
    localStorage.setItem("rubros_personalizados", JSON.stringify(rubrosPersonalizados));
    localStorage.setItem("asignaciones_columnas_rubros", JSON.stringify(asignacionesColumnas));
    localStorage.setItem("tipos_dato_columnas", JSON.stringify(tiposDatoColumnas));
    alert("✅ Cambios guardados correctamente:\n\n• Rubros personalizados\n• Asignaciones de columnas\n• Tipos de dato por columna");
    onCerrar();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] flex flex-col">
        <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold">🏷️ Configuración de Rubros</h3>
              <p className="text-xs text-white/90 mt-1">Crea rubros, reasigna columnas y define el tipo de dato</p>
            </div>
            <button onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4">
            {!mostrarForm ? (
              <button onClick={() => setMostrarForm(true)} className="w-full text-center py-3 text-slate-600 font-semibold">+ Crear Nuevo Rubro</button>
            ) : (
              <div className="space-y-3">
                <h4 className="font-bold">Crear Nuevo Rubro</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  <input type="text" value={nuevoRubro.clave} onChange={(e) => setNuevoRubro({ ...nuevoRubro, clave: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="Clave (ej: viaticos)" className="border rounded-lg p-2 text-sm" />
                  <input type="text" value={nuevoRubro.titulo} onChange={(e) => setNuevoRubro({ ...nuevoRubro, titulo: e.target.value })} placeholder="Título (ej: Viáticos)" className="border rounded-lg p-2 text-sm" />
                  <input type="text" value={nuevoRubro.icono} onChange={(e) => setNuevoRubro({ ...nuevoRubro, icono: e.target.value })} placeholder="Ícono (emoji)" className="border rounded-lg p-2 text-sm" />
                  <select value={nuevoRubro.tipo} onChange={(e) => setNuevoRubro({ ...nuevoRubro, tipo: e.target.value })} className="border rounded-lg p-2 text-sm">
                    <option value="positivo">💰 Positivo</option>
                    <option value="negativo">💸 Negativo</option>
                    <option value="neutro">📋 Neutro</option>
                  </select>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold mb-2">🔢 Tipo de Dato por Defecto</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(tiposDatoConfig).map(([key, cfg]) => (
                        <button key={key} onClick={() => setNuevoRubro({ ...nuevoRubro, tipoDato: key })} className={`p-3 rounded-lg border-2 text-left transition ${nuevoRubro.tipoDato === key ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          <div className="text-lg">{cfg.icono}</div>
                          <div className="text-xs font-bold text-slate-800">{cfg.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Ej: {cfg.ejemplo}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold mb-1">🎨 Color</label>
                    <div className="flex flex-wrap gap-2">
                      {colores.map(c => (
                        <button key={c.v} onClick={() => setNuevoRubro({ ...nuevoRubro, color: c.v })} className={`${c.bg} w-8 h-8 rounded-lg border-2 ${nuevoRubro.color === c.v ? 'border-slate-800' : 'border-transparent'}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={crear} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">✅ Crear</button>
                  <button onClick={() => { setMostrarForm(false); setNuevoRubro({ clave: "", titulo: "", icono: "📋", color: "slate", tipo: "neutro", tipoDato: "entero" }); }} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-bold mb-3">Rubros Existentes ({Object.keys(todosLosRubros).length})</h4>
            <div className="space-y-3">
              {Object.entries(todosLosRubros).map(([clave, cfg]) => {
                const cols = columnasDelMapeo.filter(c => (asignacionesColumnas[c.campo] || clasificarRubroInicial(c.campo)) === clave);
                const esPred = rubrosIniciales[clave];
                const tipoDatoActual = cfg.tipoDato || 'entero';
                const tipoDatoCfg = tiposDatoConfig[tipoDatoActual];

                return (
                  <div key={clave} className={`${cfg.bgLight} border-2 ${cfg.border} rounded-xl p-4`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{cfg.icono}</span>
                        <div>
                          <div className={`font-bold ${cfg.text}`}>{cfg.titulo}</div>
                          <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                            <span>{cols.length} columnas</span>
                            <span className="bg-white/60 px-2 py-0.5 rounded text-[10px] font-bold">{tipoDatoCfg.icono} {tipoDatoCfg.label}</span>
                            {!esPred && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">Personalizado</span>}
                          </div>
                        </div>
                      </div>
                      {!esPred && <button onClick={() => eliminar(clave)} className="text-red-600 hover:text-red-800 text-xs font-bold">🗑️ Eliminar</button>}
                    </div>

                    <div className="bg-white/50 rounded-lg p-3 mb-3 border border-white">
                      <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Tipo de Dato por Defecto</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(tiposDatoConfig).map(([key, tCfg]) => (
                          <button key={key} onClick={() => cambiarTipoDatoRubro(clave, key)} className={`p-2 rounded border text-xs transition ${tipoDatoActual === key ? 'border-purple-500 bg-purple-100 font-bold' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <span className="mr-1">{tCfg.icono}</span>{tCfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {cols.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <div className="text-xs font-bold">Columnas asignadas:</div>
                        {cols.map(col => {
                          const tipoDatoCol = tiposDatoColumnas[col.campo] || tipoDatoActual;
                          return (
                            <div key={col.campo} className="bg-white rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold">{col.etiqueta}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{col.campo}</div>
                                </div>
                                <select value={asignacionesColumnas[col.campo] || clasificarRubroInicial(col.campo)} onChange={(e) => setAsignacionesColumnas(prev => ({ ...prev, [col.campo]: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                                  {Object.entries(todosLosRubros).map(([k, v]) => (<option key={k} value={k}>{v.icono} {v.titulo}</option>))}
                                </select>
                              </div>
                              <div className="bg-slate-50 rounded p-2 border border-slate-200">
                                <div className="text-[9px] font-bold text-slate-600 uppercase mb-1.5">Tipo de Dato de esta Columna</div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {Object.entries(tiposDatoConfig).map(([key, tCfg]) => (
                                    <button key={key} onClick={() => cambiarTipoDatoColumna(col.campo, key)} className={`p-1.5 rounded border text-[10px] transition ${tipoDatoCol === key ? 'border-purple-500 bg-purple-100 font-bold' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                      <span>{tCfg.icono}</span>
                                      <div className="text-[9px]">{tCfg.label}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-between items-center">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Los cambios se guardan automáticamente en tu navegador
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-100 transition">❌ Cancelar</button>
            <button onClick={guardarCambios} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2">💾 Guardar Cambios</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiModerno({ titulo, valor, icono, color }) {
  const colores = {
    blue: { bg: "bg-blue-50", text: "text-blue-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
    gray: { bg: "bg-slate-50", text: "text-slate-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    red: { bg: "bg-red-50", text: "text-red-600" },
  };
  const { bg, text } = colores[color];
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${bg}`}>{icono}</div>
      </div>
      <div className={`text-2xl font-black ${text}`}>{valor}</div>
      <div className="text-xs text-slate-500 font-medium mt-1">{titulo}</div>
    </div>
  );
}

function ModalCaptura({ empleado, columnas, guardando, onGuardar, onCerrar }) {
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(c => { init[c.campo] = empleado.incidencia?.[c.campo] ?? 0; });
    return init;
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(empleado.id, valores); }} className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold">📝 Captura de Incidencias</h3>
              <p className="text-xs text-white/90 mt-0.5"><strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre || "Sin Depto"} · {empleado.puestos?.nombre || "Sin Puesto"}</p>
            </div>
            <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {columnas.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-3">
              {columnas.map(c => (
                <div key={c.campo} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-blue-800 mb-1">{c.etiqueta}</label>
                  <input type="number" step="0.01" min="0" value={valores[c.campo] ?? 0} onChange={(e) => setValores(prev => ({ ...prev, [c.campo]: e.target.value }))} className="w-full border border-blue-300 p-2 rounded text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-center">⚠️ RH no ha habilitado campos</div>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onCerrar} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
          <button type="submit" disabled={guardando || columnas.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-blue-300">
            {guardando ? "Guardando..." : "📝 Enviar a RH"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalRevision({ registro, columnas, guardando, onGuardar, onCerrar }) {
  const { empleado, incidencia } = registro;
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(c => { init[c.campo] = incidencia?.[c.campo] ?? 0; });
    return init;
  });
  const [estadoFinal, setEstadoFinal] = useState(incidencia?.estado || "pendiente");
  const [comentario, setComentario] = useState(incidencia?.comentarios_rrhh || "");
  const columnasSup = columnas.filter(c => c.permite_supervisor);
  const columnasRHOnly = columnas.filter(c => !c.permite_supervisor);
  const totalSumas = columnas.filter(c => esCampoMonetario(c.campo) && !esDeduccion(c.campo)).reduce((a, c) => a + Number(valores[c.campo] || 0), 0);
  const totalRestas = columnas.filter(c => esCampoMonetario(c.campo) && esDeduccion(c.campo)).reduce((a, c) => a + Number(valores[c.campo] || 0), 0);
  const neto = totalSumas - totalRestas;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(incidencia?.id, valores, estadoFinal, comentario); }} className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl max-h-[95vh] flex flex-col">
        <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold">🔍 Validación de RH</h3>
              <p className="text-xs text-white/90 mt-0.5"><strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre || "Sin Depto"}</p>
            </div>
            <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {["pendiente", "aprobado", "rechazado"].map(e => (
              <button key={e} type="button" onClick={() => setEstadoFinal(e)} className={`p-3 rounded-xl font-bold text-sm border-2 ${estadoFinal === e ? (e === "aprobado" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : e === "rechazado" ? "bg-red-100 border-red-500 text-red-800" : "bg-amber-100 border-amber-500 text-amber-800") : "bg-white border-slate-200 text-slate-500"}`}>
                {e === "pendiente" ? "⏳ Pendiente" : e === "aprobado" ? "✅ Aprobar" : "❌ Rechazar"}
              </button>
            ))}
          </div>
          {columnasSup.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 mb-3">👷 Propuesta del Supervisor</h4>
              <div className="grid md:grid-cols-3 gap-3">
                {columnasSup.map(c => (
                  <div key={c.campo}>
                    <label className="block text-xs font-semibold text-blue-800 mb-1">{c.etiqueta}</label>
                    <input type="number" step="0.01" value={valores[c.campo] ?? 0} onChange={(e) => setValores(prev => ({ ...prev, [c.campo]: e.target.value }))} className="w-full border border-blue-300 p-2 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {columnasRHOnly.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-900 mb-3">🔒 Exclusivos de RH</h4>
              <div className="grid md:grid-cols-3 gap-3">
                {columnasRHOnly.map(c => (
                  <div key={c.campo}>
                    <label className="block text-xs font-semibold text-purple-800 mb-1">{c.etiqueta}</label>
                    <input type="number" step="0.01" value={valores[c.campo] ?? 0} onChange={(e) => setValores(prev => ({ ...prev, [c.campo]: e.target.value }))} className="w-full border border-purple-300 p-2 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold mb-1">💬 Observaciones</label>
            <textarea rows="3" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: Ajustado según reloj checador..." className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>
        <div className="border-t bg-slate-50 px-6 py-4 rounded-b-2xl">
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="text-center bg-white rounded-xl p-3 border border-slate-200">
              <div className="text-xs text-slate-500 uppercase font-semibold">Percepciones</div>
              <div className="text-xl font-bold text-emerald-600">+ ${totalSumas.toFixed(2)}</div>
            </div>
            <div className="text-center bg-white rounded-xl p-3 border border-slate-200">
              <div className="text-xs text-slate-500 uppercase font-semibold">Deducciones</div>
              <div className="text-xl font-bold text-red-600">- ${totalRestas.toFixed(2)}</div>
            </div>
            <div className="text-center bg-white rounded-xl p-3 shadow-md border-2 border-purple-500">
              <div className="text-xs text-purple-600 uppercase font-bold">Neto</div>
              <div className="text-2xl font-black text-purple-900">${neto.toFixed(2)}</div>
            </div>
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