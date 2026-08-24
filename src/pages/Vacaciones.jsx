import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[.,;:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizar = (texto) => {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [reglasGlobales, setReglasGlobales] = useState({});
  const [puestosLista, setPuestosLista] = useState([]);
  const [departamentosLista, setDepartamentosLista] = useState([]);
  
  const [anoReglaInput, setAnoReglaInput] = useState(1);
  const [diasReglaInput, setDiasReglaInput] = useState("");
  const [reglasExpandidas, setReglasExpandidas] = useState(false);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState("PAB");

  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [mapaColumnas, setMapaColumnas] = useState({});
  
  const [archivoVacaciones, setArchivoVacaciones] = useState(null);
  const [datosImportados, setDatosImportados] = useState([]);
  const [modoRevision, setModoRevision] = useState(false);

  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [deptoExpandido, setDeptoExpandido] = useState({});

  const [empleadoKardex, setEmpleadoKardex] = useState(null);
  const [vistaActual, setVistaActual] = useState("rrhh");
  
  const [formKardex, setFormKardex] = useState({
    fecha_inicio: "", fecha_fin: "", dias_solicitados: "",
    nomina_impactada: "", tipo_vacaciones: "TOMADAS_Y_PAGADAS", observaciones: "",
  });

  const [reciboData, setReciboData] = useState(null);

  useEffect(() => {
    const inicializar = async () => {
      await cargarConfiguracionMapeo();
      await cargarReglasGlobales();
      await cargarCatalogos();
      await cargarEmpleados();
      await cargarVacaciones();
    };
    inicializar();
  }, []);

  const cargarConfiguracionMapeo = async () => {
    try {
      const { data } = await supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle();
      if (data?.configuracion) setConfiguracionMapeo(data.configuracion);
      else {
        const local = localStorage.getItem("config_mapeo_columnas_dinamico");
        if (local) setConfiguracionMapeo(JSON.parse(local));
      }
    } catch (err) { console.error("Error cargando mapeo:", err); }
  };

  const cargarReglasGlobales = async () => {
    const { data, error } = await supabase.from("regla_vacaciones").select("*");
    if (!error && data) {
      const mapaReglas = {};
      data.forEach((item) => { mapaReglas[item.ano] = item.dias; });
      setReglasGlobales(mapaReglas);
    }
  };

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepts] = await Promise.all([
        supabase.from("puestos").select("*").order("nombre"),
        supabase.from("departamentos").select("*").order("nombre")
      ]);
      const puestosUnicos = new Map();
      (resPuestos.data || []).forEach((p) => {
        const nombre = String(p.nombre || "").trim();
        if (nombre && !puestosUnicos.has(nombre.toLowerCase())) puestosUnicos.set(nombre.toLowerCase(), { ...p, nombre });
      });
      setPuestosLista(Array.from(puestosUnicos.values()));
      setDepartamentosLista(resDepts.data || []);
    } catch (e) { console.error("Error cargando catálogos:", e); }
  };

  const cargarEmpleados = async () => {
    try {
      // 🔥 CONSULTA DINÁMICA: Usamos "*" para evitar errores por columnas hardcodeadas que no existan
      const { data: emps, error: errorEmps } = await supabase
        .from("empleados")
        .select("*")
        .eq("activo", true)
        .order("nombre_completo");

      if (errorEmps) {
        console.error("Error cargando empleados:", errorEmps);
        setEmpleados([]);
        return;
      }

      // 🔥 MAPEO DINÁMICO DE COLUMNAS (Igual que en Empleados.jsx)
      if (emps && emps.length > 0 && configuracionMapeo?.asignacion) {
        const columnasReales = Object.keys(emps[0]);
        const nuevoMapa = {};
        
        Object.values(configuracionMapeo.asignacion).forEach(info => {
          const nombreBuscado = info.esManual ? info.campoManual : info.campoDestino;
          if (!nombreBuscado) return;
          
          const nombreNormalizado = normalizar(nombreBuscado);
          if (columnasReales.includes(nombreBuscado)) { 
            nuevoMapa[nombreBuscado] = nombreBuscado; 
            return; 
          }
          
          const coincidencia = columnasReales.find(colReal => normalizar(colReal) === nombreNormalizado);
          if (coincidencia) { 
            nuevoMapa[nombreBuscado] = coincidencia; 
          } else {
            const parcial = columnasReales.find(colReal => {
              const colNorm = normalizar(colReal);
              return colNorm.includes(nombreNormalizado) || nombreNormalizado.includes(colNorm);
            });
            nuevoMapa[nombreBuscado] = parcial || nombreBuscado;
          }
        });
        setMapaColumnas(nuevoMapa);
      }

      let empleadosProcesados = (emps || []).map(emp => {
        let deptoObj = null;
        if (emp.departamento_id) deptoObj = departamentosLista.find(d => d.id === emp.departamento_id);
        if (!deptoObj && emp.departamento) deptoObj = { nombre: emp.departamento };
        if (!deptoObj) {
          const campoDeptoMapeado = mapaColumnas['departamento'] || Object.keys(mapaColumnas).find(k => k.includes('departamento'));
          if (campoDeptoMapeado && emp[campoDeptoMapeado]) deptoObj = { nombre: emp[campoDeptoMapeado] };
        }
        
        let puestoObj = null;
        if (emp.puesto_id) puestoObj = puestosLista.find(p => p.id === emp.puesto_id);
        if (!puestoObj && emp.puesto) puestoObj = { nombre: emp.puesto };
        if (!puestoObj) {
          const campoPuestoMapeado = mapaColumnas['puesto'] || Object.keys(mapaColumnas).find(k => k.includes('puesto'));
          if (campoPuestoMapeado && emp[campoPuestoMapeado]) puestoObj = { nombre: emp[campoPuestoMapeado] };
        }
        
        return { ...emp, departamentos: deptoObj, puestos: puestoObj };
      });

      setEmpleados(empleadosProcesados);
      
      if (empleadosProcesados.length > 0 && !empleadoKardex) {
        const emp = empleadosProcesados[0];
        const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
        const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
        setEmpleadoKardex({ empleado: emp, antiguedad, resumen });
      }
    } catch (err) { 
      console.error("Excepción en cargarEmpleados:", err); 
      setEmpleados([]); 
    }
  };

  const cargarVacaciones = async () => {
    try {
      const { data, error } = await supabase.from("vacaciones").select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso)").order("created_at", { ascending: false });
      if (!error) setVacaciones(data || []);
    } catch (err) { console.error("Error cargando vacaciones:", err); }
  };

  const calcularAntiguedad = (fechaIngresoStr) => {
    if (!fechaIngresoStr) return { anosCumplidos: 0, texto: "Sin fecha" };
    const dias = Math.floor((new Date() - new Date(fechaIngresoStr)) / (1000 * 60 * 60 * 24));
    const anos = Math.floor(dias / 365);
    return { anosCumplidos: anos, texto: anos === 0 ? "< 1 año" : `${anos} año(s)` };
  };

  const obtenerResumenEmpleado = (empleadoId, fechaIngresoStr) => {
    const anos = calcularAntiguedad(fechaIngresoStr).anosCumplidos;
    const diasCorrespondientes = Number(reglasGlobales[anos] || 0);
    const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(empleadoId) && v.estatus === "APROBADO");
    const diasTomados = solicitudesAprobadas.reduce((acc, curr) => acc + Number(curr.dias_solicitados || 0), 0);
    return { diasCorrespondientes, diasTomados, diasRemanentes: diasCorrespondientes - diasTomados, solicitudesAprobadas };
  };

  const generarRecibo = (empleado, diasSolicitados, fechaInicio, fechaFin) => {
    const antiguedad = calcularAntiguedad(empleado.fecha_ingreso);
    const resumen = obtenerResumenEmpleado(empleado.id, empleado.fecha_ingreso);
    const diasSol = Number(diasSolicitados) || 0;
    
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    const fechaRegresoDate = new Date(fechaFinDate);
    fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);
    
    setReciboData({
      empleado, antiguedad, resumen, diasSolicitados: diasSol,
      fechaInicio, fechaFin,
      fechaRegreso: fechaRegresoDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      diasPendientesDespues: Math.max(0, resumen.diasRemanentes - diasSol),
      fechaEmision: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      periodoInicio: fechaInicioDate.getFullYear(),
      periodoFin: fechaFinDate.getFullYear(),
      mesInicio: fechaInicioDate.toLocaleString('es-MX', { month: 'long' }),
      mesFin: fechaFinDate.toLocaleString('es-MX', { month: 'long' }),
      diaInicio: fechaInicioDate.getDate(),
      diaFin: fechaFinDate.getDate(),
      anoInicio: fechaInicioDate.getFullYear(),
      anoFin: fechaFinDate.getFullYear()
    });
  };

  const empleadosAgrupados = useMemo(() => {
    if (!Array.isArray(empleados)) return {};
    
    const filtrados = empleados.filter(e => {
      if (vistaActual === 'rrhh' && empresaSeleccionada !== "TODAS") {
        const empEmpresa = (e.empresa || "").toUpperCase();
        if (empresaSeleccionada === "PAB" && !empEmpresa.includes("PLASTICO") && !empEmpresa.includes("BAJIO")) return false;
        if (empresaSeleccionada === "SHERGON" && !empEmpresa.includes("SHERGON")) return false;
      }
      return !busquedaActiva || String(e.id) === String(empleadoSeleccionadoId);
    });

    const agrupado = {};
    filtrados.forEach(emp => {
      const depto = emp.departamentos?.nombre || "Sin Departamento";
      const puesto = emp.puestos?.nombre || "Sin Puesto";
      if (!agrupado[depto]) agrupado[depto] = {};
      if (!agrupado[depto][puesto]) agrupado[depto][puesto] = [];
      agrupado[depto][puesto].push(emp);
    });
    return agrupado;
  }, [empleados, busquedaActiva, empleadoSeleccionadoId, vistaActual, empresaSeleccionada]);

  const toggleDepto = (depto) => setDeptoExpandido(prev => ({ ...prev, [depto]: !prev[depto] }));

  const guardarReglaGlobal = async () => {
    if (diasReglaInput === "" || Number(diasReglaInput) < 0) return alert("Cantidad inválida");
    const { error } = await supabase.from("regla_vacaciones").upsert({ ano: Number(anoReglaInput), dias: Number(diasReglaInput) }, { onConflict: "ano" });
    if (!error) {
      setReglasGlobales(prev => ({ ...prev, [anoReglaInput]: Number(diasReglaInput) }));
      setDiasReglaInput("");
      alert("Regla actualizada");
    }
  };

  const agregarDesdeKardex = async () => {
    if (!empleadoKardex || !formKardex.fecha_inicio || !formKardex.dias_solicitados) return alert("Completa los campos obligatorios");
    const { error } = await supabase.from("vacaciones").insert([{ empleado_id: empleadoKardex.empleado.id, ...formKardex, estatus: "APROBADO" }]);
    if (!error) {
      setFormKardex({ fecha_inicio: "", fecha_fin: "", dias_solicitados: "", nomina_impactada: "", tipo_vacaciones: "TOMADAS_Y_PAGADAS", observaciones: "" });
      await cargarVacaciones();
      const antiguedad = calcularAntiguedad(empleadoKardex.empleado.fecha_ingreso);
      const resumen = obtenerResumenEmpleado(empleadoKardex.empleado.id, empleadoKardex.empleado.fecha_ingreso);
      setEmpleadoKardex({ empleado: empleadoKardex.empleado, antiguedad, resumen });
    }
  };

  const cambiarEstatusVacacion = async (vacacion, nuevoEstatus) => {
    if (!window.confirm(`¿Cambiar a ${nuevoEstatus}?`)) return;
    await supabase.from("vacaciones").update({ estatus: nuevoEstatus }).eq("id", vacacion.id);
    await cargarVacaciones();
  };

  const sugerenciasEmpleados = empleados.filter(emp => {
    const q = busquedaTexto.toLowerCase();
    return (emp.nombre_completo || "").toLowerCase().includes(q) || (emp.numero_empleado || "").toString().toLowerCase().includes(q);
  });

  const esSupervisor = vistaActual === 'supervisor';
  const empEmpresa = (empleadoKardex?.empleado?.empresa || "").toUpperCase();
  const esShergon = empEmpresa.includes("SHERGON") || (vistaActual === 'rrhh' && empresaSeleccionada === "SHERGON");
  
  const nombreEmpresaCorto = esSupervisor ? "EMPRESA" : (esShergon ? "SHERGON" : "PLÁSTICOS AMBIENTALES DEL BAJIO");
  const nombreEmpresaLargo = esSupervisor ? "NOMBRE DE LA EMPRESA" : (esShergon ? "SHERGON S.A. DE C.V." : "PLÁSTICOS AMBIENTALES DEL BAJÍO S.A. DE C.V.");

  return (
    <Layout>
      <div className="space-y-6 print:hidden">
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">🏖️ Control de Vacaciones</h1>
            <p className="text-slate-500">Sincronizado dinámicamente con la base de datos de Empleados</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setVistaActual(vistaActual === 'rrhh' ? 'supervisor' : 'rrhh')} className="text-xs bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-300">
              👁️ Vista: {vistaActual === 'rrhh' ? 'Recursos Humanos' : 'Supervisor'}
            </button>
            <button onClick={cargarEmpleados} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-200">
              🔄 Recargar
            </button>
          </div>
        </div>

        {vistaActual === 'rrhh' && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-wrap items-center gap-4">
            <span className="text-sm font-bold text-blue-800">🏢 Contexto de Empresa (Exclusivo RH):</span>
            <select 
              value={empresaSeleccionada} 
              onChange={(e) => setEmpresaSeleccionada(e.target.value)}
              className="border border-blue-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="PAB">PLÁSTICOS AMBIENTALES DEL BAJIO (PAB)</option>
              <option value="SHERGON">SHERGON</option>
              <option value="TODAS">TODAS LAS EMPRESAS</option>
            </select>
            <p className="text-xs text-blue-600 ml-auto">Esta selección filtra la vista y se usa en los recibos. Los supervisores no ven esta opción.</p>
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-4">
          <KpiCard titulo="Pendientes" valor={vacaciones.filter(v => v.estatus === "PENDIENTE").length} icono="⏳" color="text-amber-600" />
          <KpiCard titulo="Aprobadas" valor={vacaciones.filter(v => v.estatus === "APROBADO").length} icono="✅" color="text-green-600" />
          <KpiCard titulo="Rechazadas" valor={vacaciones.filter(v => v.estatus === "RECHAZADO").length} icono="❌" color="text-red-600" />
          <KpiCard titulo="Días Totales" valor={vacaciones.filter(v => v.estatus === "APROBADO").reduce((a, b) => a + Number(b.dias_solicitados || 0), 0)} icono="🗓️" color="text-blue-600" />
        </div>

        {empleados.length === 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center">
            <h3 className="text-xl font-bold text-amber-800 mb-2">⚠️ No hay empleados registrados</h3>
            <p className="text-amber-700 mb-4">Asegúrate de haber importado la nómina desde el módulo de Empleados.</p>
          </div>
        )}

        <div className="bg-slate-800 text-white rounded-2xl shadow-xl overflow-hidden">
          <button 
            onClick={() => setReglasExpandidas(!reglasExpandidas)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700 transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <div className="text-left">
                <h2 className="text-lg font-bold">Reglas Globales por Antigüedad</h2>
                <p className="text-xs text-slate-300">
                  {Object.keys(reglasGlobales).length} reglas configuradas · Click para {reglasExpandidas ? 'ocultar' : 'editar'}
                </p>
              </div>
            </div>
            <span className="text-2xl transition-transform" style={{ transform: reglasExpandidas ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
          
          {reglasExpandidas && (
            <div className="px-6 py-4 border-t border-slate-700 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Año de Antigüedad</label>
                  <select value={anoReglaInput} onChange={(e) => { setAnoReglaInput(Number(e.target.value)); setDiasReglaInput(reglasGlobales[Number(e.target.value)] ?? ""); }} className="bg-slate-700 border border-slate-600 rounded-lg p-2 text-sm w-40">
                    {Array.from({ length: 51 }, (_, i) => <option key={i} value={i}>{i === 0 ? "Año 0 (< 1 año)" : `Año ${i}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Días Correspondientes</label>
                  <input type="number" value={diasReglaInput} onChange={(e) => setDiasReglaInput(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg p-2 text-sm w-32" />
                </div>
                <button onClick={guardarReglaGlobal} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-semibold">Guardar Regla</button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                {Object.entries(reglasGlobales).sort(([a], [b]) => Number(a) - Number(b)).map(([ano, dias]) => (
                  <span key={ano} className="bg-slate-700 text-xs px-2 py-1 rounded border border-slate-600">Año {ano}: <strong>{dias} días</strong></span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">📋 Listado de Empleados</h2>
          <div className="space-y-4">
            {Object.keys(empleadosAgrupados).length === 0 ? (
              <p className="text-center text-gray-500 py-8">No se encontraron empleados.</p>
            ) : (
              Object.entries(empleadosAgrupados).map(([depto, puestos]) => (
                <div key={depto} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => toggleDepto(depto)} className="w-full bg-slate-100 hover:bg-slate-200 p-3 flex justify-between items-center transition">
                    <span className="font-bold text-slate-800 flex items-center gap-2">{deptoExpandido[depto] ? "📂" : "📁"} {depto}</span>
                    <span className="text-xs bg-slate-300 text-slate-700 px-2 py-1 rounded-full">{Object.values(puestos).flat().length} empleados</span>
                  </button>
                  {deptoExpandido[depto] && (
                    <div className="divide-y divide-slate-100">
                      {Object.entries(puestos).map(([puesto, emps]) => (
                        <div key={puesto}>
                          <div className="bg-blue-50 px-4 py-2 text-xs font-bold text-blue-800 uppercase tracking-wide">{puesto}</div>
                          <table className="w-full text-sm">
                            <thead className="bg-white text-slate-500">
                              <tr>
                                <th className="p-3 text-left">Empleado</th>
                                <th className="p-3 text-center">Antigüedad</th>
                                <th className="p-3 text-center">Días Ley</th>
                                <th className="p-3 text-center">Descontados</th>
                                <th className="p-3 text-center">Remanentes</th>
                                <th className="p-3 text-center">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emps.map((emp) => {
                                const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
                                const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
                                return (
                                  <tr key={emp.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-medium">{emp.nombre_completo} <span className="text-xs text-gray-400">(#{emp.numero_empleado})</span></td>
                                    <td className="p-3 text-center text-slate-600">{antiguedad.texto}</td>
                                    <td className="p-3 text-center font-semibold text-blue-600">{resumen.diasCorrespondientes}</td>
                                    <td className="p-3 text-center font-semibold text-amber-600">{resumen.diasTomados}</td>
                                    <td className="p-3 text-center">
                                      <span className={`font-bold px-2 py-1 rounded-full text-xs ${resumen.diasRemanentes < 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{resumen.diasRemanentes}</span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <button 
                                        onClick={() => {
                                          const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
                                          const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
                                          setEmpleadoKardex({ empleado: emp, antiguedad, resumen });
                                        }} 
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${empleadoKardex?.empleado.id === emp.id ? 'bg-blue-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                      >
                                        👁️ {empleadoKardex?.empleado.id === emp.id ? 'Seleccionado' : 'Ver'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {reciboData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] print:static print:bg-white print:p-0">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-8 max-h-[95vh] overflow-y-auto print:shadow-none print:max-h-none print:w-full print:p-4">
              <div className="border-2 border-black p-4 mb-6">
                <h3 className="font-bold text-sm mb-3 uppercase">DATOS DE CAPTURA</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs font-bold">NOMBRE:</p>
                    <p className="font-bold bg-blue-50 p-1">{reciboData.empleado.nombre_completo}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-bold"># PROVEEDOR:</p>
                    <p className="font-bold bg-yellow-200 p-1">{reciboData.empleado.numero_empleado}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Fecha Ingreso:</p>
                    <p className="bg-blue-50 p-1 text-center">{reciboData.empleado.fecha_ingreso || "N/A"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs font-bold">Años de Servicio:</p>
                      <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.antiguedad.anosCumplidos}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Días pendientes:</p>
                      <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen.diasRemanentes}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Días que Corresponden:</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen.diasCorrespondientes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Días a Disfrutar:</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diasSolicitados}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-bold">Nombre de la Empresa:</p>
                    {esSupervisor ? (
                      <p className="font-bold bg-slate-100 p-1 text-slate-400">[OCULTO PARA SUPERVISORES]</p>
                    ) : (
                      <p className="font-bold bg-blue-50 p-1">{nombreEmpresaLargo}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-2 border-black p-6">
                <div className="text-center mb-4">
                  <h1 className="text-xl font-black uppercase">{nombreEmpresaCorto}</h1>
                  <h2 className="text-lg font-bold mt-2">SOLICITUD Y AUTORIZACION DE</h2>
                  <h2 className="text-lg font-bold">VACACIONES</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  {!esSupervisor && (
                    <div className="col-span-2">
                      <p className="text-xs font-bold">Nombre de la Empresa: <span className="font-normal">{nombreEmpresaLargo}</span></p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold">Área y/ p Departamento:</p>
                    <p className="bg-blue-50 p-1">{reciboData.empleado.departamentos?.nombre || ""}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">No de Empleado:</p>
                    <p className="bg-blue-50 p-1 text-center">{reciboData.empleado.numero_empleado}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Nombre del Empleado:</p>
                    <p className="bg-blue-50 p-1 font-bold">{reciboData.empleado.nombre_completo}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Fecha de Ingreso:</p>
                    <p className="bg-blue-50 p-1">{reciboData.empleado.fecha_ingreso || "N/A"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mb-4 border-t border-b border-black py-2">
                  <div>
                    <p className="text-xs font-bold">Días que corresponden:</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen.diasCorrespondientes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Días a disfrutar:</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diasSolicitados}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Días Pendientes:</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen.diasRemanentes}</p>
                  </div>
                </div>

                <div className="border-t-2 border-black pt-4 mt-6">
                  <p className="text-xs font-bold mb-4">
                    POR EL PRESENTE EXPRESO MI CONFORMIDAD DE SOLICITAR Y GOZAR MIS VACACIONES DE ACUERDO A LO QUE ESTABLECE EL 
                    ARTICULO 76 DE LA LEY FEDERAL DEL TRABAJO.
                  </p>
                  
                  <div className="grid grid-cols-4 gap-4 text-center text-xs mt-8">
                    <div>
                      <p className="bg-blue-50 p-2 mb-2 font-bold">{reciboData.empleado.nombre_completo}</p>
                      <p className="font-bold">Firma de Conformidad<br/>del Empleado</p>
                    </div>
                    <div>
                      <p className="border-b border-black h-12 mb-2">&nbsp;</p>
                      <p className="font-bold">Firma de Autorización<br/>Líder</p>
                    </div>
                    <div>
                      <p className="border-b border-black h-12 mb-2">&nbsp;</p>
                      <p className="font-bold">Firma de Autorización<br/>Encargado</p>
                    </div>
                    <div>
                      <p className="border-b border-black h-12 mb-2">&nbsp;</p>
                      <p className="font-bold">Vo. Bo.<br/>Capital Humano</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 print:hidden">
                <button onClick={() => setReciboData(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold">Cerrar</button>
                <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold">🖨️ Imprimir / PDF</button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:static, .print\\:static * { visibility: visible; }
          .print\\:static { position: absolute; left: 0; top: 0; width: 100%; background: white; }
          @page { margin: 1cm; size: letter landscape; }
        }
      `}</style>
    </Layout>
  );
}