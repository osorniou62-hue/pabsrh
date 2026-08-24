import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

// 🔥 FUNCIÓN ROBUSTA DE NORMALIZACIÓN (Igual que en Empleados, pero más agresiva con espacios)
const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto)
    .trim() // Elimina espacios al inicio y final (CRÍTICO para el CSV)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita acentos
    .replace(/ñ/g, "n")              // ñ -> n
    .replace(/[.,;:()]/g, "")        // Quita puntos, comas, paréntesis
    .replace(/\s+/g, " ")            // Espacios múltiples -> uno solo
    .trim();
};

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [reglasGlobales, setReglasGlobales] = useState({});
  
  const [anoReglaInput, setAnoReglaInput] = useState(1);
  const [diasReglaInput, setDiasReglaInput] = useState("");
  const [reglasExpandidas, setReglasExpandidas] = useState(false);

  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [archivoVacaciones, setArchivoVacaciones] = useState(null);
  const [datosImportados, setDatosImportados] = useState([]);
  const [modoRevision, setModoRevision] = useState(false);

  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [deptoExpandido, setDeptoExpandido] = useState({});

  const [empleadoKardex, setEmpleadoKardex] = useState(null);
  
  const [formKardex, setFormKardex] = useState({
    fecha_inicio: "", fecha_fin: "", dias_solicitados: "",
    nomina_impactada: "", tipo_vacaciones: "TOMADAS_Y_PAGADAS", observaciones: "",
  });

  const [reciboData, setReciboData] = useState(null);

  useEffect(() => {
    cargarConfiguracionMapeo();
    cargarReglasGlobales();
    cargarEmpleados();
    cargarVacaciones();
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

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre_completo, numero_empleado, fecha_ingreso, puesto, departamento, activo, empresa, salario_diario, salario_complemento")
        .eq("activo", true);

      if (error) { console.error("Error cargando empleados:", error); setEmpleados([]); return; }

      const datosOrdenados = (data || []).sort((a, b) => {
        const deptoA = (a.departamento || "Sin Departamento").toLowerCase();
        const deptoB = (b.departamento || "Sin Departamento").toLowerCase();
        if (deptoA !== deptoB) return deptoA.localeCompare(deptoB);
        const puestoA = (a.puesto || "Sin Puesto").toLowerCase();
        const puestoB = (b.puesto || "Sin Puesto").toLowerCase();
        return puestoA.localeCompare(puestoB);
      });
      
      setEmpleados(datosOrdenados);
      
      if (datosOrdenados.length === 0) {
        console.warn("⚠️ ADVERTENCIA: No hay empleados en la base de datos");
      } else {
        console.log(`✅ Empleados cargados: ${datosOrdenados.length}`);
      }
      
      if (datosOrdenados.length > 0 && !empleadoKardex) {
        const emp = datosOrdenados[0];
        const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
        const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
        setEmpleadoKardex({ empleado: emp, antiguedad, resumen });
      }
    } catch (err) { console.error("Excepción en cargarEmpleados:", err); setEmpleados([]); }
  };

  const cargarVacaciones = async () => {
    try {
      const { data, error } = await supabase.from("vacaciones").select("*, empleados (id, nombre_completo, numero_empleado, fecha_ingreso)").order("created_at", { ascending: false });
      if (!error) setVacaciones(data || []);
    } catch (err) { console.error("Error cargando vacaciones:", err); }
  };

  const procesarArchivoExcel = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (empleados.length === 0) {
      alert("⚠️ No hay empleados registrados en la base de datos.\n\nPara importar vacaciones, primero debes:\n1. Ir a 'Importar Empleados'\n2. Cargar el archivo de nómina.\n3. Volver aquí e importar las vacaciones.");
      return;
    }

    setArchivoVacaciones(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        if (rows.length === 0) { alert("⚠️ El archivo está vacío."); return; }
        
        // 🔥 ÍNDICE DE BÚSQUEDA OPTIMIZADO (Basado en la estructura de Empleados)
        const indiceEmpleados = new Map();
        empleados.forEach(emp => {
          const nombreNorm = normalizarNombre(emp.nombre_completo);
          const numeroNorm = String(emp.numero_empleado || "").trim();
          if (nombreNorm) indiceEmpleados.set(nombreNorm, emp);
          if (numeroNorm) indiceEmpleados.set("num_" + numeroNorm, emp);
        });

        console.log(`🔍 Índice de empleados creado: ${indiceEmpleados.size} entradas`);

        const datosProcesados = rows.map((fila, index) => {
          // 🔥 DETECCIÓN FLEXIBLE DE COLUMNAS DEL CSV "CONTROL GENERAL"
          const clavesFila = Object.keys(fila);
          
          const numEmpKey = clavesFila.find(k => /n[^a-z]*o|numero|no\.|proveedor/i.test(k));
          const nombreEmpKey = clavesFila.find(k => /nombre|trabajador|colaborador/i.test(k));
          
          const valorBusquedaNum = numEmpKey ? String(fila[numEmpKey]).trim() : "";
          const valorBusquedaNom = nombreEmpKey ? String(fila[nombreEmpKey]).trim() : "";
          
          let empleadoMatch = null;
          let metodoVinculacion = "No vinculado";

          if (valorBusquedaNum) {
            const porNumero = indiceEmpleados.get("num_" + valorBusquedaNum);
            if (porNumero) {
              empleadoMatch = porNumero;
              metodoVinculacion = "Por Número";
            }
          }

          if (!empleadoMatch && valorBusquedaNom) {
            const busquedaNorm = normalizarNombre(valorBusquedaNom);
            const porNombreExacto = indiceEmpleados.get(busquedaNorm);
            
            if (porNombreExacto) {
              empleadoMatch = porNombreExacto;
              metodoVinculacion = "Por Nombre Exacto";
            } else {
              // Búsqueda parcial (por si el CSV tiene nombres ligeramente distintos)
              const coincidenciaParcial = empleados.find(emp => {
                const empNorm = normalizarNombre(emp.nombre_completo);
                return empNorm.includes(busquedaNorm) || busquedaNorm.includes(empNorm);
              });
              if (coincidenciaParcial) {
                empleadoMatch = coincidenciaParcial;
                metodoVinculacion = "Por Nombre Parcial";
              }
            }
          }

          const registro = {
            id_fila: index, 
            empleado_id: empleadoMatch ? empleadoMatch.id : null,
            nombre_encontrado: empleadoMatch ? empleadoMatch.nombre_completo : "No encontrado",
            numero_encontrado: empleadoMatch ? empleadoMatch.numero_empleado : "N/A",
            estatus_match: empleadoMatch ? "✅ Vinculado" : "❌ Sin vincular", 
            metodo_vinculacion: metodoVinculacion,
            datos_vacaciones: {},
            busqueda_raw_num: valorBusquedaNum,
            busqueda_raw_nom: valorBusquedaNom,
            busqueda_normalizada: normalizarNombre(valorBusquedaNom)
          };

          // Mapeo dinámico de otros campos (días, fechas, etc.)
          if (configuracionMapeo?.asignacion) {
            Object.keys(fila).forEach(keyExcel => {
              const info = configuracionMapeo.asignacion[keyExcel.trim().toUpperCase()];
              if (info && info.tablaDestino === "vacaciones") {
                const campoBD = info.esManual ? info.campoManual : info.campoDestino;
                if (campoBD) registro.datos_vacaciones[campoBD] = fila[keyExcel];
              }
            });
          }

          // Fallback manual para columnas comunes del CSV si no hay mapeo configurado
          if (Object.keys(registro.datos_vacaciones).length === 0) {
            const diasKey = clavesFila.find(k => /d[ií]as/i.test(k) && !/pendiente/i.test(k));
            const inicioKey = clavesFila.find(k => /inicio/i.test(k));
            const finKey = clavesFila.find(k => /termino|fin/i.test(k));
            
            if (diasKey) registro.datos_vacaciones.dias_solicitados = Number(fila[diasKey]) || 0;
            if (inicioKey) registro.datos_vacaciones.fecha_inicio = fila[inicioKey];
            if (finKey) registro.datos_vacaciones.fecha_fin = fila[finKey];
          }

          if (!registro.datos_vacaciones.tipo_vacaciones) registro.datos_vacaciones.tipo_vacaciones = "TOMADAS_Y_PAGADAS";
          if (!registro.datos_vacaciones.estatus) registro.datos_vacaciones.estatus = "APROBADO";

          return registro;
        });

        const vinculados = datosProcesados.filter(d => d.empleado_id);
        const noVinculados = datosProcesados.filter(d => !d.empleado_id);
        
        console.log(`✅ Vinculados: ${vinculados.length}`);
        console.log(`❌ No vinculados: ${noVinculados.length}`);
        
        if (noVinculados.length > 0 && noVinculados.length < 10) {
          console.log("📋 Ejemplos de no vinculados:");
          noVinculados.forEach(d => {
            console.log(`  [${d.metodo_vinculacion}] CSV: "${d.busqueda_raw_nom}" (Norm: "${d.busqueda_normalizada}") vs BD`);
          });
        }

        setDatosImportados(datosProcesados);
        setModoRevision(true);
        alert(`✅ Se procesaron ${datosProcesados.length} filas.\n✅ Vinculados: ${vinculados.length}\n❌ Sin vincular: ${noVinculados.length}\n\nRevisa la consola (F12) si hay errores de vinculación.`);
      } catch (error) { 
        console.error("Error al procesar archivo:", error); 
        alert("Error al leer el archivo: " + error.message); 
      }
    };
    reader.readAsBinaryString(file);
  };

  const guardarImportacionRevisada = async () => {
    const datosValidos = datosImportados.filter(d => d.empleado_id);
    if (datosValidos.length === 0) { alert("⚠️ No hay datos vinculados."); return; }
    if (!window.confirm(`¿Guardar ${datosValidos.length} registros?`)) return;
    
    let errores = 0;
    for (const item of datosValidos) {
      const { error } = await supabase.from("vacaciones").insert([{ 
        empleado_id: item.empleado_id, 
        ...item.datos_vacaciones 
      }]);
      if (error) errores++;
    }
    
    if (errores === 0) {
      alert("✅ Importación guardada.");
      setModoRevision(false); setDatosImportados([]); setArchivoVacaciones(null);
      await cargarVacaciones();
    } else { 
      alert(`⚠️ Se guardaron algunos, pero hubo ${errores} errores.`); 
    }
  };

  const actualizarDatoImportado = (idFila, campo, valor) => {
    setDatosImportados(prev => prev.map(item => 
      item.id_fila === idFila ? { ...item, datos_vacaciones: { ...item.datos_vacaciones, [campo]: valor } } : item
    ));
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
    const filtrados = empleados.filter(e => !busquedaActiva || String(e.id) === String(empleadoSeleccionadoId));
    const agrupado = {};
    filtrados.forEach(emp => {
      const depto = emp.departamento || "Sin Departamento";
      const puesto = emp.puesto || "Sin Puesto";
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
    if (empleadoKardex && String(vacacion.empleado_id) === String(empleadoKardex.empleado.id)) {
      const antiguedad = calcularAntiguedad(empleadoKardex.empleado.fecha_ingreso);
      const resumen = obtenerResumenEmpleado(empleadoKardex.empleado.id, empleadoKardex.empleado.fecha_ingreso);
      setEmpleadoKardex({ empleado: empleadoKardex.empleado, antiguedad, resumen });
    }
  };

  const sugerenciasEmpleados = empleados.filter(emp => {
    const q = busquedaTexto.toLowerCase();
    return (emp.nombre_completo || "").toLowerCase().includes(q) || (emp.numero_empleado || "").toString().toLowerCase().includes(q);
  });

  return (
    <Layout>
      <div className="space-y-6 print:hidden">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">🏖️ Control de Vacaciones</h1>
            <p className="text-slate-500">Sincronizado con la base de datos de Empleados</p>
          </div>
          <button onClick={cargarEmpleados} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-200">
            🔄 Recargar Empleados
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
            <p className="text-amber-700 mb-4">Para importar vacaciones, primero debes cargar la nómina de empleados.</p>
            <a href="/empleados/importar" className="inline-block bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-semibold">
              Ir a Importar Empleados →
            </a>
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

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-slate-800">📥 Importar Archivo de Vacaciones</h2>
          {!modoRevision ? (
            <input type="file" accept=".xlsx,.xls,.csv" onChange={procesarArchivoExcel} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-amber-50 p-3 rounded-lg border border-amber-200">
                <span className="text-sm text-amber-800 font-semibold">📝 Modo Revisión: {datosImportados.length} filas</span>
                <div className="flex gap-2">
                  <button onClick={() => { setModoRevision(false); setDatosImportados([]); setArchivoVacaciones(null); }} className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1">Cancelar</button>
                  <button onClick={guardarImportacionRevisada} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">💾 Guardar en BD</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 border-b">Estado</th>
                      <th className="p-3 border-b">Método</th>
                      <th className="p-3 border-b">Empleado</th>
                      {datosImportados.length > 0 && Object.keys(datosImportados[0].datos_vacaciones).map(key => (<th key={key} className="p-3 border-b capitalize">{key.replace(/_/g, ' ')}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {datosImportados.map((fila) => (
                      <tr key={fila.id_fila} className={`border-b hover:bg-slate-50 ${!fila.empleado_id ? 'bg-red-50' : ''}`}>
                        <td className="p-3"><span className={`text-[10px] font-bold px-2 py-1 rounded ${fila.empleado_id ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{fila.estatus_match}</span></td>
                        <td className="p-3 text-[10px] text-slate-500">{fila.metodo_vinculacion}</td>
                        <td className="p-3 font-medium">{fila.nombre_encontrado} <span className="text-gray-400">({fila.numero_encontrado})</span></td>
                        {fila.empleado_id && Object.keys(fila.datos_vacaciones).map(key => (
                          <td key={key} className="p-2">
                            {key.includes('fecha') ? (
                              <input type="date" value={fila.datos_vacaciones[key] || ""} onChange={(e) => actualizarDatoImportado(fila.id_fila, key, e.target.value)} className="w-full border rounded px-2 py-1" />
                            ) : key === 'tipo_vacaciones' ? (
                              <select value={fila.datos_vacaciones[key] || "TOMADAS_Y_PAGADAS"} onChange={(e) => actualizarDatoImportado(fila.id_fila, key, e.target.value)} className="w-full border rounded px-2 py-1">
                                <option value="TOMADAS_Y_PAGADAS">Tomadas y Pagadas</option>
                                <option value="PAGADAS_NO_TOMADAS">Pagadas No Tomadas</option>
                              </select>
                            ) : (
                              <input type="text" value={fila.datos_vacaciones[key] || ""} onChange={(e) => actualizarDatoImportado(fila.id_fila, key, e.target.value)} className="w-full border rounded px-2 py-1" />
                            )}
                          </td>
                        ))}
                        {!fila.empleado_id && <td colSpan="10" className="p-3 text-red-600 text-xs">⚠️ No se encontró. Buscado: "{fila.busqueda_raw_nom}"</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="relative flex-1">
            <input type="text" placeholder="🔎 Buscar empleado..." value={busquedaTexto} onChange={(e) => { setBusquedaTexto(e.target.value); setEmpleadoSeleccionadoId(""); setMostrarSugerencias(true); }} onFocus={() => setMostrarSugerencias(true)} className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
            {mostrarSugerencias && busquedaTexto.trim() !== "" && (
              <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
                {sugerenciasEmpleados.map((emp) => (
                  <li key={emp.id} onClick={() => { 
                    setBusquedaTexto(`[${emp.numero_empleado}] ${emp.nombre_completo}`); 
                    setEmpleadoSeleccionadoId(emp.id); 
                    setMostrarSugerencias(false); 
                    setBusquedaActiva(true);
                    const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
                    const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
                    setEmpleadoKardex({ empleado: emp, antiguedad, resumen });
                  }} className="p-3 hover:bg-blue-50 cursor-pointer text-sm border-b flex justify-between">
                    <span className="font-medium">{emp.nombre_completo}</span>
                    <span className="text-xs text-gray-400">#{emp.numero_empleado}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {busquedaActiva && <button onClick={() => { setBusquedaActiva(false); setBusquedaTexto(""); setEmpleadoSeleccionadoId(""); }} className="mt-2 text-sm text-red-600 hover:underline">Limpiar filtro</button>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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

            <div className="bg-white rounded-2xl shadow-lg overflow-x-auto p-6">
              <h2 className="text-xl font-bold mb-4">📋 Historial de Solicitudes</h2>
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3 text-left">Empleado</th>
                    <th className="p-3 text-center">Periodo</th>
                    <th className="p-3 text-center">Días</th>
                    <th className="p-3 text-center">Modalidad</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vacaciones.slice(0, 20).map((v) => (
                    <tr key={v.id} className="border-t hover:bg-slate-50">
                      <td className="p-3 font-medium">{v.empleados?.nombre_completo}</td>
                      <td className="p-3 text-center text-xs">{v.fecha_inicio} al {v.fecha_fin}</td>
                      <td className="p-3 text-center font-bold">{v.dias_solicitados}</td>
                      <td className="p-3 text-center text-xs">
                        <span className={`px-2 py-1 rounded-full font-bold ${v.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {v.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? "💰 Pagadas No Tomadas" : "✅ Tomadas"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${v.estatus === "APROBADO" ? "bg-green-100 text-green-700" : v.estatus === "RECHAZADO" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{v.estatus}</span>
                      </td>
                      <td className="p-3 text-center">
                        {v.estatus === "PENDIENTE" && (
                          <div className="flex justify-center gap-2">
                            <button onClick={() => cambiarEstatusVacacion(v, "APROBADO")} className="text-green-600 hover:text-green-800 text-xs font-bold">Aprobar</button>
                            <button onClick={() => cambiarEstatusVacacion(v, "RECHAZADO")} className="text-red-600 hover:text-red-800 text-xs font-bold">Rechazar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-1">
            {empleadoKardex ? (
              <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-6">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                  <h3 className="text-lg font-bold">📋 Kardex</h3>
                  <button onClick={() => setEmpleadoKardex(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>
                
                <div className="mb-4">
                  <h4 className="font-bold text-slate-800">{empleadoKardex.empleado.nombre_completo}</h4>
                  <p className="text-xs text-slate-500">#{empleadoKardex.empleado.numero_empleado}</p>
                  <p className="text-xs text-slate-500">{empleadoKardex.empleado.departamento} - {empleadoKardex.empleado.puesto}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
                  <div><span className="text-gray-500 text-xs block">Antigüedad</span><strong>{empleadoKardex.antiguedad.texto}</strong></div>
                  <div><span className="text-gray-500 text-xs block">Días por Ley</span><strong className="text-blue-600">{empleadoKardex.resumen.diasCorrespondientes}</strong></div>
                  <div><span className="text-gray-500 text-xs block">Descontados</span><strong className="text-amber-600">{empleadoKardex.resumen.diasTomados}</strong></div>
                  <div><span className="text-gray-500 text-xs block">Remanentes</span><strong className="text-emerald-600">{empleadoKardex.resumen.diasRemanentes}</strong></div>
                </div>

                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h4 className="font-bold text-blue-900 text-sm mb-3">📄 Generar Recibo</h4>
                  <div className="space-y-2 text-xs">
                    <input type="number" id="reciboDiasKardex" placeholder="Días a tomar" className="w-full border rounded p-2 bg-white" />
                    <input type="date" id="reciboInicioKardex" className="w-full border rounded p-2 bg-white" />
                    <input type="date" id="reciboFinKardex" className="w-full border rounded p-2 bg-white" />
                    <button 
                      onClick={() => {
                        const dias = document.getElementById('reciboDiasKardex').value;
                        const inicio = document.getElementById('reciboInicioKardex').value;
                        const fin = document.getElementById('reciboFinKardex').value;
                        if(!dias || !inicio || !fin) return alert("Ingresa días y fechas");
                        generarRecibo(empleadoKardex.empleado, dias, inicio, fin);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold"
                    >
                      🖨️ Generar Recibo
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <h4 className="font-bold text-blue-900 text-sm mb-3">➕ Agregar Registro</h4>
                  <div className="space-y-2 text-xs">
                    <input type="date" value={formKardex.fecha_inicio} onChange={(e) => setFormKardex({...formKardex, fecha_inicio: e.target.value})} className="w-full border rounded p-2 bg-white" placeholder="Inicio" />
                    <input type="date" value={formKardex.fecha_fin} onChange={(e) => setFormKardex({...formKardex, fecha_fin: e.target.value})} className="w-full border rounded p-2 bg-white" placeholder="Fin" />
                    <input type="number" value={formKardex.dias_solicitados} onChange={(e) => setFormKardex({...formKardex, dias_solicitados: e.target.value})} className="w-full border rounded p-2 bg-white" placeholder="Días" />
                    <input type="text" value={formKardex.nomina_impactada} onChange={(e) => setFormKardex({...formKardex, nomina_impactada: e.target.value})} className="w-full border rounded p-2 bg-white" placeholder="Nómina Impactada" />
                    <select value={formKardex.tipo_vacaciones} onChange={(e) => setFormKardex({...formKardex, tipo_vacaciones: e.target.value})} className="w-full border rounded p-2 bg-white">
                      <option value="TOMADAS_Y_PAGADAS">Tomadas y Pagadas</option>
                      <option value="PAGADAS_NO_TOMADAS">Pagadas No Tomadas</option>
                    </select>
                    <input type="text" value={formKardex.observaciones} onChange={(e) => setFormKardex({...formKardex, observaciones: e.target.value})} className="w-full border rounded p-2 bg-white" placeholder="Observaciones" />
                    <button onClick={agregarDesdeKardex} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Guardar en Kardex</button>
                  </div>
                </div>

                <h4 className="font-bold mb-2 text-sm">Historial Aprobado</h4>
                <div className="max-h-64 overflow-y-auto border rounded-xl">
                  {empleadoKardex.resumen.solicitudesAprobadas.length === 0 ? (
                    <p className="p-4 text-center text-sm text-gray-500">Sin registros.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">Fechas</th><th className="p-2">Días</th><th className="p-2">Modalidad</th></tr></thead>
                      <tbody>
                        {empleadoKardex.resumen.solicitudesAprobadas.map(item => (
                          <tr key={item.id} className="border-t">
                            <td className="p-2 text-[10px]">{item.fecha_inicio} al {item.fecha_fin}</td>
                            <td className="p-2 text-center font-bold">{item.dias_solicitados}</td>
                            <td className="p-2 text-center text-[10px]">{item.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? "💰" : "✅"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-6 text-center">
                <div className="text-6xl mb-4">👆</div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Selecciona un Empleado</h3>
                <p className="text-sm text-slate-500">Haz clic en "👁️ Ver" en cualquier empleado.</p>
              </div>
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
                  <div>
                    <p className="text-xs font-bold">Fecha Inicial Vacaciones:</p>
                    <p className="bg-blue-50 p-1">{reciboData.diaInicio} {reciboData.mesInicio} {reciboData.anoInicio}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold">Fecha Final Vacaciones:</p>
                    <p className="bg-blue-50 p-1">{reciboData.diaFin} {reciboData.mesFin} {reciboData.anoFin}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-bold">Observaciones:</p>
                    <p className="bg-blue-50 p-1 min-h-[2rem]">&nbsp;</p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-black p-6">
                <div className="text-center mb-4">
                  <h1 className="text-xl font-black uppercase">PLÁSTICOS AMBIENTALES DEL BAJIO</h1>
                  <h2 className="text-lg font-bold mt-2">SOLICITUD Y AUTORIZACION DE</h2>
                  <h2 className="text-lg font-bold">VACACIONES</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div className="col-span-2">
                    <p className="text-xs font-bold">Nombre de la Empresa: <span className="font-normal">Plástico Ambientales del Bajío S.A. de C.V.</span></p>
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