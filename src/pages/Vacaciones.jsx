import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/[.,;:()]/g, "").replace(/\s+/g, " ").trim();
};

const calcularAntiguedad = (fechaIngresoStr) => {
  if (!fechaIngresoStr) return { anosCumplidos: 0, texto: "Sin fecha" };
  const dias = Math.floor((new Date() - new Date(fechaIngresoStr)) / (1000 * 60 * 60 * 24));
  const anos = Math.floor(dias / 365);
  return { anosCumplidos: anos, texto: anos === 0 ? "< 1 año" : `${anos} año(s)` };
};

// 🔥 Parser robusto para fechas del CSV (maneja formatos: dd/mm/yyyy, dd-mmm-yyyy, números de Excel)
const parsearFechaCSV = (valor) => {
  if (!valor) return null;
  
  // Si es número de Excel
  if (typeof valor === 'number') {
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    return fecha.toISOString().split('T')[0];
  }
  
  const str = String(valor).trim();
  
  // Formato dd/mm/yyyy o dd/mm/yy
  const matchSlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (matchSlash) {
    let [, dia, mes, anio] = matchSlash;
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  // Formato dd-mmm-yyyy (ej: 03/feb/26)
  const meses = { 'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12' };
  const matchMes = str.match(/^(\d{1,2})[\/\-]([a-z]{3})[\/\-](\d{2,4})$/i);
  if (matchMes) {
    let [, dia, mes, anio] = matchMes;
    const mesNum = meses[mes.toLowerCase()];
    if (anio.length === 2) anio = '20' + anio;
    if (mesNum) return `${anio}-${mesNum}-${dia.padStart(2, '0')}`;
  }
  
  // Formato dd-mmm-yy con guiones (ej: 19-mar-26)
  const matchGuion = str.match(/^(\d{1,2})[\/\-]([a-z]{3})[\/\-](\d{2,4})$/i);
  if (matchGuion) {
    let [, dia, mes, anio] = matchGuion;
    const mesNum = meses[mes.toLowerCase()];
    if (anio.length === 2) anio = '20' + anio;
    if (mesNum) return `${anio}-${mesNum}-${dia.padStart(2, '0')}`;
  }
  
  return null;
};

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [reglasGlobales, setReglasGlobales] = useState({});
  
  const [anoReglaInput, setAnoReglaInput] = useState(1);
  const [diasReglaInput, setDiasReglaInput] = useState("");
  const [reglasExpandidas, setReglasExpandidas] = useState(false);

  // 🔥 IMPORTACIÓN
  const [archivoVacaciones, setArchivoVacaciones] = useState(null);
  const [datosImportados, setDatosImportados] = useState([]);
  const [modoRevision, setModoRevision] = useState(false);

  // 🔥 KARDEX Y RECIBOS
  const [kardexData, setKardexData] = useState(null);
  const [reciboData, setReciboData] = useState(null);
  const [empresaRecibo, setEmpresaRecibo] = useState("PAB");

  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [deptoExpandido, setDeptoExpandido] = useState({});

  useEffect(() => {
    const inicializar = async () => {
      await cargarReglasGlobales();
      await cargarEmpleados();
      await cargarVacaciones();
    };
    inicializar();
  }, []);

  const cargarReglasGlobales = async () => {
    const { data, error } = await supabase.from("regla_vacaciones").select("*");
    if (!error && data) {
      const mapaReglas = {};
      data.forEach((item) => { mapaReglas[item.ano] = item.dias; });
      setReglasGlobales(mapaReglas);
    }
  };

  const cargarEmpleados = async () => {
    try {
      const { data: emps, error: errorEmps } = await supabase.from("empleados").select("*").eq("activo", true).order("nombre_completo");
      if (errorEmps) { console.error("Error cargando empleados:", errorEmps); setEmpleados([]); return; }
      setEmpleados(emps || []);
    } catch (err) { console.error("Excepción en cargarEmpleados:", err); setEmpleados([]); }
  };

  const cargarVacaciones = async () => {
    try {
      const { data, error } = await supabase.from("vacaciones").select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso, empresa)").order("created_at", { ascending: false });
      if (!error) setVacaciones(data || []);
    } catch (err) { console.error("Error cargando vacaciones:", err); }
  };

  // 🔥 IMPORTACIÓN CON PARSER ROBUSTO DE MÚLTIPLES BLOQUES
  const procesarArchivoExcel = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArchivoVacaciones(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        const registrosVacaciones = [];
        
        rows.forEach((fila, index) => {
          const keys = Object.keys(fila);
          
          // Identificar empleado
          const numKey = keys.find(k => /n[^a-z]*o|numero/i.test(k));
          const nombreKey = keys.find(k => /nombre|trabajador/i.test(k));
          const numEmp = numKey ? String(fila[numKey]).trim() : "";
          const nombreEmp = nombreKey ? String(fila[nombreKey]).trim() : "";
          
          const empleadoMatch = empleados.find(emp => 
            String(emp.numero_empleado) === numEmp || 
            normalizarNombre(emp.nombre_completo) === normalizarNombre(nombreEmp)
          );

          if (!empleadoMatch) return;

          // 🔥 Buscar todos los bloques de solicitudes de vacaciones
          // Patrón: Días, INICIO, TERMINO, REGRESO LAB (repetido múltiples veces)
          const bloquesSolicitudes = [];
          
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (/d[ií]as/i.test(key) && !/pendiente|vacaciones|años/i.test(key)) {
              // Verificar si los siguientes 3 campos son INICIO, TERMINO, REGRESO
              if (i + 3 < keys.length) {
                const keyInicio = keys[i + 1];
                const keyTermino = keys[i + 2];
                const keyRegreso = keys[i + 3];
                
                if (/inicio/i.test(keyInicio) && /termino|fin/i.test(keyTermino) && /regreso|lab/i.test(keyRegreso)) {
                  const dias = Number(fila[key]) || 0;
                  const fechaInicio = parsearFechaCSV(fila[keyInicio]);
                  const fechaFin = parsearFechaCSV(fila[keyTermino]);
                  const fechaRegreso = parsearFechaCSV(fila[keyRegreso]);
                  
                  if (dias > 0 && fechaInicio) {
                    bloquesSolicitudes.push({
                      dias_solicitados: dias,
                      fecha_inicio: fechaInicio,
                      fecha_fin: fechaFin || fechaInicio,
                      fecha_regreso: fechaRegreso,
                      tipo: fila[keyRegreso] && /pagad/i.test(String(fila[keyRegreso])) ? "PAGADAS_NO_TOMADAS" : "TOMADAS_Y_PAGADAS"
                    });
                  }
                }
              }
            }
          }

          // Crear registros de vacaciones para cada bloque encontrado
          bloquesSolicitudes.forEach((bloque, idx) => {
            registrosVacaciones.push({
              id_fila: `${index}_${idx}`,
              empleado_id: empleadoMatch.id,
              nombre_encontrado: empleadoMatch.nombre_completo,
              numero_encontrado: empleadoMatch.numero_empleado,
              estatus_match: "✅ Vinculado",
              datos_vacaciones: {
                ...bloque,
                estatus: "PENDIENTE", // Se importan como pendientes para que RH las revise
                observaciones: `Importado desde CSV - Bloque ${idx + 1}`
              }
            });
          });
        });

        setDatosImportados(registrosVacaciones);
        setModoRevision(true);
        alert(`✅ Se procesaron ${rows.length} filas.\n✅ Se encontraron ${registrosVacaciones.length} solicitudes de vacaciones para revisar.`);
      } catch (error) {
        console.error(error);
        alert("Error al leer el archivo: " + error.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const guardarImportacionRevisada = async () => {
    const datosValidos = datosImportados.filter(d => d.empleado_id);
    if (datosValidos.length === 0) { alert("⚠️ No hay datos vinculados."); return; }
    if (!window.confirm(`¿Guardar ${datosValidos.length} solicitudes en la base de datos?`)) return;
    
    let errores = 0;
    for (const item of datosValidos) {
      const { error } = await supabase.from("vacaciones").insert([{ 
        empleado_id: item.empleado_id, 
        ...item.datos_vacaciones 
      }]);
      if (error) errores++;
    }
    
    if (errores === 0) {
      alert("✅ Importación guardada exitosamente.");
      setModoRevision(false); setDatosImportados([]); setArchivoVacaciones(null);
      await cargarVacaciones();
    } else { 
      alert(`⚠️ Se guardaron algunos, pero hubo ${errores} errores.`); 
    }
  };

  // 🔥 KARDEX Y APROBACIÓN
  const abrirKardexRH = (emp) => {
    const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
    const solicitudesPendientes = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE");
    const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO");
    setKardexData({ empleado: emp, resumen, solicitudesPendientes, solicitudesAprobadas });
  };

  const aprobarSolicitud = async (vacacionId, empresa) => {
    try {
      const { data: vacacionData, error } = await supabase
        .from("vacaciones")
        .update({ estatus: "APROBADO" })
        .eq("id", vacacionId)
        .select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso, empresa)")
        .single();

      if (error) throw error;
      await cargarVacaciones();
      
      // Actualizar kardex en pantalla
      if (kardexData) {
        const emp = kardexData.empleado;
        setKardexData({
          ...kardexData,
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: kardexData.solicitudesPendientes.filter(v => v.id !== vacacionId),
          solicitudesAprobadas: [...kardexData.solicitudesAprobadas, vacacionData]
        });
      }
      
      // Abrir recibo automáticamente
      const fechaInicioDate = new Date(vacionData.fecha_inicio);
      const fechaFinDate = new Date(vacionData.fecha_fin);
      const fechaRegresoDate = new Date(fechaFinDate);
      fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);

      setEmpresaRecibo(empresa);
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
    } catch (err) {
      alert("Error al aprobar: " + err.message);
    }
  };

  const modificarSolicitud = async (vacacionId, nuevosDatos) => {
    try {
      const { error } = await supabase
        .from("vacaciones")
        .update(nuevosDatos)
        .eq("id", vacacionId);

      if (error) throw error;
      await cargarVacaciones();
      
      if (kardexData) {
        const emp = kardexData.empleado;
        setKardexData({
          ...kardexData,
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: kardexData.solicitudesPendientes.map(v => 
            v.id === vacacionId ? { ...v, ...nuevosDatos } : v
          )
        });
      }
      alert("✅ Solicitud modificada correctamente.");
    } catch (err) {
      alert("Error al modificar: " + err.message);
    }
  };

  const rechazarSolicitud = async (vacacionId) => {
    if (!window.confirm("¿Rechazar esta solicitud?")) return;
    try {
      await supabase.from("vacaciones").update({ estatus: "RECHAZADO" }).eq("id", vacacionId);
      await cargarVacaciones();
      if (kardexData) {
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

  const verReciboHistorico = (item) => {
    const fechaInicioDate = new Date(item.fecha_inicio);
    const fechaFinDate = new Date(item.fecha_fin);
    const fechaRegresoDate = new Date(fechaFinDate);
    fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);
    
    setEmpresaRecibo("PAB");
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
  };

  const obtenerResumenEmpleado = (empleadoId, fechaIngresoStr) => {
    const anos = calcularAntiguedad(fechaIngresoStr).anosCumplidos;
    const diasCorrespondientes = Number(reglasGlobales[anos] || 0);
    const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(empleadoId) && v.estatus === "APROBADO");
    const diasTomados = solicitudesAprobadas.reduce((acc, curr) => acc + Number(curr.dias_solicitados || 0), 0);
    return { diasCorrespondientes, diasTomados, diasRemanentes: diasCorrespondientes - diasTomados, solicitudesAprobadas };
  };

  const empleadosAgrupados = useMemo(() => {
    if (!Array.isArray(empleados)) return {};
    const agrupado = {};
    empleados.forEach(emp => {
      const depto = emp.departamento || "Sin Departamento";
      const puesto = emp.puesto || "Sin Puesto";
      if (!agrupado[depto]) agrupado[depto] = {};
      if (!agrupado[depto][puesto]) agrupado[depto][puesto] = [];
      agrupado[depto][puesto].push(emp);
    });
    return agrupado;
  }, [empleados]);

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

  const esPAB = (empresaRecibo || 'PAB') === 'PAB';
  const nombreEmpresaCorto = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJIO" : "SHERGON";
  const nombreEmpresaLargo = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJÍO S.A. DE C.V." : "SHERGON S.A. DE C.V.";

  return (
    <Layout>
      <div className="space-y-6 print:hidden">
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">️ Control de Vacaciones (RH)</h1>
            <p className="text-slate-500">Gestión, aprobación de solicitudes, importación histórica y generación de recibos</p>
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

        {/* 🔥 IMPORTACIÓN CON BOTÓN GUARDAR */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-slate-800"> Importar Solicitudes desde CSV</h2>
          {!modoRevision ? (
            <div>
              <p className="text-sm text-slate-600 mb-3">Sube tu archivo "CONTROL GENERAL" para importar solicitudes de vacaciones. Se importarán como PENDIENTES para que RH las revise.</p>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={procesarArchivoExcel} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-amber-50 p-3 rounded-lg border border-amber-200">
                <span className="text-sm text-amber-800 font-semibold">📝 Modo Revisión: {datosImportados.length} solicitudes encontradas</span>
                <div className="flex gap-2">
                  <button onClick={() => { setModoRevision(false); setDatosImportados([]); setArchivoVacaciones(null); }} className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1">Cancelar</button>
                  <button onClick={guardarImportacionRevisada} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">💾 Guardar Solicitudes en BD</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 border-b">Estado</th>
                      <th className="p-3 border-b">Empleado</th>
                      <th className="p-3 border-b">Inicio</th>
                      <th className="p-3 border-b">Fin</th>
                      <th className="p-3 border-b">Días</th>
                      <th className="p-3 border-b">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datosImportados.map((fila) => (
                      <tr key={fila.id_fila} className="border-b hover:bg-slate-50">
                        <td className="p-3"><span className="text-[10px] font-bold px-2 py-1 rounded bg-green-100 text-green-700">{fila.estatus_match}</span></td>
                        <td className="p-3 font-medium">{fila.nombre_encontrado} <span className="text-gray-400">({fila.numero_encontrado})</span></td>
                        <td className="p-3">{fila.datos_vacaciones.fecha_inicio}</td>
                        <td className="p-3">{fila.datos_vacaciones.fecha_fin}</td>
                        <td className="p-3 font-bold">{fila.datos_vacaciones.dias_solicitados}</td>
                        <td className="p-3">{fila.datos_vacaciones.tipo === "PAGADAS_NO_TOMADAS" ? "💰 Pagadas" : "✅ Tomadas"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 🔥 REGLAS GLOBALES COMPACTAS (Tipo Display) */}
        <div className="bg-slate-800 text-white rounded-2xl shadow-xl overflow-hidden">
          <button onClick={() => setReglasExpandidas(!reglasExpandidas)} className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-700 transition">
            <div className="flex items-center gap-3">
              <span className="text-lg">⚙️</span>
              <div className="text-left">
                <h2 className="text-base font-bold">Reglas Globales por Antigüedad</h2>
                <p className="text-xs text-slate-300">{Object.keys(reglasGlobales).length} reglas configuradas</p>
              </div>
            </div>
            <span className="text-xl transition-transform" style={{ transform: reglasExpandidas ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
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

        {/* TABLA DE EMPLEADOS CON BOTÓN KARDEX */}
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

        {/* 🔥 MODAL: KARDEX COMPLETO CON SOLICITUDES DEL SUPERVISOR */}
        {kardexData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">📋 Kardex de Empleado</h3>
                  <p className="text-sm text-slate-600">{kardexData.empleado.nombre_completo} | {kardexData.empleado.puesto} | {kardexData.empleado.departamento}</p>
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

              {/* 🔥 SOLICITUDES DEL SUPERVISOR (Comparativa) */}
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">⏳ Solicitudes del Supervisor (Pendientes de Revisión)</h4>
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
                          {vac.observaciones && <div className="text-xs text-slate-600 mt-1"><strong>Obs:</strong> {vac.observaciones}</div>}
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
                            onClick={() => aprobarSolicitud(vac.id, document.getElementById(`empresa-${vac.id}`).value)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ✅ Aprobar
                          </button>
                          <button 
                            onClick={() => {
                              const nuevosDias = prompt("Modificar días:", vac.dias_solicitados);
                              if (nuevosDias !== null) {
                                modificarSolicitud(vac.id, { dias_solicitados: Number(nuevosDias) });
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ️ Modificar
                          </button>
                          <button 
                            onClick={() => rechazarSolicitud(vac.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            ❌ Rechazar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Historial Aprobado con Botón de Recibo */}
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">✅ Historial Aprobado</h4>
              {kardexData.solicitudesAprobadas.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">Sin historial de vacaciones aprobadas.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="p-2">Fechas</th>
                        <th className="p-2">Días</th>
                        <th className="p-2">Tipo</th>
                        <th className="p-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kardexData.solicitudesAprobadas.map(item => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2">{item.fecha_inicio} al {item.fecha_fin}</td>
                          <td className="p-2 text-center font-bold">{item.dias_solicitados}</td>
                          <td className="p-2 text-center">{item.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? "💰 Pagadas" : "✅ Tomadas"}</td>
                          <td className="p-2 text-center">
                            <button 
                              onClick={() => verReciboHistorico(item)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[10px] font-bold"
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

        {/* 🔥 MODAL: RECIBO DE VACACIONES */}
        {reciboData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[80] print:static print:bg-white print:p-0">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-8 max-h-[95vh] overflow-y-auto print:shadow-none print:max-h-none print:w-full print:p-4">
              
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
                    <p className="bg-blue-50 p-1">{reciboData.empleado.departamento || ""}</p>
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
                <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold">️ Imprimir / PDF</button>
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