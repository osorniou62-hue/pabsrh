import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

// 🔥 NORMALIZADOR DE NOMBRES (para comparar sin importar mayúsculas, acentos o espacios)
const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/[.,;:()]/g, "").replace(/\s+/g, " ").trim();
};

// 🔥 CALCULADOR DE ANTIGÜEDAD
const calcularAntiguedad = (fechaIngresoStr) => {
  if (!fechaIngresoStr) return { anosCumplidos: 0, texto: "Sin fecha" };
  try {
    const fecha = new Date(fechaIngresoStr);
    if (isNaN(fecha.getTime())) return { anosCumplidos: 0, texto: "Fecha inválida" };
    const hoy = new Date();
    const dias = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
    const anos = Math.floor(dias / 365);
    return { anosCumplidos: anos, texto: anos === 0 ? "< 1 año" : `${anos} año(s)` };
  } catch {
    return { anosCumplidos: 0, texto: "Error" };
  }
};

// 🔥 PARSER DE FECHAS ROBUSTO (maneja dd/mm/yyyy, dd/mmm/yy, números de Excel, y errores de dedo como 1407/2026)
const parsearFechaCSV = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'number') {
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    if (!isNaN(fecha.getTime())) return fecha.toISOString().split('T')[0];
  }
  let str = String(valor).trim();
  if (str === '-' || str.toLowerCase().includes('pagad') || str.includes('#¡REF!') || str === '') return null;
  
  // Corregir errores de dedo comunes (ej: "1407/2026" -> "14/07/2026")
  str = str.replace(/^(\d{2})(\d{2})\/(\d{4})$/, '$1/$2/$3');
  
  const matchSlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4,5})$/);
  if (matchSlash) {
    let [, dia, mes, anio] = matchSlash;
    if (anio.length > 4) anio = anio.slice(-4); // Tomar últimos 4 dígitos si hay error
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  const meses = { 'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12' };
  const matchMes = str.match(/^(\d{1,2})[\/\-]([a-z]{3})[\/\-](\d{2,4})$/i);
  if (matchMes) {
    let [, dia, mes, anio] = matchMes;
    const mesNum = meses[mes.toLowerCase()];
    if (anio.length === 2) anio = '20' + anio;
    if (mesNum) return `${anio}-${mesNum}-${dia.padStart(2, '0')}`;
  }
  
  const matchGuion = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (matchGuion) {
    let [, dia, mes, anio] = matchGuion;
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
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

  const [archivoVacaciones, setArchivoVacaciones] = useState(null);
  const [modoImportacion, setModoImportacion] = useState(false);
  const [progresoImportacion, setProgresoImportacion] = useState(0);
  const [resultadosImportacion, setResultadosImportacion] = useState(null);

  const [kardexData, setKardexData] = useState(null);
  const [reciboData, setReciboData] = useState(null);
  const [empresaRecibo, setEmpresaRecibo] = useState("PAB");
  
  const [formSolicitud, setFormSolicitud] = useState({
    abierto: false, modo: 'crear', id: null, dias: 1, fechaInicio: '', fechaFin: '', tipo: 'TOMADAS_Y_PAGADAS', observaciones: ''
  });

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
    try {
      const { data, error } = await supabase.from("regla_vacaciones").select("*");
      if (!error && data) {
        const mapaReglas = {};
        data.forEach((item) => { mapaReglas[item.ano] = item.dias; });
        setReglasGlobales(mapaReglas);
      }
    } catch (err) { console.error("Error reglas:", err); }
  };

  const cargarEmpleados = async () => {
    try {
      const { data: emps, error: errorEmps } = await supabase.from("empleados").select("*").eq("activo", true).order("nombre_completo");
      if (errorEmps) { console.error("Error empleados:", errorEmps); setEmpleados([]); return; }
      setEmpleados(emps || []);
    } catch (err) { console.error("Excepción empleados:", err); setEmpleados([]); }
  };

  const cargarVacaciones = async () => {
    try {
      const { data, error } = await supabase
        .from("vacaciones")
        .select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso)")
        .order("created_at", { ascending: false });
      if (error) { console.error("Error vacaciones:", error); setVacaciones([]); return; }
      setVacaciones(data || []);
    } catch (err) { console.error("Excepción vacaciones:", err); setVacaciones([]); }
  };

  // 🔥 MÓDULO DE IMPORTACIÓN ROBUSTO
  const procesarArchivoExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArchivoVacaciones(file);
    setModoImportacion(true);
    setProgresoImportacion(0);
    setResultadosImportacion(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        let empleadosProcesados = 0;
        let vacacionesActualizadas = 0;
        let vacacionesCreadas = 0;
        let errores = 0;

        for (let i = 0; i < rows.length; i++) {
          const fila = rows[i];
          const numEmp = String(fila['N°'] || fila['N'] || fila['NUMERO'] || '').trim();
          const nombreEmp = String(fila['NOMBRE DEL TRABAJADOR'] || fila['NOMBRE'] || '').trim();
          
          if (!numEmp && !nombreEmp) continue;

          const empleadoMatch = empleados.find(emp => 
            String(emp.numero_empleado) === numEmp || 
            normalizarNombre(emp.nombre_completo) === normalizarNombre(nombreEmp)
          );

          if (!empleadoMatch) { errores++; continue; }
          empleadosProcesados++;

          const keys = Object.keys(fila);
          const bloquesVacaciones = [];
          
          // 🔥 Buscar bloques repetidos de vacaciones: DÍAS, INICIO, TERMINO, REGRESO LAB
          for (let j = 0; j < keys.length; j++) {
            const key = keys[j];
            if (/^DÍAS$/i.test(key) || /^DIAS$/i.test(key)) {
              if (j + 3 < keys.length) {
                const keyInicio = keys[j + 1];
                const keyTermino = keys[j + 2];
                const keyRegreso = keys[j + 3];
                
                if (/INICIO/i.test(keyInicio) && /TERMINO|FIN/i.test(keyTermino) && /REGRESO/i.test(keyRegreso)) {
                  const dias = Number(fila[key]) || 0;
                  const fechaInicio = parsearFechaCSV(fila[keyInicio]);
                  const fechaFin = parsearFechaCSV(fila[keyTermino]);
                  
                  if (dias > 0 && fechaInicio) {
                    const tipoVac = String(fila[keyRegreso] || '').toUpperCase().includes('PAGAD') ? 'PAGADAS_NO_TOMADAS' : 'TOMADAS_Y_PAGADAS';
                    bloquesVacaciones.push({
                      dias_solicitados: dias,
                      fecha_inicio: fechaInicio,
                      fecha_fin: fechaFin || fechaInicio,
                      estatus: "APROBADO",
                      tipo_vacaciones: tipoVac,
                      observaciones: "Importado desde CSV histórico"
                    });
                  }
                }
              }
            }
          }

          for (const bloque of bloquesVacaciones) {
            try {
              const { data: existente } = await supabase
                .from("vacaciones")
                .select("id")
                .eq("empleado_id", empleadoMatch.id)
                .eq("fecha_inicio", bloque.fecha_inicio)
                .eq("fecha_fin", bloque.fecha_fin)
                .maybeSingle();

              if (existente) {
                const { error: errorUpdate } = await supabase.from("vacaciones").update(bloque).eq("id", existente.id);
                if (errorUpdate) errores++; else vacacionesActualizadas++;
              } else {
                const { error: errorInsert } = await supabase.from("vacaciones").insert([{ empleado_id: empleadoMatch.id, ...bloque }]);
                if (errorInsert) errores++; else vacacionesCreadas++;
              }
            } catch (err) { errores++; }
          }

          if (i % 10 === 0) {
            setProgresoImportacion(Math.round((i / rows.length) * 100));
          }
        }

        setResultadosImportacion({ empleadosProcesados, vacacionesActualizadas, vacacionesCreadas, errores });
        setProgresoImportacion(100);
        await cargarVacaciones();
      } catch (error) {
        console.error(error);
        alert("Error al procesar: " + error.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const abrirKardexRH = async (emp) => {
    try {
      await cargarVacaciones();
      const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
      const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
      const solicitudesPendientes = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE");
      const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO");
      const solicitudesRechazadas = vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "RECHAZADO");
      
      setKardexData({ empleado: emp, antiguedad, resumen, solicitudesPendientes, solicitudesAprobadas, solicitudesRechazadas });
    } catch (err) {
      console.error("Error al abrir kardex:", err);
      alert("Error al abrir el kardex");
    }
  };

  const aprobarSolicitud = async (vacacionId, empresa) => {
    try {
      const { data: vacacionData, error } = await supabase
        .from("vacaciones")
        .update({ estatus: "APROBADO" })
        .eq("id", vacacionId)
        .select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso)")
        .single();

      if (error) throw error;
      await cargarVacaciones();
      
      if (kardexData && vacacionData) {
        const emp = kardexData.empleado;
        setKardexData({
          empleado: emp,
          antiguedad: calcularAntiguedad(emp.fecha_ingreso),
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE"),
          solicitudesAprobadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO"),
          solicitudesRechazadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "RECHAZADO")
        });

        const fechaInicioDate = new Date(vacionData.fecha_inicio);
        const fechaFinDate = new Date(vacionData.fecha_fin);
        const fechaRegresoDate = new Date(fechaFinDate);
        fechaRegresoDate.setDate(fechaRegresoDate.getDate() + 1);

        setEmpresaRecibo(empresa || "PAB");
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
      }
    } catch (err) {
      alert("Error al aprobar: " + err.message);
    }
  };

  const modificarSolicitud = async (vacacionId, nuevosDatos) => {
    try {
      const { error } = await supabase.from("vacaciones").update(nuevosDatos).eq("id", vacacionId);
      if (error) throw error;
      await cargarVacaciones();
      if (kardexData) {
        const emp = kardexData.empleado;
        setKardexData({
          ...kardexData,
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE")
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
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE"),
          solicitudesAprobadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO"),
          solicitudesRechazadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "RECHAZADO")
        });
      }
    } catch (err) {
      alert("Error al rechazar: " + err.message);
    }
  };

  const eliminarSolicitud = async (vacacionId) => {
    if (!window.confirm("¿Eliminar esta solicitud permanentemente?")) return;
    try {
      const { error } = await supabase.from("vacaciones").delete().eq("id", vacacionId);
      if (error) throw error;
      await cargarVacaciones();
      if (kardexData) {
        const emp = kardexData.empleado;
        setKardexData({
          ...kardexData,
          resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
          solicitudesPendientes: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE"),
          solicitudesAprobadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO"),
          solicitudesRechazadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "RECHAZADO")
        });
      }
      alert("✅ Solicitud eliminada.");
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const verReciboHistorico = (item) => {
    try {
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
    } catch (err) {
      console.error("Error al ver recibo:", err);
    }
  };

  const guardarNuevaSolicitud = async () => {
    if (!formSolicitud.fechaInicio || !formSolicitud.fechaFin || !formSolicitud.dias) {
      alert("Completa todos los campos obligatorios");
      return;
    }
    try {
      const payload = {
        empleado_id: kardexData.empleado.id,
        dias_solicitados: Number(formSolicitud.dias),
        fecha_inicio: formSolicitud.fechaInicio,
        fecha_fin: formSolicitud.fechaFin,
        tipo_vacaciones: formSolicitud.tipo,
        observaciones: formSolicitud.observaciones,
        estatus: "PENDIENTE"
      };
      const { error } = await supabase.from("vacaciones").insert([payload]);
      if (error) throw error;
      
      alert("✅ Solicitud creada correctamente.");
      setFormSolicitud({ abierto: false, modo: 'crear', id: null, dias: 1, fechaInicio: '', fechaFin: '', tipo: 'TOMADAS_Y_PAGADAS', observaciones: '' });
      await cargarVacaciones();
      
      const emp = kardexData.empleado;
      setKardexData({
        empleado: emp,
        antiguedad: calcularAntiguedad(emp.fecha_ingreso),
        resumen: obtenerResumenEmpleado(emp.id, emp.fecha_ingreso),
        solicitudesPendientes: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "PENDIENTE"),
        solicitudesAprobadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "APROBADO"),
        solicitudesRechazadas: vacaciones.filter(v => String(v.empleado_id) === String(emp.id) && v.estatus === "RECHAZADO")
      });
    } catch (err) {
      alert("Error al crear: " + err.message);
    }
  };

  const obtenerResumenEmpleado = (empleadoId, fechaIngresoStr) => {
    try {
      const anos = calcularAntiguedad(fechaIngresoStr).anosCumplidos;
      const diasCorrespondientes = Number(reglasGlobales[anos] || 0);
      const solicitudesAprobadas = vacaciones.filter(v => String(v.empleado_id) === String(empleadoId) && v.estatus === "APROBADO");
      const diasTomados = solicitudesAprobadas.reduce((acc, curr) => acc + Number(curr.dias_solicitados || 0), 0);
      return { diasCorrespondientes, diasTomados, diasRemanentes: diasCorrespondientes - diasTomados, solicitudesAprobadas };
    } catch {
      return { diasCorrespondientes: 0, diasTomados: 0, diasRemanentes: 0, solicitudesAprobadas: [] };
    }
  };

  const empleadosAgrupados = useMemo(() => {
    if (!Array.isArray(empleados) || empleados.length === 0) return {};
    try {
      const agrupado = {};
      empleados.forEach(emp => {
        const depto = emp.departamento || "Sin Departamento";
        const puesto = emp.puesto || "Sin Puesto";
        if (!agrupado[depto]) agrupado[depto] = {};
        if (!agrupado[depto][puesto]) agrupado[depto][puesto] = [];
        agrupado[depto][puesto].push(emp);
      });
      return agrupado;
    } catch { return {}; }
  }, [empleados]);

  const toggleDepto = (depto) => setDeptoExpandido(prev => ({ ...prev, [depto]: !prev[depto] }));

  const guardarReglaGlobal = async () => {
    if (diasReglaInput === "" || Number(diasReglaInput) < 0) return alert("Cantidad inválida");
    try {
      const { error } = await supabase.from("regla_vacaciones").upsert({ ano: Number(anoReglaInput), dias: Number(diasReglaInput) }, { onConflict: "ano" });
      if (!error) {
        setReglasGlobales(prev => ({ ...prev, [anoReglaInput]: Number(diasReglaInput) }));
        setDiasReglaInput("");
        alert("Regla actualizada");
      }
    } catch (err) { alert("Error: " + err.message); }
  };

  const esPAB = (empresaRecibo || 'PAB') === 'PAB';
  const nombreEmpresaCorto = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJIO" : "SHERGON";
  const nombreEmpresaLargo = esPAB ? "PLÁSTICOS AMBIENTALES DEL BAJÍO S.A. DE C.V." : "SHERGON S.A. DE C.V.";

  const sugerenciasEmpleados = useMemo(() => {
    if (!busquedaTexto.trim()) return [];
    const q = busquedaTexto.toLowerCase();
    return empleados.filter(emp => 
      (emp.nombre_completo || "").toLowerCase().includes(q) || 
      (emp.numero_empleado || "").toString().toLowerCase().includes(q)
    ).slice(0, 10);
  }, [busquedaTexto, empleados]);

  const empleadosFiltrados = useMemo(() => {
    if (!busquedaActiva || !empleadoSeleccionadoId) return empleados;
    return empleados.filter(e => String(e.id) === String(empleadoSeleccionadoId));
  }, [empleados, busquedaActiva, empleadoSeleccionadoId]);

  const empleadosAgrupadosFiltrados = useMemo(() => {
    if (!Array.isArray(empleadosFiltrados) || empleadosFiltrados.length === 0) return {};
    try {
      const agrupado = {};
      empleadosFiltrados.forEach(emp => {
        const depto = emp.departamento || "Sin Departamento";
        const puesto = emp.puesto || "Sin Puesto";
        if (!agrupado[depto]) agrupado[depto] = {};
        if (!agrupado[depto][puesto]) agrupado[depto][puesto] = [];
        agrupado[depto][puesto].push(emp);
      });
      return agrupado;
    } catch { return {}; }
  }, [empleadosFiltrados]);

  const totalPendientes = vacaciones.filter(v => v.estatus === "PENDIENTE").length;
  const totalAprobadas = vacaciones.filter(v => v.estatus === "APROBADO").length;
  const totalRechazadas = vacaciones.filter(v => v.estatus === "RECHAZADO").length;
  const totalDias = vacaciones.filter(v => v.estatus === "APROBADO").reduce((a, b) => a + Number(b.dias_solicitados || 0), 0);

  return (
    <Layout>
      <div className="space-y-6 print:hidden">
        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">🏖️ Control de Vacaciones (RH)</h1>
            <p className="text-slate-500">Gestión, aprobación de solicitudes, importación histórica y generación de recibos</p>
          </div>
          <button onClick={cargarEmpleados} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-200">
            🔄 Recargar Datos
          </button>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <KpiCard titulo="Pendientes" valor={totalPendientes} icono="⏳" color="text-amber-600" />
          <KpiCard titulo="Aprobadas" valor={totalAprobadas} icono="✅" color="text-green-600" />
          <KpiCard titulo="Rechazadas" valor={totalRechazadas} icono="❌" color="text-red-600" />
          <KpiCard titulo="Días Totales" valor={totalDias} icono="🗓️" color="text-blue-600" />
        </div>

        {/* BUSCADOR DE EMPLEADOS */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">🔎 Buscar Empleado</h2>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Escribe el nombre o número de empleado..." 
              value={busquedaTexto}
              onChange={(e) => { setBusquedaTexto(e.target.value); setEmpleadoSeleccionadoId(""); setMostrarSugerencias(true); }}
              onFocus={() => setMostrarSugerencias(true)}
              className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {mostrarSugerencias && busquedaTexto.trim() !== "" && sugerenciasEmpleados.length > 0 && (
              <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-lg max-h-60 overflow-y-auto">
                {sugerenciasEmpleados.map((emp) => (
                  <li key={emp.id} onClick={() => { setBusquedaTexto(`[${emp.numero_empleado}] ${emp.nombre_completo}`); setEmpleadoSeleccionadoId(emp.id); setMostrarSugerencias(false); setBusquedaActiva(true); }} className="p-3 hover:bg-blue-50 cursor-pointer text-sm border-b flex justify-between">
                    <span className="font-medium">{emp.nombre_completo}</span>
                    <span className="text-xs text-gray-400">#{emp.numero_empleado}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {busquedaActiva && (
            <button onClick={() => { setBusquedaActiva(false); setBusquedaTexto(""); setEmpleadoSeleccionadoId(""); }} className="mt-2 text-sm text-red-600 hover:underline">
              Limpiar filtro
            </button>
          )}
        </div>

        {/* IMPORTACIÓN HISTÓRICA ROBUSTA */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">📥 Importar Histórico de Vacaciones (CSV)</h2>
          {!modoImportacion ? (
            <div>
              <p className="text-sm text-slate-600 mb-3">Sube tu archivo "CONTROL GENERAL" para actualizar el historial. El sistema detectará automáticamente múltiples bloques de vacaciones por empleado.</p>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={procesarArchivoExcel} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
          ) : (
            <div className="space-y-4">
              {progresoImportacion < 100 ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-700 font-semibold">Procesando archivo...</span>
                    <span className="text-sm text-slate-700 font-bold">{progresoImportacion}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progresoImportacion}%` }}></div>
                  </div>
                </div>
              ) : resultadosImportacion ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-bold text-green-800 mb-2">✅ Importación Completada</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-slate-600">Empleados:</span><strong className="block">{resultadosImportacion.empleadosProcesados}</strong></div>
                    <div><span className="text-slate-600">Actualizados:</span><strong className="text-blue-600 block">{resultadosImportacion.vacacionesActualizadas}</strong></div>
                    <div><span className="text-slate-600">Creados:</span><strong className="text-green-600 block">{resultadosImportacion.vacacionesCreadas}</strong></div>
                    <div><span className="text-slate-600">Errores/Saltos:</span><strong className="text-red-600 block">{resultadosImportacion.errores}</strong></div>
                  </div>
                  <button onClick={() => { setModoImportacion(false); setArchivoVacaciones(null); setResultadosImportacion(null); }} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    Cerrar
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* REGLAS GLOBALES */}
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

        {/* LISTADO DE EMPLEADOS */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">📋 Listado de Empleados</h2>
          {Object.keys(empleadosAgrupadosFiltrados).length === 0 ? (
            <p className="text-center text-gray-500 py-8">No se encontraron empleados.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(empleadosAgrupadosFiltrados).map(([depto, puestos]) => (
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
                          <div className="overflow-x-auto">
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
                                  try {
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
                                          <button onClick={() => abrirKardexRH(emp)} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700">
                                            📋 Kardex
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  } catch (err) { return null; }
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🔥 MODAL KARDEX COMPLETO CON FUNCIONALIDAD RH */}
        {kardexData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">📋 Kardex de Empleado</h3>
                  <p className="text-sm text-slate-600">{kardexData.empleado?.nombre_completo || "Sin nombre"} | {kardexData.empleado?.puesto || "Sin puesto"} | {kardexData.empleado?.departamento || "Sin departamento"}</p>
                </div>
                <button onClick={() => setKardexData(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div><span className="text-gray-500 text-xs block">Antigüedad</span><strong>{kardexData.antiguedad?.texto || "N/A"}</strong></div>
                <div><span className="text-gray-500 text-xs block">Días por Ley</span><strong className="text-blue-600">{kardexData.resumen?.diasCorrespondientes || 0}</strong></div>
                <div><span className="text-gray-500 text-xs block">Descontados</span><strong className="text-amber-600">{kardexData.resumen?.diasTomados || 0}</strong></div>
                <div><span className="text-gray-500 text-xs block">Remanentes</span><strong className="text-emerald-600">{kardexData.resumen?.diasRemanentes || 0}</strong></div>
              </div>

              <div className="mb-6">
                <button onClick={() => setFormSolicitud({ abierto: true, modo: 'crear', id: null, dias: 1, fechaInicio: '', fechaFin: '', tipo: 'TOMADAS_Y_PAGADAS', observaciones: '' })} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2">
                  ➕ Crear Nueva Solicitud de Vacaciones
                </button>
              </div>

              {kardexData.solicitudesPendientes && kardexData.solicitudesPendientes.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">⏳ Solicitudes Pendientes ({kardexData.solicitudesPendientes.length})</h4>
                  <div className="space-y-3">
                    {kardexData.solicitudesPendientes.map(vac => (
                      <div key={vac.id} className="border-2 border-amber-200 bg-amber-50 p-4 rounded-xl">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div><span className="text-xs text-slate-600">Días:</span><strong className="block">{vac.dias_solicitados}</strong></div>
                          <div><span className="text-xs text-slate-600">Inicio:</span><strong className="block">{vac.fecha_inicio}</strong></div>
                          <div><span className="text-xs text-slate-600">Fin:</span><strong className="block">{vac.fecha_fin}</strong></div>
                          <div><span className="text-xs text-slate-600">Tipo:</span><strong className="block text-xs">{vac.tipo_vacaciones || 'TOMADAS_Y_PAGADAS'}</strong></div>
                        </div>
                        {vac.observaciones && <p className="text-xs text-slate-600 mb-3 bg-white p-2 rounded"><strong>Obs:</strong> {vac.observaciones}</p>}
                        <div className="flex flex-wrap gap-2">
                          <select id={`empresa-${vac.id}`} defaultValue="PAB" className="border rounded px-2 py-1 text-xs bg-white">
                            <option value="PAB">PAB</option>
                            <option value="SHERGON">SHERGON</option>
                          </select>
                          <button onClick={() => { const select = document.getElementById(`empresa-${vac.id}`); aprobarSolicitud(vac.id, select?.value || "PAB"); }} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">✅ Aprobar</button>
                          <button onClick={() => { const nuevosDias = prompt("Modificar días:", vac.dias_solicitados); if (nuevosDias !== null) modificarSolicitud(vac.id, { dias_solicitados: Number(nuevosDias) }); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">✏️ Modificar</button>
                          <button onClick={() => rechazarSolicitud(vac.id)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">❌ Rechazar</button>
                          <button onClick={() => eliminarSolicitud(vac.id)} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">🗑️ Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">✅ Historial Aprobado ({kardexData.solicitudesAprobadas?.length || 0})</h4>
                {!kardexData.solicitudesAprobadas || kardexData.solicitudesAprobadas.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">Sin historial de vacaciones aprobadas.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">Fechas</th><th className="p-2">Días</th><th className="p-2">Tipo</th><th className="p-2">Acción</th></tr></thead>
                      <tbody>
                        {kardexData.solicitudesAprobadas.map(item => (
                          <tr key={item.id} className="border-t">
                            <td className="p-2">{item.fecha_inicio} al {item.fecha_fin}</td>
                            <td className="p-2 text-center font-bold">{item.dias_solicitados}</td>
                            <td className="p-2 text-center">{item.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? "💰 Pagadas No Tomadas" : "✅ Tomadas"}</td>
                            <td className="p-2 text-center">
                              <button onClick={() => verReciboHistorico(item)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold">🖨️ Ver Recibo</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {kardexData.solicitudesRechazadas && kardexData.solicitudesRechazadas.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">❌ Historial Rechazado ({kardexData.solicitudesRechazadas.length})</h4>
                  <div className="max-h-48 overflow-y-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">Fechas</th><th className="p-2">Días</th><th className="p-2">Observaciones</th></tr></thead>
                      <tbody>
                        {kardexData.solicitudesRechazadas.map(item => (
                          <tr key={item.id} className="border-t">
                            <td className="p-2">{item.fecha_inicio} al {item.fecha_fin}</td>
                            <td className="p-2 text-center font-bold">{item.dias_solicitados}</td>
                            <td className="p-2">{item.observaciones || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🔥 MODAL CREAR/EDITAR SOLICITUD */}
        {formSolicitud.abierto && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[80]">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">{formSolicitud.modo === 'crear' ? '➕ Nueva Solicitud' : '✏️ Editar Solicitud'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Días solicitados *</label>
                  <input type="number" min="1" value={formSolicitud.dias} onChange={(e) => setFormSolicitud({ ...formSolicitud, dias: e.target.value })} className="w-full border-2 border-slate-200 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de inicio *</label>
                  <input type="date" value={formSolicitud.fechaInicio} onChange={(e) => setFormSolicitud({ ...formSolicitud, fechaInicio: e.target.value })} className="w-full border-2 border-slate-200 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de fin *</label>
                  <input type="date" value={formSolicitud.fechaFin} onChange={(e) => setFormSolicitud({ ...formSolicitud, fechaFin: e.target.value })} className="w-full border-2 border-slate-200 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de vacaciones</label>
                  <select value={formSolicitud.tipo} onChange={(e) => setFormSolicitud({ ...formSolicitud, tipo: e.target.value })} className="w-full border-2 border-slate-200 rounded-lg p-2">
                    <option value="TOMADAS_Y_PAGADAS">✅ Tomadas y Pagadas</option>
                    <option value="PAGADAS_NO_TOMADAS">💰 Pagadas No Tomadas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones</label>
                  <textarea value={formSolicitud.observaciones} onChange={(e) => setFormSolicitud({ ...formSolicitud, observaciones: e.target.value })} className="w-full border-2 border-slate-200 rounded-lg p-2" rows="3" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setFormSolicitud({ ...formSolicitud, abierto: false })} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold">Cancelar</button>
                <button onClick={guardarNuevaSolicitud} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold">💾 Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL RECIBO */}
        {reciboData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[90] print:static print:bg-white print:p-0">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-8 max-h-[95vh] overflow-y-auto print:shadow-none print:max-h-none print:w-full print:p-4">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg print:hidden">
                <label className="text-xs font-bold text-blue-800 block mb-1">🏢 Seleccionar Empresa:</label>
                <select value={empresaRecibo} onChange={(e) => setEmpresaRecibo(e.target.value)} className="w-full md:w-1/2 border rounded p-2 text-sm bg-white">
                  <option value="PAB">PLÁSTICOS AMBIENTALES DEL BAJÍO (PAB)</option>
                  <option value="SHERGON">SHERGON</option>
                </select>
              </div>

              <div className="border-2 border-black p-4 mb-6">
                <h3 className="font-bold text-sm mb-3 uppercase">DATOS DE CAPTURA</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2"><p className="text-xs font-bold">NOMBRE:</p><p className="font-bold bg-blue-50 p-1">{reciboData.empleado?.nombre_completo || "N/A"}</p></div>
                  <div className="col-span-2"><p className="text-xs font-bold"># EMPLEADO:</p><p className="font-bold bg-yellow-200 p-1">{reciboData.empleado?.numero_empleado || "N/A"}</p></div>
                  <div><p className="text-xs font-bold">Fecha Ingreso:</p><p className="bg-blue-50 p-1 text-center">{reciboData.empleado?.fecha_ingreso || "N/A"}</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-xs font-bold">Años de Servicio:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.antiguedad?.anosCumplidos || 0}</p></div>
                    <div><p className="text-xs font-bold">Días pendientes:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen?.diasRemanentes || 0}</p></div>
                  </div>
                  <div><p className="text-xs font-bold">Días que Corresponden:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen?.diasCorrespondientes || 0}</p></div>
                  <div><p className="text-xs font-bold">Días a Disfrutar:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diasSolicitados || 0}</p></div>
                  <div><p className="text-xs font-bold">Fecha Inicial:</p><p className="bg-blue-50 p-1">{reciboData.diaInicio} {reciboData.mesInicio} {reciboData.anoInicio}</p></div>
                  <div><p className="text-xs font-bold">Fecha Final:</p><p className="bg-blue-50 p-1">{reciboData.diaFin} {reciboData.mesFin} {reciboData.anoFin}</p></div>
                  <div className="col-span-2"><p className="text-xs font-bold">Empresa:</p><p className="font-bold bg-blue-50 p-1">{nombreEmpresaLargo}</p></div>
                </div>
              </div>

              <div className="border-2 border-black p-6">
                <div className="text-center mb-4">
                  <h1 className="text-xl font-black uppercase">{nombreEmpresaCorto}</h1>
                  <h2 className="text-lg font-bold mt-2">SOLICITUD Y AUTORIZACION DE</h2>
                  <h2 className="text-lg font-bold">VACACIONES</h2>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-4 border-t border-b border-black py-2">
                  <div><p className="text-xs font-bold">Días corresponden:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen?.diasCorrespondientes || 0}</p></div>
                  <div><p className="text-xs font-bold">Días a disfrutar:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.diasSolicitados || 0}</p></div>
                  <div><p className="text-xs font-bold">Días Pendientes:</p><p className="bg-blue-50 p-1 text-center font-bold">{reciboData.resumen?.diasRemanentes || 0}</p></div>
                </div>
                <div className="border-t-2 border-black pt-4 mt-6">
                  <p className="text-xs font-bold mb-4">POR EL PRESENTE EXPRESO MI CONFORMIDAD DE SOLICITAR Y GOZAR MIS VACACIONES DE ACUERDO A LO QUE ESTABLECE EL ARTICULO 76 DE LA LEY FEDERAL DEL TRABAJO.</p>
                  <div className="grid grid-cols-4 gap-4 text-center text-xs mt-8">
                    <div><p className="bg-blue-50 p-2 mb-2 font-bold">{reciboData.empleado?.nombre_completo || "N/A"}</p><p className="font-bold">Firma del Empleado</p></div>
                    <div><p className="border-b border-black h-12 mb-2">&nbsp;</p><p className="font-bold">Firma Líder</p></div>
                    <div><p className="border-b border-black h-12 mb-2">&nbsp;</p><p className="font-bold">Firma Encargado</p></div>
                    <div><p className="border-b border-black h-12 mb-2">&nbsp;</p><p className="font-bold">Vo. Bo. Capital Humano</p></div>
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