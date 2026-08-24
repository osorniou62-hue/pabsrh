import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/[.,;:()]/g, "").replace(/\s+/g, " ").trim();
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

  // 🔥 NUEVO: Estado para el Kardex de RH
  const [kardexData, setKardexData] = useState(null);
  
  // 🔥 NUEVO: Estado para el recibo y selección de empresa
  const [reciboData, setReciboData] = useState(null);
  const [empresaRecibo, setEmpresaRecibo] = useState("PAB");

  const [formKardex, setFormKardex] = useState({
    fecha_inicio: "", fecha_fin: "", dias_solicitados: "",
    nomina_impactada: "", tipo_vacaciones: "TOMADAS_Y_PAGADAS", observaciones: "",
  });

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
      const { data: emps, error: errorEmps } = await supabase.from("empleados").select("*").eq("activo", true).order("nombre_completo");
      if (errorEmps) { console.error("Error cargando empleados:", errorEmps); setEmpleados([]); return; }

      if (emps && emps.length > 0 && configuracionMapeo?.asignacion) {
        const columnasReales = Object.keys(emps[0]);
        const nuevoMapa = {};
        Object.values(configuracionMapeo.asignacion).forEach(info => {
          const nombreBuscado = info.esManual ? info.campoManual : info.campoDestino;
          if (!nombreBuscado) return;
          const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (columnasReales.includes(nombreBuscado)) { nuevoMapa[nombreBuscado] = nombreBuscado; return; }
          const coincidencia = columnasReales.find(colReal => colReal.toLowerCase().replace(/[^a-z0-9]/g, "") === nombreNormalizado);
          if (coincidencia) { nuevoMapa[nombreBuscado] = coincidencia; } 
          else {
            const parcial = columnasReales.find(colReal => {
              const colNorm = colReal.toLowerCase().replace(/[^a-z0-9]/g, "");
              return colNorm.includes(nombreNormalizado) || nombreNormalizado.includes(colNorm);
            });
            nuevoMapa[nombreBuscado] = parcial || nombreBuscado;
          }
        });
        setMapaColumnas(nuevoMapa);
      }

      let empleadosProcesados = (emps || []).map(emp => {
        let deptoObj = emp.departamento_id ? departamentosLista.find(d => d.id === emp.departamento_id) : null;
        if (!deptoObj && emp.departamento) deptoObj = { nombre: emp.departamento };
        let puestoObj = emp.puesto_id ? puestosLista.find(p => p.id === emp.puesto_id) : null;
        if (!puestoObj && emp.puesto) puestoObj = { nombre: emp.puesto };
        return { ...emp, departamentos: deptoObj, puestos: puestoObj };
      });
      setEmpleados(empleadosProcesados);
    } catch (err) { console.error("Excepción en cargarEmpleados:", err); setEmpleados([]); }
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

  // 🔥 FUNCIÓN: Abrir Kardex de RH para un empleado
  const abrirKardexRH = (emp) => {
    const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
    const solicitudesPendientes = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE");
    const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO");
    setKardexData({ empleado: emp, resumen, solicitudesPendientes, solicitudesAprobadas });
  };

  // 🔥 FUNCIÓN: Aprobar solicitud y abrir recibo
  const aprobarYGenerarRecibo = async (vacacionId, empresa) => {
    try {
      const { data: vacacionData, error } = await supabase
        .from("vacaciones")
        .update({ estatus: "APROBADO" })
        .eq("id", vacacionId)
        .select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso)")
        .single();

      if (error) throw error;

      await cargarVacaciones(); // Recargar lista
      
      // Preparar datos para el recibo
      const fechaInicioDate = new Date(vacionData.fecha_inicio);
      const fechaFinDate = new Date(vacionData.fecha_fin);
      const fechaRegresoDate = new Date(fechaFinDate);
      fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);

      setEmpresaRecibo(empresa); // Guardar la empresa seleccionada
      setReciboData({
        empleado: vacacionData.empleados,
        diasSolicitados: vacacionData.dias_solicitados,
        fechaInicio: vacacionData.fecha_inicio,
        fechaFin: vacacionData.fecha_fin,
        fechaRegreso: fechaRegresoDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        diaInicio: fechaInicioDate.getDate(),
        diaFin: fechaFinDate.getDate(),
        mesInicio: fechaInicioDate.toLocaleString('es-MX', { month: 'long' }),
        mesFin: fechaFinDate.toLocaleString('es-MX', { month: 'long' }),
        anoInicio: fechaInicioDate.getFullYear(),
        anoFin: fechaFinDate.getFullYear(),
        antiguedad: calcularAntiguedad(vacionData.empleados.fecha_ingreso),
        resumen: obtenerResumenEmpleado(vacionData.empleado_id, vacacionData.empleados.fecha_ingreso)
      });
      
      setKardexData(null); // Cerrar modal de kardex
    } catch (err) {
      alert("Error al aprobar: " + err.message);
    }
  };

  const rechazarSolicitud = async (vacacionId) => {
    if (!window.confirm("¿Rechazar esta solicitud?")) return;
    try {
      await supabase.from("vacaciones").update({ estatus: "RECHAZADO" }).eq("id", vacacionId);
      await cargarVacaciones();
      if (kardexData) {
        // Actualizar el kardex en pantalla
        const emp = kardexData.empleado;
        setKardexData({
          ...kardexData,
          solicitudesPendientes: kardexData.solicitudesPendientes.filter(v => v.id !== vacacionId)
        });
      }
    } catch (err) {
      alert("Error al rechazar: " + err.message);
    }
  };

  const empleadosAgrupados = useMemo(() => {
    if (!Array.isArray(empleados)) return {};
    const filtrados = empleados.filter(e => !busquedaActiva || String(e.id) === String(empleadoSeleccionadoId));
    const agrupado = {};
    filtrados.forEach(emp => {
      const depto = emp.departamentos?.nombre || "Sin Departamento";
      const puesto = emp.puestos?.nombre || "Sin Puesto";
      if (!agrupado[depto]) agrupado[depto] = {};
      if (!agrupado[depto][puesto]) agrupado[depto][puesto] = [];
      agrupado[depto][puesto].push(emp);
    });
    return agrupado;
  }, [empleados, busquedaActiva, empleadoSeleccionadoId]);

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

  const sugerenciasEmpleados = empleados.filter(emp => {
    const q = busquedaTexto.toLowerCase();
    return (emp.nombre_completo || "").toLowerCase().includes(q) || (emp.numero_empleado || "").toString().toLowerCase().includes(q);
  });

  // 🔥 Lógica dinámica del nombre de la empresa en el recibo
  const esPAB = (empresaRecibo || 'PAB') === 'PAB';
  const nombreEmpresaCorto = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJIO" : "SHERGON";
  const nombreEmpresaLargo = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJÍO S.A. DE C.V." : "SHERGON S.A. DE C.V.";

  return (
    <Layout>
      <div className="space-y-6 print:hidden">
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">🏖️ Control de Vacaciones (RH)</h1>
            <p className="text-slate-500">Gestión, aprobación de solicitudes y generación de recibos</p>
          </div>
          <button onClick={cargarEmpleados} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-200">
            🔄 Recargar Datos
          </button>
        </div>

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

        {/* Reglas Globales (Colapsable) */}
        <div className="bg-slate-800 text-white rounded-2xl shadow-xl overflow-hidden">
          <button onClick={() => setReglasExpandidas(!reglasExpandidas)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700 transition">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <div className="text-left">
                <h2 className="text-lg font-bold">Reglas Globales por Antigüedad</h2>
                <p className="text-xs text-slate-300">{Object.keys(reglasGlobales).length} reglas configuradas · Click para {reglasExpandidas ? 'ocultar' : 'editar'}</p>
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

        {/* Tabla de Empleados con Botón de Kardex */}
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
                                        onClick={() => abrirKardexRH(emp)} 
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700"
                                      >
                                        📋 Kardex y Solicitudes
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

        {/* 🔥 MODAL: KARDEX Y SOLICITUDES DE RH */}
        {kardexData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">📋 Kardex de Empleado</h3>
                  <p className="text-sm text-slate-600">{kardexData.empleado.nombre_completo} | {kardexData.empleado.puestos?.nombre} | {kardexData.empleado.departamentos?.nombre}</p>
                </div>
                <button onClick={() => setKardexData(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>

              {/* Resumen de Días */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div><span className="text-gray-500 text-xs block">Antigüedad</span><strong>{kardexData.antiguedad.texto}</strong></div>
                <div><span className="text-gray-500 text-xs block">Días por Ley</span><strong className="text-blue-600">{kardexData.resumen.diasCorrespondientes}</strong></div>
                <div><span className="text-gray-500 text-xs block">Descontados</span><strong className="text-amber-600">{kardexData.resumen.diasTomados}</strong></div>
                <div><span className="text-gray-500 text-xs block">Remanentes</span><strong className="text-emerald-600">{kardexData.resumen.diasRemanentes}</strong></div>
              </div>

              {/* Solicitudes Pendientes */}
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">⏳ Solicitudes Pendientes</h4>
              {kardexData.solicitudesPendientes.length === 0 ? (
                <p className="text-sm text-slate-500 mb-6 bg-slate-50 p-3 rounded-lg">No hay solicitudes pendientes para este empleado.</p>
              ) : (
                <div className="space-y-3 mb-6">
                  {kardexData.solicitudesPendientes.map(vac => (
                    <div key={vac.id} className="border border-amber-200 bg-amber-50 p-4 rounded-xl">
                      <div className="flex flex-wrap justify-between items-center gap-4 mb-3">
                        <div className="text-sm">
                          <span className="font-bold">Solicitado:</span> {vac.dias_solicitados} días 
                          <span className="mx-2">|</span> 
                          <span className="font-bold">Periodo:</span> {vac.fecha_inicio} al {vac.fecha_fin}
                        </div>
                        <div className="flex gap-2">
                          <select 
                            id={`empresa-${vac.id}`} 
                            defaultValue="PAB"
                            className="border rounded px-2 py-1 text-xs bg-white"
                          >
                            <option value="PAB">Emitir a nombre de: PAB</option>
                            <option value="SHERGON">Emitir a nombre de: SHERGON</option>
                          </select>
                          <button 
                            onClick={() => {
                              const empresa = document.getElementById(`empresa-${vac.id}`).value;
                              aprobarYGenerarRecibo(vac.id, empresa);
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ✅ Aprobar y Generar Recibo
                          </button>
                          <button 
                            onClick={() => rechazarSolicitud(vac.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ❌ Rechazar
                          </button>
                        </div>
                      </div>
                      {vac.observaciones && <p className="text-xs text-slate-600 bg-white p-2 rounded border"><strong>Obs:</strong> {vac.observaciones}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Historial Aprobado */}
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">✅ Historial Aprobado</h4>
              {kardexData.solicitudesAprobadas.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">Sin historial de vacaciones aprobadas.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">Fechas</th><th className="p-2">Días</th><th className="p-2">Acción</th></tr></thead>
                    <tbody>
                      {kardexData.solicitudesAprobadas.map(item => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2">{item.fecha_inicio} al {item.fecha_fin}</td>
                          <td className="p-2 text-center font-bold">{item.dias_solicitados}</td>
                          <td className="p-2 text-center">
                            <button 
                              onClick={() => {
                                const fechaInicioDate = new Date(item.fecha_inicio);
                                const fechaFinDate = new Date(item.fecha_fin);
                                const fechaRegresoDate = new Date(fechaFinDate);
                                fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);
                                setEmpresaRecibo("PAB"); // Default al ver histórico
                                setReciboData({
                                  empleado: kardexData.empleado,
                                  diasSolicitados: item.dias_solicitados,
                                  fechaInicio: item.fecha_inicio,
                                  fechaFin: item.fecha_fin,
                                  fechaRegreso: fechaRegresoDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
                                  diaInicio: fechaInicioDate.getDate(),
                                  diaFin: fechaFinDate.getDate(),
                                  mesInicio: fechaInicioDate.toLocaleString('es-MX', { month: 'long' }),
                                  mesFin: fechaFinDate.toLocaleString('es-MX', { month: 'long' }),
                                  anoInicio: fechaInicioDate.getFullYear(),
                                  anoFin: fechaFinDate.getFullYear(),
                                  antiguedad: calcularAntiguedad(kardexData.empleado.fecha_ingreso),
                                  resumen: obtenerResumenEmpleado(kardexData.empleado.id, kardexData.empleado.fecha_ingreso)
                                });
                                setKardexData(null);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-bold text-[10px]"
                            >
                              🖨️ Ver Recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🔥 MODAL: RECIBO DE VACACIONES CON SELECTOR DE EMPRESA */}
        {reciboData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[80] print:static print:bg-white print:p-0">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-8 max-h-[95vh] overflow-y-auto print:shadow-none print:max-h-none print:w-full print:p-4">
              
              {/* Selector de Empresa (Oculto al imprimir) */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg print:hidden">
                <label className="text-xs font-bold text-blue-800 block mb-1">🏢 Seleccionar Empresa para el Recibo:</label>
                <select 
                  value={empresaRecibo} 
                  onChange={(e) => setEmpresaRecibo(e.target.value)}
                  className="w-full md:w-1/2 border rounded p-2 text-sm bg-white"
                >
                  <option value="PAB">PLÁSTICOS AMBIENTALES DEL BAJÍO (PAB)</option>
                  <option value="SHERGON">SHERGON</option>
                </select>
              </div>

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
                  <div>
                    <p className="text-xs font-bold">Fecha Inicial Vacaciones:</p>
                    <p className="bg-blue-50 p-1">{reciboData.diaInicio} {reciboData.mesInicio} {reciboData.anoInicio}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Fecha Final Vacaciones:</p>
                    <p className="bg-blue-50 p-1">{reciboData.diaFin} {reciboData.mesFin} {reciboData.anoFin}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-bold">Nombre de la Empresa:</p>
                    <p className="font-bold bg-blue-50 p-1">{nombreEmpresaLargo}</p>
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
                  <div className="col-span-2">
                    <p className="text-xs font-bold">Nombre de la Empresa: <span className="font-normal">{nombreEmpresaLargo}</span></p>
                  </div>
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

                <div className="mb-4">
                  <p className="text-xs font-bold mb-2">Días que Inician sus Vacaciones</p>
                  <div className="grid grid-cols-6 gap-2 mb-2">
                    <p className="text-xs text-right">del</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diaInicio}</p>
                    <p className="text-xs">de</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.mesInicio}</p>
                    <p className="text-xs">del</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.anoInicio}</p>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    <p className="text-xs text-right">del</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diaFin}</p>
                    <p className="text-xs">de</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.mesFin}</p>
                    <p className="text-xs">del</p>
                    <p className="bg-blue-50 p-1 text-center font-bold">{reciboData.anoFin}</p>
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