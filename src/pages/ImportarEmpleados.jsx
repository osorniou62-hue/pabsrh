import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";
import { supabase } from "../services/supabase";

const toSnakeCase = (str) => {
  return String(str || "")
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-z0-9_]/g, '');
};

export default function ImportarEmpleados() {
  const [archivo, setArchivo] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);

  useEffect(() => {
    cargarPeriodos();
    cargarConfiguracionMapeo();
  }, []);

  const cargarPeriodos = async () => {
    const { data } = await supabase.from("periodos_nomina").select("*").order("fecha_inicio", { ascending: false });
    setPeriodos(data || []);
  };

  const cargarConfiguracionMapeo = async () => {
    try {
      const { data } = await supabase
        .from("configuracion_tablas")
        .select("configuracion")
        .eq("clave", "config_mapeo_columnas_dinamico")
        .maybeSingle();
      
      if (data?.configuracion) {
        setConfiguracionMapeo(data.configuracion);
      } else {
        const local = localStorage.getItem("config_mapeo_columnas_dinamico");
        if (local) setConfiguracionMapeo(JSON.parse(local));
      }
    } catch (err) {
      console.error("Error cargando mapeo:", err);
    }
  };

  const convertirFechaExcel = (valor) => {
    if (!valor) return null;
    if (typeof valor === "number") {
      const fecha = new Date((valor - 25569) * 86400 * 1000);
      if (!isNaN(fecha.getTime())) return fecha.toISOString().split("T")[0];
    }
    if (typeof valor === "string" && valor.includes("/")) {
      const partes = valor.split("/");
      if (partes.length === 3) return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    }
    return null;
  };

  const limpiarMonto = (valor) => {
    if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
    if (!valor) return 0;
    const limpio = String(valor).replace(/[^0-9.-]+/g, "");
    const numero = parseFloat(limpio);
    return isNaN(numero) ? 0 : numero;
  };

  const analizarNomina = (rows) => {
    if (!rows || rows.length < 2) return;

    const encabezadosRaw = rows[0].map((h) => String(h || "").trim());
    const encabezadosUpper = encabezadosRaw.map(h => h.toUpperCase());

    const mapaExcelADb = {};
    if (configuracionMapeo?.asignacion) {
      Object.entries(configuracionMapeo.asignacion).forEach(([excelCol, info]) => {
        if (info.tablaDestino === 'empleados' && (info.campoDestino || info.campoManual)) {
          const dbCol = info.esManual ? info.campoManual : info.campoDestino;
          mapaExcelADb[excelCol.trim().toUpperCase()] = toSnakeCase(dbCol);
        }
      });
    }

    const asegurarEsencial = (dbKey, posiblesNombresExcel) => {
      if (!Object.values(mapaExcelADb).includes(dbKey)) {
        const idx = encabezadosUpper.findIndex(h => posiblesNombresExcel.some(p => h.includes(p)));
        if (idx !== -1) {
          mapaExcelADb[encabezadosRaw[idx].toUpperCase()] = dbKey;
        }
      }
    };

    asegurarEsencial('numero_empleado', ['#', 'NUMERO', 'NO.', 'NUM EMPLEADO']);
    asegurarEsencial('nombre_completo', ['NOMBRE', 'COLABORADOR']);
    asegurarEsencial('puesto', ['PUESTO']);
    asegurarEsencial('departamento', ['DEPARTAMENTO', 'LINEA', 'AREA']);
    asegurarEsencial('fecha_ingreso', ['ALTA', 'FECHA INGRESO', 'INGRESO']);
    asegurarEsencial('sueldo_base', ['SUELDO BASE', 'SALARIO BASE']);

    const encontrados = [];
    const dataRows = rows.slice(1);

    const numEmpKey = Object.keys(mapaExcelADb).find(k => mapaExcelADb[k] === 'numero_empleado');
    const idxNum = numEmpKey ? encabezadosRaw.findIndex(h => h.toUpperCase() === numEmpKey) : -1;

    dataRows.forEach((fila) => {
      if (idxNum === -1 || !fila[idxNum] || String(fila[idxNum]).trim() === '') return;

      const nuevoEmpleado = {};

      Object.entries(mapaExcelADb).forEach(([excelCol, dbCol]) => {
        const idx = encabezadosRaw.findIndex(h => h.toUpperCase() === excelCol);
        if (idx !== -1) {
          let val = fila[idx];
          
          if (dbCol.includes('sueldo') || dbCol.includes('bono') || dbCol.includes('total') || dbCol.includes('descuento') || dbCol.includes('saldo') || dbCol.includes('monto') || dbCol.includes('neto') || dbCol.includes('dias') || dbCol.includes('horas')) {
            val = limpiarMonto(val);
          } else if (dbCol.includes('fecha') || dbCol.includes('alta') || dbCol.includes('ingreso')) {
            val = convertirFechaExcel(val);
          } else {
            // 🔥 CORRECCIÓN: Convertir a string ANTES de hacer trim
            val = val !== null && val !== undefined ? String(val).trim() : "";
          }
          nuevoEmpleado[dbCol] = val;
        }
      });

      // 🔥 CORRECCIÓN: Convertir a string ANTES de asignar valores por defecto
      if (!nuevoEmpleado.nombre_completo) nuevoEmpleado.nombre_completo = "SIN NOMBRE";
      if (!nuevoEmpleado.puesto) nuevoEmpleado.puesto = "SIN PUESTO";
      if (!nuevoEmpleado.departamento) nuevoEmpleado.departamento = "GENERAL";
      
      // Asegurar que sean strings
      nuevoEmpleado.nombre_completo = String(nuevoEmpleado.nombre_completo);
      nuevoEmpleado.puesto = String(nuevoEmpleado.puesto);
      nuevoEmpleado.departamento = String(nuevoEmpleado.departamento);

      encontrados.push(nuevoEmpleado);
    });

    setResumen(null); 
    setEmpleados(encontrados);
  };

  const leerArchivo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        analizarNomina(rows);
      } catch (error) {
        console.error(error);
        alert("Error leyendo el archivo CSV/Excel");
      }
    };
    reader.readAsBinaryString(file);
  };

  const importarEmpleados = async () => {
    if (empleados.length === 0) {
      alert("No hay empleados para importar");
      return;
    }
    if (!periodoId) {
      alert("⚠️ Por favor selecciona un Período antes de importar");
      return;
    }

    try {
      setLoading(true);
      const { data: departamentos } = await supabase.from("departamentos").select("*");
      const { data: puestos } = await supabase.from("puestos").select("*");
      const { data: lineas } = await supabase.from("lineas").select("*");

      let insertados = 0;
      let actualizados = 0;
      const errores = [];

      for (const empleadoData of empleados) {
        const { numero_empleado, nombre_completo, puesto: puestoRaw, departamento: deptoRaw, ...camposDinamicos } = empleadoData;

        // 🔥 CORRECCIÓN CLAVE: Envolver en String() para evitar el error "trim is not a function"
        const nombreDepartamento = String(deptoRaw || "GENERAL").trim().toUpperCase();
        const nombrePuesto = String(puestoRaw || "SIN PUESTO").trim().toUpperCase();

        const equivalencias = { "MTTO NAVE 3": "MTTO", "AYU CHOFER": "LOGISTICA INTERNA", CHOFER: "LOGISTICA INTERNA", "LAVADO": "LOGISTICA INTERNA" };
        const deptoFinal = equivalencias[nombreDepartamento] || nombreDepartamento;
        
        let lineaId = null;
        let deptoNombreFinal = deptoFinal;
        if (["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].includes(deptoFinal)) {
          const linea = lineas.find((l) => l.nombre === deptoFinal);
          if (linea) lineaId = linea.id;
          deptoNombreFinal = "MOLIENDA";
        }

        let departamento = departamentos.find((d) => String(d.nombre || "").trim().toUpperCase() === deptoNombreFinal);
        if (!departamento && departamentos.length > 0) departamento = departamentos[0];

        let puesto = puestos.find((p) => String(p.nombre || "").trim().toUpperCase() === nombrePuesto && p.departamento_id === departamento?.id);
        if (!puesto && departamento) {
          const { data: nuevoPuesto, error: puestoError } = await supabase
            .from("puestos")
            .insert([{ nombre: nombrePuesto, departamento_id: departamento.id, activo: true }])
            .select()
            .single();
          if (!puestoError && nuevoPuesto) {
            puesto = nuevoPuesto;
            puestos.push(nuevoPuesto);
          }
        }

        const datosEmpleadoPayload = {
          nombre_completo,
          ...camposDinamicos, 
          departamento_id: departamento ? departamento.id : null,
          puesto_id: puesto ? puesto.id : null,
          linea_id: lineaId,
          activo: true,
        };

        Object.keys(datosEmpleadoPayload).forEach(key => {
          if (datosEmpleadoPayload[key] === undefined || datosEmpleadoPayload[key] === null || datosEmpleadoPayload[key] === "") {
            delete datosEmpleadoPayload[key];
          }
        });

        const { data: existente } = await supabase
          .from("empleados")
          .select("id")
          .eq("numero_empleado", String(numero_empleado))
          .maybeSingle();

        let empId = null;

        if (existente) {
          empId = existente.id;
          const { error: updateError } = await supabase
            .from("empleados")
            .update(datosEmpleadoPayload)
            .eq("id", empId);
          if (updateError) {
            errores.push({ numero: numero_empleado, motivo: updateError.message });
            continue;
          }
          actualizados++;
        } else {
          const { data: empleadoGuardado, error: insertError } = await supabase
            .from("empleados")
            .insert([{ numero_empleado: String(numero_empleado), ...datosEmpleadoPayload }])
            .select()
            .single();
          if (insertError) {
            errores.push({ numero: numero_empleado, motivo: insertError.message });
            continue;
          }
          if (empleadoGuardado) {
            empId = empleadoGuardado.id;
            insertados++;
          }
        }

        if (empId) {
          const payloadIncidencia = { empleado_id: empId, periodo_id: Number(periodoId) };
          let tieneIncidencia = false;

          if (camposDinamicos.horas_extra !== undefined) { payloadIncidencia.horas_extra = Number(camposDinamicos.horas_extra); tieneIncidencia = true; }
          if (camposDinamicos.dias_vacaciones !== undefined) { payloadIncidencia.dias_vacaciones = Number(camposDinamicos.dias_vacaciones); tieneIncidencia = true; }
          if (camposDinamicos.monto_final_semanal !== undefined) { payloadIncidencia.monto_final_semanal = Number(camposDinamicos.monto_final_semanal); tieneIncidencia = true; }
          if (camposDinamicos.descuento_varios !== undefined) { payloadIncidencia.descuento_varios = Number(camposDinamicos.descuento_varios); tieneIncidencia = true; }
          if (camposDinamicos.saldo_prestamo !== undefined) { payloadIncidencia.saldo_prestamo = Number(camposDinamicos.saldo_prestamo); tieneIncidencia = true; }

          if (tieneIncidencia) {
            await supabase.from("incidencias").upsert([payloadIncidencia], {
              onConflict: "empleado_id, periodo_id",
            });
          }
        }
      }

      setResumen({
        insertados,
        actualizados,
        totalErrores: errores.length,
        detallesErrores: errores,
        periodoNombre: periodos.find((p) => String(p.id) === String(periodoId))?.descripcion || "",
      });

    } catch (error) {
      console.error(error);
      alert("Error durante la importación: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div>
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">📥 Importar Empleados</h1>
            <p className="text-gray-500 mt-2">
              Lectura dinámica basada en la <strong>Configuración de Tablas</strong> (con respaldos inteligentes)
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Archivo" valor={archivo ? "Cargado" : "Sin archivo"} icono="📄" color="text-blue-600" />
          <KpiCard titulo="Detectados" valor={empleados.length} icono="👥" color="text-green-600" />
          <KpiCard titulo="Listos" valor={empleados.length} icono="✅" color="text-purple-600" />
        </div>

        {resumen && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-emerald-900">🎉 ¡Importación Finalizada!</h2>
                <p className="text-sm text-emerald-700">Período: <span className="font-semibold">{resumen.periodoNombre}</span></p>
              </div>
              <button onClick={() => setResumen(null)} className="text-xs text-gray-500 underline">Cerrar</button>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white p-3 rounded-xl border"><span className="block text-2xl font-bold text-emerald-600">{resumen.insertados}</span><span className="text-xs text-gray-500">Nuevos</span></div>
              <div className="bg-white p-3 rounded-xl border"><span className="block text-2xl font-bold text-blue-600">{resumen.actualizados}</span><span className="text-xs text-gray-500">Actualizados</span></div>
              <div className="bg-white p-3 rounded-xl border"><span className="block text-2xl font-bold text-red-500">{resumen.totalErrores}</span><span className="text-xs text-gray-500">Errores</span></div>
            </div>
            {resumen.detallesErrores && resumen.detallesErrores.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 p-3 rounded-lg max-h-40 overflow-y-auto text-xs text-red-700">
                <p className="font-bold mb-1">Detalle de errores:</p>
                {resumen.detallesErrores.map((err, i) => (
                  <div key={i}>• Empleado #{err.numero}: {err.motivo}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col gap-4">
            <label className="font-semibold text-gray-700">1. Selecciona el Período:</label>
            <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} className="border rounded-xl p-3 bg-slate-50">
              <option value="">-- Selecciona Período --</option>
              {periodos.map((p) => (<option key={p.id} value={p.id}>{p.descripcion}</option>))}
            </select>

            <label className="font-semibold text-gray-700 mt-2">2. Carga el archivo CSV / Excel:</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={leerArchivo} className="border rounded-xl p-3 w-full" />

            <button 
              onClick={importarEmpleados} 
              disabled={loading || empleados.length === 0} 
              className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-medium transition-all"
            >
              {loading ? "⏳ Importando..." : "🚀 Importar Empleados (Usando Mapeo Configurado)"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Puesto</th>
                <th className="p-3">Departamento</th>
                {empleados.length > 0 && Object.keys(empleados[0])
                  .filter(k => ['sueldo', 'bono', 'neto', 'antiguedad', 'total', 'complemento'].some(word => k.includes(word)))
                  .slice(0, 5).map(k => (
                    <th key={k} className="p-3 text-right capitalize">{k.replace(/_/g, ' ')}</th>
                  ))
                }
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado, index) => (
                <tr key={index} className="border-t hover:bg-slate-50">
                  <td className="p-3">{empleado.numero_empleado}</td>
                  <td className="p-3 font-medium">{empleado.nombre_completo}</td>
                  <td className="p-3 font-semibold text-blue-600">{empleado.puesto}</td>
                  <td className="p-3">{empleado.departamento}</td>
                  {empleados.length > 0 && Object.keys(empleados[0])
                    .filter(k => ['sueldo', 'bono', 'neto', 'antiguedad', 'total', 'complemento'].some(word => k.includes(word)))
                    .slice(0, 5).map(k => (
                      <td key={k} className="p-3 text-right font-bold text-slate-700">
                        {empleado[k] !== null && empleado[k] !== undefined && empleado[k] !== "" ? (typeof empleado[k] === 'number' ? `$${empleado[k].toFixed(2)}` : String(empleado[k])) : "-"}
                      </td>
                    ))
                  }
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}