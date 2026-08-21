import { useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";

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

const esDeduccion = (campo) => {
  const n = normalizar(campo);
  return /descuento|deduccion|adeudo|falta|prestamo|infonavit|imss|sancion/.test(n);
};

const limpiarPayload = (payload) => {
  const limpio = { ...payload };
  ['id', 'created_at', 'updated_at', 'deleted_at'].forEach(k => delete limpio[k]);
  Object.keys(limpio).forEach(k => {
    if (limpio[k] === "" || limpio[k] === null || limpio[k] === undefined) delete limpio[k];
  });
  return limpio;
};

const formatearMoneda = (valor) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
};

const ITEMS_POR_PAGINA = 50;

export default function Incidencias() {
  const [empleados, setEmpleados] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [puestosLista, setPuestosLista] = useState([]);
  const [departamentosLista, setDepartamentosLista] = useState([]);
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
  const [modalSegmento, setModalSegmento] = useState({ abierto: false, tipo: null, titulo: "", icono: "", color: "" });

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

  const segmentosMonetarios = useMemo(() => {
    const bonos = columnasActivas.filter(c => esCampoMonetario(c.campo) && !esDeduccion(c.campo) && !normalizar(c.campo).includes('sueldo') && !normalizar(c.campo).includes('neto') && !normalizar(c.campo).includes('total'));
    const deducciones = columnasActivas.filter(c => esCampoMonetario(c.campo) && esDeduccion(c.campo));
    const percepciones = columnasActivas.filter(c => esCampoMonetario(c.campo) && !esDeduccion(c.campo) && (normalizar(c.campo).includes('sueldo') || normalizar(c.campo).includes('neto') || normalizar(c.campo).includes('total')));
    return { bonos, deducciones, percepciones };
  }, [columnasActivas]);

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
          if (nombre && !puestosUnicos.has(nombre.toLowerCase())) {
            puestosUnicos.set(nombre.toLowerCase(), { ...p, nombre });
          }
        });
        setPuestosLista(Array.from(puestosUnicos.values()));
        setDepartamentosLista(resDepts.data || []);

        const empleadosProcesados = (resEmpleados.data || []).map(emp => {
          let deptoObj = null;
          if (emp.departamento_id) deptoObj = (resDepts.data || []).find(d => d.id === emp.departamento_id);
          if (!deptoObj && emp.departamento) deptoObj = { nombre: emp.departamento };

          let puestoObj = null;
          if (emp.puesto_id) puestoObj = Array.from(puestosUnicos.values()).find(p => p.id === emp.puesto_id);
          if (!puestoObj && emp.puesto) puestoObj = { nombre: emp.puesto };

          return { ...emp, departamentos: deptoObj, puestos: puestoObj };
        });
        setEmpleados(empleadosProcesados);

        if (resConfig.data?.configuracion) setConfiguracionMapeo(resConfig.data.configuracion);
        else {
          const local = localStorage.getItem("config_mapeo_columnas_dinamico");
          if (local) setConfiguracionMapeo(JSON.parse(local));
        }

        if (resPermisos.data?.configuracion) setPermisosSupervisor(resPermisos.data.configuracion);
        else {
          const local = localStorage.getItem("permisos_incidencias");
          if (local) setPermisosSupervisor(JSON.parse(local));
        }
      } catch (err) {
        console.error("❌ Error cargando datos:", err);
      } finally {
        setLoadingEmpleados(false);
      }
    };
    cargarTodo();
  }, []);

  useEffect(() => {
    if (!periodoId) return;
    const cargarIncidencias = async () => {
      setLoadingIncidencias(true);
      try {
        const { data, error } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
        if (error) throw error;
        setIncidencias(data || []);
      } catch (err) {
        console.error("Error:", err);
        setIncidencias([]);
      } finally {
        setLoadingIncidencias(false);
      }
    };
    cargarIncidencias();
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
  useEffect(() => { setPaginaActual(1); }, [busqueda, departamentoFiltro, puestoFiltro, estadoFiltro, periodoId]);

  useEffect(() => {
    const handleScroll = () => setMostrarBotonArriba(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const guardarPermisos = async () => {
    setGuardandoPermisos(true);
    try {
      await supabase.from("configuracion_tablas").upsert({
        clave: "permisos_incidencias",
        configuracion: permisosSupervisor,
      }, { onConflict: "clave" });
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
      if (existente) {
        const { error: e } = await supabase.from("incidencias").update(payload).eq("id", existente.id);
        error = e;
      } else {
        const { error: e } = await supabase.from("incidencias").insert([payload]);
        error = e;
      }
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

  const guardarAjustesSegmento = async (ajustes) => {
    setGuardando(true);
    try {
      let errores = 0;
      for (const ajuste of ajustes) {
        const { error } = await supabase.from("incidencias").update(ajuste.valores).eq("id", ajuste.incidenciaId);
        if (error) errores++;
      }
      if (errores > 0) {
        alert(`⚠️ Se guardaron algunos ajustes, pero hubo ${errores} errores.`);
      } else {
        alert(`✅ ${ajustes.length} ajustes guardados correctamente.`);
      }
      const { data } = await supabase.from("incidencias").select("*").eq("periodo_id", periodoId);
      setIncidencias(data || []);
      setModalSegmento({ abierto: false, tipo: null, titulo: "", icono: "", color: "" });
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

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

  const registros = useMemo(() => {
    return empleados
      .map(emp => ({ empleado: emp, incidencia: incidencias.find(i => i.empleado_id === emp.id) || null }))
      .sort((a, b) => {
        const deptoA = (a.empleado.departamentos?.nombre || "Sin Departamento").toLowerCase();
        const deptoB = (b.empleado.departamentos?.nombre || "Sin Departamento").toLowerCase();
        if (deptoA !== deptoB) return deptoA.localeCompare(deptoB);
        const puestoA = (a.empleado.puestos?.nombre || "Sin Puesto").toLowerCase();
        const puestoB = (b.empleado.puestos?.nombre || "Sin Puesto").toLowerCase();
        if (puestoA !== puestoB) return puestoA.localeCompare(puestoB);
        return (a.empleado.nombre_completo || "").localeCompare(b.empleado.nombre_completo || "");
      });
  }, [empleados, incidencias]);

  const registrosFiltrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return registros.filter(r => {
      const emp = r.empleado;
      const coincide = [emp.nombre_completo, emp.numero_empleado, emp.departamentos?.nombre, emp.puestos?.nombre]
        .some(c => String(c || "").toLowerCase().includes(texto));
      const coincideDepto = departamentoFiltro === "TODOS" || emp.departamentos?.nombre === departamentoFiltro;
      const coincidePuesto = puestoFiltro === "TODOS" || emp.puestos?.nombre === puestoFiltro;
      const estado = r.incidencia?.estado || "sin_captura";
      const coincideEstado = estadoFiltro === "TODOS" || estado === estadoFiltro;
      return coincide && coincideDepto && coincidePuesto && coincideEstado;
    });
  }, [registros, busqueda, departamentoFiltro, puestoFiltro, estadoFiltro]);

  // 🔥 NUEVO: Totales por segmento (respetando filtros activos)
  const totalesPorSegmento = useMemo(() => {
    const calcular = (columnas) => {
      return columnas.reduce((total, col) => {
        const sumaEmpleados = registrosFiltrados.reduce((acc, r) => {
          if (r.incidencia) {
            return acc + Number(r.incidencia[col.campo] || 0);
          }
          return acc;
        }, 0);
        return total + sumaEmpleados;
      }, 0);
    };

    return {
      bonos: calcular(segmentosMonetarios.bonos),
      deducciones: calcular(segmentosMonetarios.deducciones),
      percepciones: calcular(segmentosMonetarios.percepciones),
    };
  }, [registrosFiltrados, segmentosMonetarios]);

  // 🔥 NUEVO: Totales por columna monetaria (para el footer de la tabla)
  const totalesPorColumna = useMemo(() => {
    const totales = {};
    columnasActivas.forEach(col => {
      if (esCampoMonetario(col.campo)) {
        totales[col.campo] = registrosFiltrados.reduce((acc, r) => {
          if (r.incidencia) return acc + Number(r.incidencia[col.campo] || 0);
          return acc;
        }, 0);
      }
    });
    return totales;
  }, [registrosFiltrados, columnasActivas]);

  const totalPaginas = Math.ceil(registrosFiltrados.length / ITEMS_POR_PAGINA);
  const registrosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    return registrosFiltrados.slice(inicio, inicio + ITEMS_POR_PAGINA);
  }, [registrosFiltrados, paginaActual]);

  const registrosConSeparadores = useMemo(() => {
    return registrosPaginados.map((registro, index) => {
      const anterior = index > 0 ? registrosPaginados[index - 1] : null;
      const deptoActual = registro.empleado.departamentos?.nombre || "Sin Departamento";
      const puestoActual = registro.empleado.puestos?.nombre || "Sin Puesto";
      const mostrarHeaderDepto = !anterior || (anterior.empleado.departamentos?.nombre || "Sin Departamento") !== deptoActual;
      const mostrarHeaderPuesto = !anterior ||
        (anterior.empleado.departamentos?.nombre || "Sin Departamento") !== deptoActual ||
        (anterior.empleado.puestos?.nombre || "Sin Puesto") !== puestoActual;
      return { ...registro, mostrarHeaderDepto, mostrarHeaderPuesto, deptoActual, puestoActual };
    });
  }, [registrosPaginados]);

  const kpis = useMemo(() => {
    const total = empleados.length;
    const conCaptura = incidencias.length;
    const pendientes = incidencias.filter(i => i.estado === "pendiente").length;
    const aprobados = incidencias.filter(i => i.estado === "aprobado").length;
    const rechazados = incidencias.filter(i => i.estado === "rechazado").length;
    return { total, conCaptura, pendientes, aprobados, rechazados, sinCaptura: total - conCaptura };
  }, [empleados, incidencias]);

  const conteoPorDepto = useMemo(() => {
    const conteo = {};
    empleados.forEach(emp => {
      const depto = emp.departamentos?.nombre || "Sin Departamento";
      conteo[depto] = (conteo[depto] || 0) + 1;
    });
    return conteo;
  }, [empleados]);

  const conteoPorPuesto = useMemo(() => {
    const conteo = {};
    const empleadosFiltradosPorDepto = departamentoFiltro === "TODOS" 
      ? empleados 
      : empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === departamentoFiltro);
    
    empleadosFiltradosPorDepto.forEach(emp => {
      const puesto = emp.puestos?.nombre || "Sin Puesto";
      conteo[puesto] = (conteo[puesto] || 0) + 1;
    });
    return conteo;
  }, [empleados, departamentoFiltro]);

  const departamentosUnicos = ["TODOS", ...new Set(empleados.map(e => e?.departamentos?.nombre).filter(Boolean))].sort();
  const puestosUnicosFiltrados = useMemo(() => {
    const empleadosFiltradosPorDepto = departamentoFiltro === "TODOS" 
      ? empleados 
      : empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === departamentoFiltro);
    return ["TODOS", ...new Set(empleadosFiltradosPorDepto.map(e => e?.puestos?.nombre).filter(Boolean))].sort();
  }, [empleados, departamentoFiltro]);

  const periodoActual = periodos.find(p => p.id === periodoId);

  const abrirSegmento = (tipo) => {
    const config = {
      bonos: { titulo: "Gestión de Bonos", icono: "💰", color: "emerald" },
      deducciones: { titulo: "Gestión de Deducciones", icono: "💸", color: "red" },
      percepciones: { titulo: "Gestión de Percepciones", icono: "💵", color: "blue" },
    };
    setModalSegmento({ abierto: true, tipo, ...config[tipo] });
  };

  return (
    <Layout>
      <div className={pantallaCompleta ? "fixed inset-0 z-50 bg-white overflow-auto p-6" : "space-y-6"}>
        {/* HEADER */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjIiLz48L2c+PC9zdmc+')] opacity-20"></div>
          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl">⚡</div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight">Incidencias</h1>
                  <p className="text-white/80 text-sm mt-1">Gestión de nómina con validación en dos niveles</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setModalPermisos(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 border border-white/20 transition">
                🔒 <span className="hidden sm:inline">Permisos</span>
              </button>
              <button onClick={() => setModalConfigColumnas(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 border border-white/20 transition">
                ⚙️ <span className="hidden sm:inline">Columnas</span>
              </button>
              {pantallaCompleta && (
                <button onClick={() => setPantallaCompleta(false)} className="bg-white text-indigo-700 px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition hover:bg-indigo-50">
                  ✕ Salir
                </button>
              )}
            </div>
          </div>
        </div>

        {/* SELECTOR DE PERÍODO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">📅</div>
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase">Período de Nómina</div>
                <div className="text-sm font-bold text-slate-800">Selecciona el período activo</div>
              </div>
            </div>
            <select value={periodoId} onChange={e => setPeriodoId(e.target.value)} className="flex-1 border-2 border-slate-200 rounded-xl p-3 bg-slate-50 font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition">
              {periodos.map(p => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
            </select>
            {periodoActual && (
              <div className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-medium">
                📆 {new Date(periodoActual.fecha_inicio).toLocaleDateString('es-MX')} - {new Date(periodoActual.fecha_fin).toLocaleDateString('es-MX')}
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiModerno titulo="Empleados" valor={kpis.total} icono="👥" color="blue" />
          <KpiModerno titulo="Con Captura" valor={kpis.conCaptura} icono="📝" color="indigo" />
          <KpiModerno titulo="Sin Captura" valor={kpis.sinCaptura} icono="⚠️" color="gray" />
          <KpiModerno titulo="Pendientes" valor={kpis.pendientes} icono="⏳" color="amber" />
          <KpiModerno titulo="Aprobados" valor={kpis.aprobados} icono="✅" color="emerald" />
          <KpiModerno titulo="Rechazados" valor={kpis.rechazados} icono="❌" color="red" />
        </div>

        {/* TABS + BOTONES DE SEGMENTOS CON TOTALES */}
        <div className="space-y-3">
          {/* Fila 1: Tabs Supervisor/RH */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setVistaActual("supervisor")} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border-2 ${vistaActual === "supervisor" ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"}`}>
              <span className="text-base">👷</span><span>Supervisor</span>
            </button>
            <button onClick={() => setVistaActual("rrhh")} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border-2 ${vistaActual === "rrhh" ? "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/30" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600"}`}>
              <span className="text-base">🔍</span><span>Recursos Humanos</span>
            </button>
          </div>

          {/* 🔥 Fila 2: BOTONES DE SEGMENTOS CON TOTALES (solo para RH) */}
          {vistaActual === "rrhh" && (segmentosMonetarios.bonos.length > 0 || segmentosMonetarios.deducciones.length > 0 || segmentosMonetarios.percepciones.length > 0) && (
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span>💼</span> Gestión por Rubro
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-normal">
                    Totales calculados sobre {registrosFiltrados.length} empleados filtrados
                  </span>
                </h3>
                {(departamentoFiltro !== "TODOS" || puestoFiltro !== "TODOS") && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-semibold">
                    🔍 Filtros activos: {departamentoFiltro !== "TODOS" ? departamentoFiltro : ""} {puestoFiltro !== "TODOS" ? `→ ${puestoFiltro}` : ""}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {segmentosMonetarios.bonos.length > 0 && (
                  <button onClick={() => abrirSegmento("bonos")} className="group bg-white hover:bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-400 rounded-xl p-4 text-left transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">💰</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                        {segmentosMonetarios.bonos.length} campos
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-semibold uppercase">Total Bonos</div>
                    <div className="text-2xl font-black text-emerald-700 mt-1">
                      {formatearMoneda(totalesPorSegmento.bonos)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 group-hover:text-emerald-600 transition">
                      Click para gestionar →
                    </div>
                  </button>
                )}
                {segmentosMonetarios.deducciones.length > 0 && (
                  <button onClick={() => abrirSegmento("deducciones")} className="group bg-white hover:bg-red-50 border-2 border-red-200 hover:border-red-400 rounded-xl p-4 text-left transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">💸</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                        {segmentosMonetarios.deducciones.length} campos
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-semibold uppercase">Total Deducciones</div>
                    <div className="text-2xl font-black text-red-700 mt-1">
                      {formatearMoneda(totalesPorSegmento.deducciones)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 group-hover:text-red-600 transition">
                      Click para gestionar →
                    </div>
                  </button>
                )}
                {segmentosMonetarios.percepciones.length > 0 && (
                  <button onClick={() => abrirSegmento("percepciones")} className="group bg-white hover:bg-blue-50 border-2 border-blue-200 hover:border-blue-400 rounded-xl p-4 text-left transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">💵</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                        {segmentosMonetarios.percepciones.length} campos
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-semibold uppercase">Total Percepciones</div>
                    <div className="text-2xl font-black text-blue-700 mt-1">
                      {formatearMoneda(totalesPorSegmento.percepciones)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 group-hover:text-blue-600 transition">
                      Click para gestionar →
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FILTROS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Buscar empleado, número, puesto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
            </div>
            <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition">
              <option value="TODOS">📊 Todos los estados</option>
              <option value="sin_captura">⚠️ Sin captura</option>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="aprobado">✅ Aprobado</option>
              <option value="rechazado">❌ Rechazado</option>
            </select>
            <div className="flex items-center justify-end bg-slate-50 rounded-xl px-4 py-2.5">
              <span className="text-sm text-slate-600">
                <strong className="text-slate-900">{registrosFiltrados.length}</strong> de <strong className="text-slate-900">{empleados.length}</strong>
              </span>
            </div>
          </div>

          {/* Chips de Departamento */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
              <span>🏢</span> Filtrar por Departamento
              {(departamentoFiltro !== "TODOS" || puestoFiltro !== "TODOS") && (
                <button onClick={() => { setDepartamentoFiltro("TODOS"); setPuestoFiltro("TODOS"); }} className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold hover:bg-red-200">
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {departamentosUnicos.map(depto => {
                const count = depto === "TODOS" ? empleados.length : (conteoPorDepto[depto] || 0);
                const activo = departamentoFiltro === depto;
                return (
                  <button key={depto} onClick={() => { setDepartamentoFiltro(depto); setPuestoFiltro("TODOS"); }} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${activo ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
                    {depto === "TODOS" ? "🌐 Todos" : depto}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chips de Puesto */}
          {departamentoFiltro !== "TODOS" && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                <span>💼</span> Filtrar por Puesto en <span className="text-indigo-600">{departamentoFiltro}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {puestosUnicosFiltrados.map(puesto => {
                  const count = puesto === "TODOS" ? conteoPorDepto[departamentoFiltro] || 0 : (conteoPorPuesto[puesto] || 0);
                  const activo = puestoFiltro === puesto;
                  return (
                    <button key={puesto} onClick={() => setPuestoFiltro(puesto)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${activo ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                      {puesto === "TODOS" ? "🌐 Todos" : puesto}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* TABLA PRINCIPAL */}
        <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col ${pantallaCompleta ? "h-[calc(100vh-120px)]" : "max-h-[75vh]"}`}>
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-slate-800 text-sm">📋 Registros del Período</h3>
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">{registrosFiltrados.length} empleados</span>
            </div>
            <button onClick={() => setPantallaCompleta(!pantallaCompleta)} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5">
              {pantallaCompleta ? "🗗 Minimizar" : "⛶ Pantalla Completa"}
            </button>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
                <tr>
                  <th className="p-4 font-bold text-slate-700 sticky left-0 bg-slate-50 z-40 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">No.</th>
                  <th className="p-4 font-bold text-slate-700">Colaborador</th>
                  <th className="p-4 font-bold text-slate-700">🏢 Departamento</th>
                  <th className="p-4 font-bold text-slate-700">💼 Puesto</th>
                  <th className="p-4 font-bold text-slate-700">Estado</th>
                  {columnasActivas.map(col => (
                    <th key={col.campo} className={`p-4 text-right font-bold ${esCampoMonetario(col.campo) ? 'bg-emerald-50 text-emerald-900' : col.permite_supervisor ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-700'}`}>
                      <div className="flex items-center justify-end gap-1">
                        {col.etiqueta}
                        {col.permite_supervisor && <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full">👷</span>}
                      </div>
                    </th>
                  ))}
                  {vistaActual === "rrhh" && <th className="p-4 font-bold text-slate-700">💬 Obs.</th>}
                  <th className="p-4 font-bold text-slate-700 text-center sticky right-0 bg-slate-50 z-40 border-l border-slate-200 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loadingEmpleados ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Array.from({ length: 8 }).map((_, j) => (<td key={j} className="p-4"><div className="h-4 bg-slate-200 rounded animate-pulse"></div></td>))}
                    </tr>
                  ))
                ) : registrosConSeparadores.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="p-12 text-center">
                      <div className="text-6xl mb-3">📭</div>
                      <div className="text-slate-500 font-semibold">No hay resultados</div>
                      <div className="text-xs text-slate-400 mt-1">Intenta ajustar los filtros</div>
                    </td>
                  </tr>
                ) : (
                  registrosConSeparadores.map(({ empleado, incidencia, mostrarHeaderDepto, mostrarHeaderPuesto, deptoActual, puestoActual }, idx) => {
                    const estado = incidencia?.estado || "sin_captura";
                    const estadoConfig = {
                      sin_captura: { color: "bg-slate-100 text-slate-600", icono: "⚠️", label: "Sin captura" },
                      pendiente: { color: "bg-amber-100 text-amber-800", icono: "⏳", label: "Pendiente" },
                      aprobado: { color: "bg-emerald-100 text-emerald-800", icono: "✅", label: "Aprobado" },
                      rechazado: { color: "bg-red-100 text-red-800", icono: "❌", label: "Rechazado" },
                    }[estado];

                    return (
                      <>
                        {mostrarHeaderDepto && (
                          <tr key={`depto-${idx}`} className="bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-[57px] z-20">
                            <td colSpan={20} className="px-4 py-2.5 font-bold text-sm flex items-center gap-2">
                              <span className="text-lg">🏢</span>
                              <span className="uppercase tracking-wide">{deptoActual}</span>
                              <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
                                {empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === deptoActual).length} empleados
                              </span>
                            </td>
                          </tr>
                        )}
                        {mostrarHeaderPuesto && (
                          <tr key={`puesto-${idx}`} className="bg-slate-100 border-b border-slate-300">
                            <td colSpan={20} className="px-6 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                              <span>💼</span><span>{puestoActual}</span>
                              <span className="ml-auto text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                                {empleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === deptoActual && (e.puestos?.nombre || "Sin Puesto") === puestoActual).length}
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr key={empleado.id} className={`group border-b border-slate-100 hover:bg-slate-50 transition ${estado === "rechazado" ? "bg-red-50/30" : ""}`}>
                          <td className="p-4 font-mono text-slate-600 sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] transition-colors duration-200">
                            {empleado.numero_empleado || "S/N"}
                          </td>
                          <td className="p-4"><div className="font-semibold text-slate-800">{empleado.nombre_completo || "Sin nombre"}</div></td>
                          <td className="p-4 text-slate-600"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-medium">{empleado.departamentos?.nombre || "N/A"}</span></td>
                          <td className="p-4 text-slate-600"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{empleado.puestos?.nombre || "Sin asignar"}</span></td>
                          <td className="p-4">
                            <span className={`${estadoConfig.color} px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1`}>
                              {estadoConfig.icono} {estadoConfig.label}
                            </span>
                          </td>
                          {columnasActivas.map(col => {
                            const val = incidencia?.[col.campo];
                            const esMonet = esCampoMonetario(col.campo);
                            const displayVal = val !== null && val !== undefined && val !== "" ? (esMonet ? `$${Number(val).toFixed(2)}` : val) : <span className="text-slate-300">—</span>;
                            return (<td key={col.campo} className={`p-4 text-right ${esMonet ? 'text-emerald-700 font-semibold' : 'text-slate-700'}`}>{displayVal}</td>);
                          })}
                          {vistaActual === "rrhh" && (
                            <td className="p-4 max-w-[150px]">
                              <div className="truncate text-[11px] text-slate-600" title={incidencia?.comentarios_rrhh || ""}>
                                {incidencia?.comentarios_rrhh || <span className="text-slate-300">—</span>}
                              </div>
                            </td>
                          )}
                          <td className="p-4 sticky right-0 bg-white group-hover:bg-slate-50 z-20 border-l border-slate-200 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)] transition-colors duration-200">
                            {vistaActual === "supervisor" ? (
                              <button onClick={() => setModalCaptura({ abierto: true, empleado: { ...empleado, incidencia } })} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs shadow-sm transition">
                                {incidencia ? "✏️ Editar" : "📝 Capturar"}
                              </button>
                            ) : (
                              <button onClick={() => setModalRevision({ abierto: true, registro: { empleado, incidencia } })} className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs shadow-sm transition">
                                🔍 Validar
                              </button>
                            )}
                          </td>
                        </tr>
                      </>
                    );
                  })
                )}
              </tbody>
              
              {/* 🔥 NUEVO: FOOTER CON TOTALES POR COLUMNA */}
              {columnasActivas.some(c => esCampoMonetario(c.campo)) && registrosFiltrados.length > 0 && (
                <tfoot className="bg-slate-800 text-white sticky bottom-0 z-20 border-t-2 border-slate-600">
                  <tr>
                    <td colSpan={5} className="p-3 font-bold text-sm text-right">
                      TOTALES ({registrosFiltrados.length} empleados)
                    </td>
                    {columnasActivas.map(col => {
                      const esMonet = esCampoMonetario(col.campo);
                      return (
                        <td key={col.campo} className={`p-3 text-right font-bold ${esMonet ? 'text-yellow-300' : ''}`}>
                          {esMonet ? formatearMoneda(totalesPorColumna[col.campo] || 0) : ""}
                        </td>
                      );
                    })}
                    {vistaActual === "rrhh" && <td></td>}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50 sticky bottom-0 z-30 shadow-[0_-2px_5px_-2px_rgba(0,0,0,0.05)]">
              <div className="text-xs text-slate-600">Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong></div>
              <div className="flex gap-1">
                <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">← Anterior</button>
                <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">Siguiente →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTÓN VOLVER ARRIBA */}
      {mostrarBotonArriba && !pantallaCompleta && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="fixed bottom-6 right-6 bg-slate-800 hover:bg-slate-900 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all z-40 opacity-80 hover:opacity-100 hover:scale-110 animate-fade-in" title="Volver arriba">↑</button>
      )}

      {/* 🔥 MODAL DE SEGMENTOS CON FILTROS POR DEPARTAMENTO Y PUESTO */}
      {modalSegmento.abierto && (
        <ModalSegmento
          tipo={modalSegmento.tipo}
          titulo={modalSegmento.titulo}
          icono={modalSegmento.icono}
          color={modalSegmento.color}
          columnas={modalSegmento.tipo === "bonos" ? segmentosMonetarios.bonos : modalSegmento.tipo === "deducciones" ? segmentosMonetarios.deducciones : segmentosMonetarios.percepciones}
          registros={registros}
          todosLosEmpleados={empleados}
          guardando={guardando}
          onGuardar={guardarAjustesSegmento}
          onCerrar={() => setModalSegmento({ abierto: false, tipo: null, titulo: "", icono: "", color: "" })}
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col scroll-smooth">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold text-slate-800">🔒 Permisos de Captura</h3><p className="text-xs text-gray-500">Marca qué campos puede llenar el supervisor</p></div>
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
                  {permisosSupervisor[col.campo] ? <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">👷 Supervisor</span> : <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-bold">🔒 Solo RH</span>}
                </label>
              ))}
              {columnasDelMapeo.length === 0 && <div className="text-center text-gray-500 py-8">No hay columnas mapeadas a incidencias.</div>}
            </div>
            <div className="pt-3 border-t flex justify-end gap-2">
              <button onClick={() => setModalPermisos(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
              <button onClick={guardarPermisos} disabled={guardandoPermisos} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-amber-300">{guardandoPermisos ? "Guardando..." : "💾 Guardar Permisos"}</button>
            </div>
          </div>
        </div>
      )}

      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto scroll-smooth">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold text-slate-800">⚙️ Columnas de Incidencias</h3><p className="text-xs text-gray-500">Arrastra para reordenar</p></div>
              <button onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {columnasDelMapeo.map(col => {
                const idx = ordenColumnas.indexOf(col.campo);
                return (
                  <div key={col.campo} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', col.campo); e.currentTarget.classList.add('opacity-40'); }} onDragEnd={(e) => { e.currentTarget.classList.remove('opacity-40', 'ring-2', 'ring-blue-400'); }} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-400'); }} onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-400'); }} onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-blue-400'); const campoArrastrado = e.dataTransfer.getData('text/plain'); if (campoArrastrado !== col.campo) { setOrdenColumnas(prev => { const nuevo = prev.filter(c => c !== campoArrastrado); nuevo.splice(nuevo.indexOf(col.campo), 0, campoArrastrado); return nuevo; }); } }} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 cursor-move">
                    <div className="text-slate-400 cursor-grab select-none">⋮⋮</div>
                    <div className="bg-slate-200 text-slate-700 text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">{idx + 1}</div>
                    <input type="checkbox" checked={columnasVisibles[col.campo] !== false} onChange={(e) => { e.stopPropagation(); cambiarVisibilidadColumna(col.campo); }} className="w-4 h-4 text-blue-600 rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-700 text-sm truncate flex items-center gap-2">{col.etiqueta}{col.permite_supervisor && <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">👷</span>}</div>
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

// 🔥 NUEVO: MODAL DE SEGMENTOS CON FILTROS POR DEPARTAMENTO Y PUESTO
function ModalSegmento({ tipo, titulo, icono, color, columnas, registros, todosLosEmpleados, guardando, onGuardar, onCerrar }) {
  // 🔥 Filtros internos del modal
  const [filtroDepto, setFiltroDepto] = useState("TODOS");
  const [filtroPuesto, setFiltroPuesto] = useState("TODOS");
  const [busquedaInterna, setBusquedaInterna] = useState("");

  const [valoresRH, setValoresRH] = useState(() => {
    const init = {};
    registros.forEach(r => {
      if (r.incidencia) {
        init[r.empleado.id] = {};
        columnas.forEach(col => {
          init[r.empleado.id][col.campo] = r.incidencia[col.campo] ?? 0;
        });
      }
    });
    return init;
  });

  const colorClasses = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", btn: "bg-emerald-600 hover:bg-emerald-700" },
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", btn: "bg-red-600 hover:bg-red-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", btn: "bg-blue-600 hover:bg-blue-700" },
  }[color];

  // 🔥 Departamentos únicos
  const departamentosUnicos = useMemo(() => {
    return ["TODOS", ...new Set(todosLosEmpleados.map(e => e.departamentos?.nombre).filter(Boolean))].sort();
  }, [todosLosEmpleados]);

  // 🔥 Puestos filtrados por departamento
  const puestosUnicos = useMemo(() => {
    const empleadosFiltradosPorDepto = filtroDepto === "TODOS" 
      ? todosLosEmpleados 
      : todosLosEmpleados.filter(e => (e.departamentos?.nombre || "Sin Departamento") === filtroDepto);
    return ["TODOS", ...new Set(empleadosFiltradosPorDepto.map(e => e.puestos?.nombre).filter(Boolean))].sort();
  }, [todosLosEmpleados, filtroDepto]);

  // 🔥 Registros filtrados dentro del modal
  const registrosFiltradosModal = useMemo(() => {
    const texto = busquedaInterna.toLowerCase().trim();
    return registros.filter(r => {
      const emp = r.empleado;
      const coincideTexto = !texto || [emp.nombre_completo, emp.numero_empleado, emp.puestos?.nombre]
        .some(c => String(c || "").toLowerCase().includes(texto));
      const coincideDepto = filtroDepto === "TODOS" || emp.departamentos?.nombre === filtroDepto;
      const coincidePuesto = filtroPuesto === "TODOS" || emp.puestos?.nombre === filtroPuesto;
      return coincideTexto && coincideDepto && coincidePuesto;
    });
  }, [registros, filtroDepto, filtroPuesto, busquedaInterna]);

  // 🔥 Totales del modal (sobre registros filtrados)
  const totales = useMemo(() => {
    const totalesPorCampo = {};
    let totalGeneral = 0;
    columnas.forEach(col => { totalesPorCampo[col.campo] = 0; });
    
    registrosFiltradosModal.forEach(r => {
      if (r.incidencia) {
        columnas.forEach(col => {
          const val = Number(valoresRH[r.empleado.id]?.[col.campo] || 0);
          totalesPorCampo[col.campo] += val;
          totalGeneral += val;
        });
      }
    });
    return { totalesPorCampo, totalGeneral };
  }, [valoresRH, columnas, registrosFiltradosModal]);

  const handleGuardar = () => {
    const ajustes = registrosFiltradosModal
      .filter(r => r.incidencia)
      .map(r => ({
        incidenciaId: r.incidencia.id,
        valores: valoresRH[r.empleado.id] || {}
      }));
    
    if (ajustes.length === 0) {
      alert("No hay registros con incidencias para guardar en este filtro.");
      return;
    }
    
    if (!window.confirm(`¿Guardar ajustes para ${ajustes.length} empleados?`)) return;
    onGuardar(ajustes);
  };

  const aplicarATodos = (campo, valor) => {
    const nuevosValores = { ...valoresRH };
    registrosFiltradosModal.forEach(r => {
      if (r.incidencia) {
        nuevosValores[r.empleado.id] = { ...nuevosValores[r.empleado.id], [campo]: valor };
      }
    });
    setValoresRH(nuevosValores);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className={`${colorClasses.bg} border-b ${colorClasses.border} px-6 py-4 rounded-t-2xl`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className={`text-xl font-bold ${colorClasses.text} flex items-center gap-2`}>
                <span className="text-2xl">{icono}</span> {titulo}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Revisa los valores del supervisor y ajusta los montos de RH. Filtra por departamento o puesto para gestión segmentada.
              </p>
            </div>
            <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700 font-bold text-2xl">✕</button>
          </div>

          {/* 🔥 FILTROS DEL MODAL */}
          <div className="mt-4 space-y-3">
            {/* Fila 1: Búsqueda */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Buscar empleado dentro de este segmento..." 
                value={busquedaInterna}
                onChange={(e) => setBusquedaInterna(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
              />
            </div>

            {/* Fila 2: Chips de Departamento */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-2">
                <span>🏢</span> Departamento
                {filtroDepto !== "TODOS" && (
                  <button onClick={() => { setFiltroDepto("TODOS"); setFiltroPuesto("TODOS"); }} className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-200">
                    ✕ Limpiar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {departamentosUnicos.map(depto => {
                  const count = depto === "TODOS" 
                    ? registros.filter(r => r.incidencia).length
                    : registros.filter(r => r.incidencia && r.empleado.departamentos?.nombre === depto).length;
                  const activo = filtroDepto === depto;
                  return (
                    <button
                      key={depto}
                      onClick={() => { setFiltroDepto(depto); setFiltroPuesto("TODOS"); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                        activo 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                          : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                      }`}
                    >
                      {depto === "TODOS" ? "🌐 Todos" : depto}
                      <span className={`ml-1 px-1 py-0.5 rounded-full text-[9px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fila 3: Chips de Puesto (solo si hay depto seleccionado) */}
            {filtroDepto !== "TODOS" && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-2">
                  <span>💼</span> Puesto en <span className="text-indigo-600">{filtroDepto}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {puestosUnicos.map(puesto => {
                    const count = puesto === "TODOS"
                      ? registros.filter(r => r.incidencia && r.empleado.departamentos?.nombre === filtroDepto).length
                      : registros.filter(r => r.incidencia && r.empleado.departamentos?.nombre === filtroDepto && r.empleado.puestos?.nombre === puesto).length;
                    const activo = filtroPuesto === puesto;
                    return (
                      <button
                        key={puesto}
                        onClick={() => setFiltroPuesto(puesto)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                          activo 
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                            : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                        }`}
                      >
                        {puesto === "TODOS" ? "🌐 Todos" : puesto}
                        <span className={`ml-1 px-1 py-0.5 rounded-full text-[9px] ${activo ? "bg-white/20" : "bg-slate-100"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabla de gestión */}
        <div className="flex-1 overflow-auto bg-white">
          {registrosFiltradosModal.filter(r => r.incidencia).length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-3">📭</div>
              <div className="text-slate-500 font-semibold">No hay registros con incidencias en este filtro</div>
              <div className="text-xs text-slate-400 mt-1">Ajusta los filtros o cambia de departamento</div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left font-bold text-slate-700 sticky left-0 bg-slate-100 z-20">Empleado</th>
                  <th className="p-3 text-left font-bold text-slate-700">🏢 Depto</th>
                  <th className="p-3 text-left font-bold text-slate-700">💼 Puesto</th>
                  {columnas.map(col => (
                    <th key={col.campo} className="p-3 text-center font-bold text-slate-700">
                      <div className="text-xs">{col.etiqueta}</div>
                      <button
                        onClick={() => {
                          const valor = prompt(`Aplicar valor a TODOS los empleados filtrados (${registrosFiltradosModal.filter(r => r.incidencia).length}) para "${col.etiqueta}":`, "0");
                          if (valor !== null) aplicarATodos(col.campo, Number(valor) || 0);
                        }}
                        className="text-[9px] text-blue-600 hover:text-blue-800 underline mt-0.5"
                        title="Aplicar este valor a todos los empleados filtrados"
                      >
                        aplicar a todos
                      </button>
                    </th>
                  ))}
                  <th className="p-3 text-center font-bold text-slate-700 bg-purple-50 sticky right-0 bg-purple-50 z-10">Total</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltradosModal.filter(r => r.incidencia).map(({ empleado, incidencia }) => (
                  <tr key={empleado.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 sticky left-0 bg-white z-10">
                      <div className="font-semibold text-slate-800 text-xs">{empleado.nombre_completo}</div>
                      <div className="text-[10px] text-slate-500">#{empleado.numero_empleado}</div>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {empleado.departamentos?.nombre || "N/A"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {empleado.puestos?.nombre || "N/A"}
                      </span>
                    </td>
                    {columnas.map(col => {
                      const valSupervisor = incidencia[col.campo] ?? 0;
                      const valRH = valoresRH[empleado.id]?.[col.campo] ?? 0;
                      const diferencia = Number(valRH) - Number(valSupervisor);
                      return (
                        <td key={col.campo} className="p-2 text-center">
                          <div className="space-y-1">
                            <div className="text-[10px] text-slate-400">Sup: ${Number(valSupervisor).toFixed(2)}</div>
                            <input
                              type="number"
                              step="0.01"
                              value={valRH}
                              onChange={(e) => setValoresRH(prev => ({
                                ...prev,
                                [empleado.id]: { ...prev[empleado.id], [col.campo]: e.target.value }
                              }))}
                              className={`w-20 border rounded px-2 py-1 text-xs text-center font-semibold outline-none focus:ring-2 focus:ring-blue-500 ${diferencia !== 0 ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                            />
                            {diferencia !== 0 && (
                              <div className={`text-[9px] font-bold ${diferencia > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {diferencia > 0 ? '+' : ''}{diferencia.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center bg-purple-50/50 font-bold text-purple-900 sticky right-0 bg-purple-50 z-10">
                      ${columnas.reduce((acc, col) => acc + Number(valoresRH[empleado.id]?.[col.campo] || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-800 text-white sticky bottom-0">
                <tr>
                  <td colSpan={3} className="p-3 font-bold sticky left-0 bg-slate-800 z-10">
                    TOTALES ({registrosFiltradosModal.filter(r => r.incidencia).length} empleados)
                  </td>
                  {columnas.map(col => (
                    <td key={col.campo} className="p-3 text-center font-bold">
                      ${totales.totalesPorCampo[col.campo].toFixed(2)}
                    </td>
                  ))}
                  <td className="p-3 text-center font-black text-xl text-yellow-300 sticky right-0 bg-slate-800 z-10">
                    ${totales.totalGeneral.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-between items-center">
          <div className="text-xs text-slate-600">
            <strong>{registrosFiltradosModal.filter(r => r.incidencia).length}</strong> de <strong>{registros.filter(r => r.incidencia).length}</strong> empleados visibles · <strong>{columnas.length}</strong> campos
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-100">Cancelar</button>
            <button onClick={handleGuardar} disabled={guardando} className={`${colorClasses.btn} text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2`}>
              {guardando ? "⏳ Guardando..." : `💾 Guardar ${titulo}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// KPI MODERNO
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

// MODAL CAPTURA SUPERVISOR
function ModalCaptura({ empleado, columnas, guardando, onGuardar, onCerrar }) {
  const [valores, setValores] = useState(() => {
    const init = {};
    columnas.forEach(col => { init[col.campo] = empleado.incidencia?.[col.campo] ?? 0; });
    return init;
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(empleado.id, valores); }} className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col scroll-smooth">
        <div className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold">📝 Captura de Incidencias</h3>
              <p className="text-xs text-white/90 mt-0.5"><strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre} · {empleado.puestos?.nombre}</p>
            </div>
            <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl">✕</button>
          </div>
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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-center">⚠️ RH no ha habilitado campos para captura. Solicita permisos.</div>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onCerrar} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold">Cancelar</button>
          <button type="submit" disabled={guardando || columnas.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-blue-300">{guardando ? "Guardando..." : "📝 Enviar a RH"}</button>
        </div>
      </form>
    </div>
  );
}

// MODAL REVISIÓN RH
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
  const totalSumas = columnas.filter(c => esCampoMonetario(c.campo) && !esDeduccion(c.campo)).reduce((acc, c) => acc + Number(valores[c.campo] || 0), 0);
  const totalRestas = columnas.filter(c => esCampoMonetario(c.campo) && esDeduccion(c.campo)).reduce((acc, c) => acc + Number(valores[c.campo] || 0), 0);
  const neto = totalSumas - totalRestas;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(incidencia?.id, valores, estadoFinal, comentario); }} className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl max-h-[95vh] flex flex-col scroll-smooth">
        <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold">🔍 Validación de RH</h3>
              <p className="text-xs text-white/90 mt-0.5"><strong>{empleado.nombre_completo}</strong> · {empleado.departamentos?.nombre} · {empleado.puestos?.nombre}</p>
            </div>
            <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white font-bold text-2xl">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {["pendiente", "aprobado", "rechazado"].map(est => (
              <button key={est} type="button" onClick={() => setEstadoFinal(est)} className={`p-3 rounded-xl font-bold text-sm border-2 transition ${estadoFinal === est ? (est === "aprobado" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : est === "rechazado" ? "bg-red-100 border-red-500 text-red-800" : "bg-amber-100 border-amber-500 text-amber-800") : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                {est === "pendiente" ? "⏳ Pendiente" : est === "aprobado" ? "✅ Aprobar" : "❌ Rechazar"}
              </button>
            ))}
          </div>
          {columnasSup.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">👷 Propuesta del Supervisor ({columnasSup.length})</h4>
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
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">💬 Observaciones de RH</label>
            <textarea rows="3" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: Ajustado según reloj checador..." className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>
        <div className="border-t bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 rounded-b-2xl">
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
            <button type="submit" disabled={guardando} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:bg-purple-300">{guardando ? "Guardando..." : `💾 Guardar como ${estadoFinal.toUpperCase()}`}</button>
          </div>
        </div>
      </form>
    </div>
  );
}