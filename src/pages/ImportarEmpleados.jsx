import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

import { supabase } from "../services/supabase";

export default function ImportarEmpleados() {
  const [archivo, setArchivo] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    cargarPeriodos();
  }, []);

  const cargarPeriodos = async () => {
    const { data } = await supabase
      .from("periodos_nomina")
      .select("*")
      .order("fecha_inicio", { ascending: false });
    setPeriodos(data || []);
  };

  const esLineaMolienda = (valor) => {
    return ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].includes(valor);
  };

  const convertirFechaExcel = (valor) => {
    if (!valor) return null;
    if (typeof valor === "number") {
      const fecha = new Date((valor - 25569) * 86400 * 1000);
      if (!isNaN(fecha.getTime())) {
        return fecha.toISOString().split("T")[0];
      }
    }
    if (typeof valor === "string" && valor.includes("/")) {
      const partes = valor.split("/");
      if (partes.length === 3) {
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      }
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

    // Fila 0 contiene los nombres de las columnas reales del CSV
    const encabezadosRaw = rows[0].map((h) => String(h || "").trim().toUpperCase());
    
    // Buscamos dinámicamente el índice de cada columna basándonos en su nombre exacto
    const idxNumEmpleado = encabezadosRaw.findIndex((h) => h === "#" || h === "NUMERO" || h === "NO.");
    const idxPuesto = encabezadosRaw.findIndex((h) => h === "PUESTO");
    const idxNombre = encabezadosRaw.findIndex((h) => h === "COLABORADOR" || h === "NOMBRE");
    const idxAlta = encabezadosRaw.findIndex((h) => h === "ALTA" || h === "FECHA ALTA");
    const idxSueldoBase = encabezadosRaw.findIndex((h) => h === "SUELDO BASE");

    // Bonos y conceptos
    const idxBonoPuesto = encabezadosRaw.findIndex((h) => h === "BONO POR PUESTO");
    
    // Buscamos todas las ocurrencias de pago/bono puntualidad y asistencia
    const indicesPuntualidad = encabezadosRaw.reduce((acc, h, i) => (h.includes("PUNTUALIDAD") ? [...acc, i] : acc), []);
    const indicesAsistencia = encabezadosRaw.reduce((acc, h, i) => (h.includes("ASISTENCIA") ? [...acc, i] : acc), []);

    const idxHorasExtra = encabezadosRaw.findIndex((h) => h.includes("HORAS EXTRAS"));
    const idxBonoDesempeno = encabezadosRaw.findIndex((h) => h.includes("DESEMPEÑO"));
    const idxApoyoMedico = encabezadosRaw.findIndex((h) => h.includes("APOYO MEDICO"));
    const idxDiasVacaciones = encabezadosRaw.findIndex((h) => h.includes("DIAS DE VACACIONES"));
    const idxBonoExtra = encabezadosRaw.findIndex((h) => h === "BONO EXTRA");
    const idxGratificacion = encabezadosRaw.findIndex((h) => h.includes("GRATIFICACIÓN ESPECIAL") || h.includes("GRATIFICACION ESPECIAL"));
    
    const idxPrestamo = encabezadosRaw.findIndex((h) => h === "PRESTAMO" || h.includes("PRESTAMOS"));
    const idxAdeudos = encabezadosRaw.findIndex((h) => h === "ADEUDOS");
    const idxSueldoTotal = encabezadosRaw.findIndex((h) => h.includes("SUELDO TOTAL") || h.includes("TOTAL"));

    const encontrados = [];
    // Empezamos a leer desde la fila 2 en adelante (después de encabezados y fila numérica)
    const dataRows = rows.slice(2);

    dataRows.forEach((fila) => {
      const numeroEmpleado = idxNumEmpleado !== -1 ? fila[idxNumEmpleado] : fila[2];
      const puesto = idxPuesto !== -1 ? fila[idxPuesto] : fila[1];
      const nombre = idxNombre !== -1 ? fila[idxNombre] : fila[3];
      const fechaIngreso = convertirFechaExcel(idxAlta !== -1 ? fila[idxAlta] : fila[4]);
      
      const sueldoBase = limpiarMonto(idxSueldoBase !== -1 ? fila[idxSueldoBase] : fila[6]);
      const bonoPuesto = limpiarMonto(idxBonoPuesto !== -1 ? fila[idxBonoPuesto] : fila[13]);
      
      // Función auxiliar para buscar el primer índice que contenga un valor numérico real mayor a 0
      const obtenerValorDeIndices = (indices) => {
        for (const idx of indices) {
          const val = limpiarMonto(fila[idx]);
          if (val > 0) return val;
        }
        // Si ninguno es mayor a 0, retornamos el valor del primer índice encontrado o 0
        return indices.length > 0 ? limpiarMonto(fila[indices[0]]) : 0;
      };

      const bonoPuntualidad = obtenerValorDeIndices(indicesPuntualidad);
      const bonoAsistencia = obtenerValorDeIndices(indicesAsistencia);

      const bonoDesempeno = limpiarMonto(idxBonoDesempeno !== -1 ? fila[idxBonoDesempeno] : 0);
      const apoyoMedico = limpiarMonto(idxApoyoMedico !== -1 ? fila[idxApoyoMedico] : 0);
      const bonoExtra = limpiarMonto(idxBonoExtra !== -1 ? fila[idxBonoExtra] : 0);
      const gratificacionEspecial = limpiarMonto(idxGratificacion !== -1 ? fila[idxGratificacion] : 0);

      const diasVacaciones = limpiarMonto(idxDiasVacaciones !== -1 ? fila[idxDiasVacaciones] : 0);
      const horasExtra = limpiarMonto(idxHorasExtra !== -1 ? fila[idxHorasExtra] : 0);
      const descuentoVarios = limpiarMonto(idxPrestamo !== -1 ? fila[idxPrestamo] : 0);
      const saldoPrestamo = limpiarMonto(idxAdeudos !== -1 ? fila[idxAdeudos] : 0);
      const montoFinalSemanal = limpiarMonto(idxSueldoTotal !== -1 ? fila[idxSueldoTotal] : 0);

      const empleadoValido =
        (typeof numeroEmpleado === "number" || typeof numeroEmpleado === "string") &&
        String(numeroEmpleado).trim() !== "" &&
        typeof nombre === "string" &&
        nombre.trim() !== "";

      if (empleadoValido) {
        encontrados.push({
          numero_empleado: String(numeroEmpleado).trim(),
          nombre_completo: nombre.trim(),
          puesto: typeof puesto === "string" ? puesto.trim() : "",
          departamento: typeof puesto === "string" ? puesto.trim() : "GENERAL",
          fecha_ingreso: fechaIngreso,
          sueldo_base: sueldoBase,
          
          bono_puesto: bonoPuesto,
          bono_puntualidad: bonoPuntualidad,
          bono_asistencia: bonoAsistencia,
          bono_multiplicador: 0,
          bono_desempeno: bonoDesempeno,
          bono_extra: bonoExtra,
          apoyo_medico: apoyoMedico,
          gratificacion_especial: gratificacionEspecial,

          dias_vacaciones: diasVacaciones,
          horas_extra: horasExtra,
          descuento_varios: descuentoVarios,
          saldo_prestamo: saldoPrestamo,
          monto_final_semanal: montoFinalSemanal
        });
      }
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

  const actualizarIncidencias = async (empleadoId, empleado, pId) => {
    if (!pId) return;

    const payload = {
      empleado_id: empleadoId,
      periodo_id: Number(pId),
      horas_extra: Number(empleado.horas_extra || 0),
      dias_vacaciones: Number(empleado.dias_vacaciones || 0),
      monto_final_semanal: Number(empleado.monto_final_semanal || 0)
    };

    await supabase.from("incidencias").upsert([payload], {
      onConflict: "empleado_id, periodo_id",
    });
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

      for (const empleado of empleados) {
        let nombreDepartamento = empleado.departamento?.trim()?.toUpperCase();

        const equivalencias = {
          "MTTO NAVE 3": "MTTO",
          "AYU CHOFER": "LOGISTICA INTERNA",
          CHOFER: "LOGISTICA INTERNA",
          "LAVADO": "LOGISTICA INTERNA"
        };

        if (equivalencias[nombreDepartamento]) {
          nombreDepartamento = equivalencias[nombreDepartamento];
        }

        let lineaId = null;

        if (esLineaMolienda(nombreDepartamento)) {
          const linea = lineas.find((l) => l.nombre === nombreDepartamento);
          if (linea) lineaId = linea.id;
          nombreDepartamento = "MOLIENDA";
        }

        let departamento = departamentos.find(
          (d) => d.nombre?.trim()?.toUpperCase() === nombreDepartamento
        );

        if (!departamento && departamentos.length > 0) {
          departamento = departamentos[0]; 
        }

        let puesto = puestos.find(
          (p) =>
            p.nombre?.trim()?.toUpperCase() === empleado.puesto?.trim()?.toUpperCase() &&
            p.departamento_id === departamento?.id
        );

        if (!puesto && departamento) {
          const { data: nuevoPuesto, error: puestoError } = await supabase
            .from("puestos")
            .insert([
              {
                nombre: empleado.puesto || "SIN PUESTO",
                departamento_id: departamento.id,
                activo: true,
              },
            ])
            .select()
            .single();

          if (!puestoError && nuevoPuesto) {
            puesto = nuevoPuesto;
            puestos.push(nuevoPuesto);
          }
        }

        const { data: existente } = await supabase
          .from("empleados")
          .select("id")
          .eq("numero_empleado", empleado.numero_empleado)
          .maybeSingle();

        let empId = null;

        const datosEmpleadoPayload = {
          nombre_completo: empleado.nombre_completo,
          fecha_ingreso: empleado.fecha_ingreso,
          sueldo_base: empleado.sueldo_base,
          bono_puesto: empleado.bono_puesto,
          bono_puntualidad: empleado.bono_puntualidad,
          bono_asistencia: empleado.bono_asistencia,
          bono_multiplicador: empleado.bono_multiplicador,
          bono_desempeno: empleado.bono_desempeno,
          bono_extra: empleado.bono_extra,
          apoyo_medico: empleado.apoyo_medico,
          gratificacion_especial: empleado.gratificacion_especial,
          departamento_id: departamento ? departamento.id : null,
          puesto_id: puesto ? puesto.id : null,
          linea_id: lineaId,
          activo: true,
        };

        if (existente) {
          empId = existente.id;
          const { error: updateError } = await supabase
            .from("empleados")
            .update(datosEmpleadoPayload)
            .eq("id", empId);

          if (updateError) {
            errores.push({ numero: empleado.numero_empleado, nombre: empleado.nombre_completo, motivo: updateError.message });
            continue;
          }

          actualizados++;
        } else {
          const { data: empleadoGuardado, error: insertError } = await supabase
            .from("empleados")
            .insert([
              {
                numero_empleado: empleado.numero_empleado,
                ...datosEmpleadoPayload,
              },
            ])
            .select()
            .single();

          if (insertError) {
            errores.push({ numero: empleado.numero_empleado, nombre: empleado.nombre_completo, motivo: insertError.message });
            continue;
          }

          if (empleadoGuardado) {
            empId = empleadoGuardado.id;
            insertados++;
          }
        }

        if (empId) {
          await actualizarIncidencias(empId, empleado, periodoId);
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
      alert("Error durante la importación");
    }

    setLoading(false);
  };

  return (
    <Layout>
      <div>
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">📥 Importar Empleados</h1>
            <p className="text-gray-500 mt-2">
              Lectura dinámica basada en los nombres exactos de los encabezados del archivo
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
                  <div key={i}>• Empleado #{err.numero} ({err.nombre}): {err.motivo}</div>
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

            <button onClick={importarEmpleados} disabled={loading || empleados.length === 0} className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-medium">
              {loading ? "Importando..." : "🚀 Importar Empleados por Nombre de Columna"}
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
                <th className="p-3 text-right">Sueldo Base</th>
                <th className="p-3 text-right">Bono Puesto</th>
                <th className="p-3 text-right">Bono Puntualidad</th>
                <th className="p-3 text-right">Bono Asistencia</th>
                <th className="p-3 text-right">Total Bonos</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado, index) => {
                const sumaBonos = empleado.bono_puesto + empleado.bono_puntualidad + empleado.bono_asistencia + empleado.bono_multiplicador + empleado.bono_desempeno + empleado.bono_extra + empleado.apoyo_medico + empleado.gratificacion_especial;
                return (
                  <tr key={index} className="border-t hover:bg-slate-50">
                    <td className="p-3">{empleado.numero_empleado}</td>
                    <td className="p-3 font-medium">{empleado.nombre_completo}</td>
                    <td className="p-3 font-semibold text-blue-600">{empleado.puesto}</td>
                    <td className="p-3 text-right font-bold text-slate-700">${empleado.sueldo_base.toFixed(2)}</td>
                    <td className="p-3 text-right">${empleado.bono_puesto.toFixed(2)}</td>
                    <td className="p-3 text-right text-emerald-600 font-bold">${empleado.bono_puntualidad.toFixed(2)}</td>
                    <td className="p-3 text-right">${empleado.bono_asistencia.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">${sumaBonos.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}