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
    // Si viene como string de fecha ej. "15/01/2026"
    if (typeof valor === "string" && valor.includes("/")) {
      const partes = valor.split("/");
      if (partes.length === 3) {
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      }
    }
    return null;
  };

  // Función robusta para limpiar montos monetarios (ej. " $2,205.28 ", " $-   " -> 2205.28 o 0)
  const limpiarMonto = (valor) => {
    if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
    if (!valor) return 0;
    const limpio = String(valor).replace(/[^0-9.-]+/g, "");
    const numero = parseFloat(limpio);
    return isNaN(numero) ? 0 : numero;
  };

  const analizarNomina = (rows) => {
    if (!rows || rows.length === 0) return;

    let headerRowIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          (cell.toUpperCase().includes("NOMBRE") ||
            cell.toUpperCase().includes("COLABORADOR") ||
            cell.toUpperCase().includes("SUELDO BASE"))
      )
    );

    if (headerRowIndex === -1) headerRowIndex = 0;

    const headers = rows[headerRowIndex].map((h) =>
      String(h || "").trim().toUpperCase()
    );

    const getColIndex = (keywords) => {
      return headers.findIndex((h) =>
        keywords.some((kw) => h.includes(kw.toUpperCase()))
      );
    };

    // --- ÍNDICES DINÁMICOS BASADOS EN LOS ENCABEZADOS DE TU CSV ---
    const idxNumEmpleado = getColIndex(["#", "NO.", "NUM", "CLAVE"]);
    const idxNombre = getColIndex(["COLABORADOR", "NOMBRE"]);
    const idxPuesto = getColIndex(["PUESTO"]);
    const idxDepto = getColIndex(["DEPARTAMENTO", "DEPTO"]);
    const idxFechaIngreso = getColIndex(["ALTA", "INGRESO"]);
    const idxSueldo = getColIndex(["SUELDO BASE"]);

    // Índices exactos de Bonos y Compensaciones
    const idxBonoPuesto = getColIndex(["BONO POR PUESTO"]);
    const idxBonoPuntualidad = getColIndex(["BONO PUNTUALIDAD", "PAGO PUNTUALIDAD"]);
    const idxBonoAsistencia = getColIndex(["BONO ASISTENCIA"]);
    const idxBonoMultiplicador = getColIndex(["MULTIPLICADOR"]);
    const idxBonoDesempeno = getColIndex(["DESEMPEÑO"]);
    const idxBonoExtra = getColIndex(["BONO EXTRA"]);
    const idxApoyoMedico = getColIndex(["APOYO MEDICO"]);
    const idxGratificacionEspecial = getColIndex(["GRATIFICACIÓN ESPECIAL", "GRATIFICACION ESPECIAL"]);

    // Incidencias y otros
    const idxVacaciones = getColIndex(["VACACIONES"]);
    const idxHorasExtra = getColIndex(["HORAS EXTRAS BASE", "HORAS EXTRA"]);
    const idxFaltasJust = getColIndex(["FALTAS JUSTIFICADAS"]);
    const idxFaltasInjust = getColIndex(["FALTA INJUSTIFICADA"]);
    const idxDescVarios = getColIndex(["PRESTAMO"]);
    const idxSaldoPrestamo = getColIndex(["ADEUDOS"]);
    const idxMontoFinalSemanal = getColIndex(["SUELDO TOTAL", "TOTAL"]);

    const encontrados = [];
    const dataRows = rows.slice(headerRowIndex + 1);

    dataRows.forEach((fila) => {
      // Usamos respaldo por posición fija si el encabezado no coincide exactamente
      const numeroEmpleado = fila[idxNumEmpleado !== -1 ? idxNumEmpleado : 2];
      const nombre = fila[idxNombre !== -1 ? idxNombre : 3];
      const puesto = fila[idxPuesto !== -1 ? idxPuesto : 1];
      const departamento = fila[idxDepto !== -1 ? idxDepto : 2]; // O ajustado a la columna correspondiente
      const fechaIngreso = convertirFechaExcel(fila[idxFechaIngreso !== -1 ? idxFechaIngreso : 5]);
      
      const sueldoBase = limpiarMonto(idxSueldo !== -1 ? fila[idxSueldo] : fila[6]);

      // Extracción de Bonos individuales
      const bonoPuesto = limpiarMonto(idxBonoPuesto !== -1 ? fila[idxBonoPuesto] : 0);
      const bonoPuntualidad = limpiarMonto(idxBonoPuntualidad !== -1 ? fila[idxBonoPuntualidad] : 0);
      const bonoAsistencia = limpiarMonto(idxBonoAsistencia !== -1 ? fila[idxBonoAsistencia] : 0);
      const bonoMultiplicador = limpiarMonto(idxBonoMultiplicador !== -1 ? fila[idxBonoMultiplicador] : 0);
      const bonoDesempeno = limpiarMonto(idxBonoDesempeno !== -1 ? fila[idxBonoDesempeno] : 0);
      const bonoExtra = limpiarMonto(idxBonoExtra !== -1 ? fila[idxBonoExtra] : 0);
      const apoyoMedico = limpiarMonto(idxApoyoMedico !== -1 ? fila[idxApoyoMedico] : 0);
      const gratificacionEspecial = limpiarMonto(idxGratificacionEspecial !== -1 ? fila[idxGratificacionEspecial] : 0);

      const diasVacaciones = limpiarMonto(idxVacaciones !== -1 ? fila[idxVacaciones] : 0);
      const horasExtra = limpiarMonto(idxHorasExtra !== -1 ? fila[idxHorasExtra] : 0);
      const faltasJustificadas = limpiarMonto(idxFaltasJust !== -1 ? fila[idxFaltasJust] : 0);
      const faltasInjustificadas = limpiarMonto(idxFaltasInjust !== -1 ? fila[idxFaltasInjust] : 0);
      const descuentoVarios = limpiarMonto(idxDescVarios !== -1 ? fila[idxDescVarios] : 0);
      const saldoPrestamo = limpiarMonto(idxSaldoPrestamo !== -1 ? fila[idxSaldoPrestamo] : 0);
      const montoFinalSemanal = limpiarMonto(idxMontoFinalSemanal !== -1 ? fila[idxMontoFinalSemanal] : 0);

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
          departamento: typeof departamento === "string" ? departamento.trim() : "",
          fecha_ingreso: fechaIngreso,
          sueldo_base: sueldoBase,
          
          // Bonos mapeados directamente a las columnas reales de la BD
          bono_puesto: bonoPuesto,
          bono_puntualidad: bonoPuntualidad,
          bono_asistencia: bonoAsistencia,
          bono_multiplicador: bonoMultiplicador,
          bono_desempeno: bonoDesempeno,
          bono_extra: bonoExtra,
          apoyo_medico: apoyoMedico,
          gratificacion_especial: gratificacionEspecial,

          dias_vacaciones: diasVacaciones,
          horas_extra: horasExtra,
          faltas_justificadas: faltasJustificadas,
          faltas_injustificadas: faltasInjustificadas,
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
        alert("Error leyendo el archivo Excel/CSV");
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
      faltas_justificadas: Number(empleado.faltas_justificadas || 0),
      faltas_injustificadas: Number(empleado.faltas_injustificadas || 0),
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

        const departamento = departamentos.find(
          (d) => d.nombre?.trim()?.toUpperCase() === nombreDepartamento
        );

        if (!departamento) {
          errores.push({
            numero: empleado.numero_empleado,
            nombre: empleado.nombre_completo,
            motivo: `Departamento no encontrado: ${empleado.departamento}`,
          });
          continue;
        }

        let puesto = puestos.find(
          (p) =>
            p.nombre?.trim()?.toUpperCase() === empleado.puesto?.trim()?.toUpperCase() &&
            p.departamento_id === departamento.id
        );

        if (!puesto) {
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

          if (puestoError) {
            errores.push({
              numero: empleado.numero_empleado,
              nombre: empleado.nombre_completo,
              motivo: puestoError.message,
            });
            continue;
          }

          puesto = nuevoPuesto;
          puestos.push(nuevoPuesto);
        }

        const { data: existente } = await supabase
          .from("empleados")
          .select("id")
          .eq("numero_empleado", empleado.numero_empleado)
          .maybeSingle();

        let empId = null;

        // Payload completo incluyendo los bonos directos en la tabla empleados
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
          departamento_id: departamento.id,
          puesto_id: puesto.id,
          linea_id: lineaId,
          activo: true,
        };

        if (existente) {
          empId = existente.id;
          await supabase
            .from("empleados")
            .update(datosEmpleadoPayload)
            .eq("id", empId);

          actualizados++;
        } else {
          const { data: empleadoGuardado } = await supabase
            .from("empleados")
            .insert([
              {
                numero_empleado: empleado.numero_empleado,
                ...datosEmpleadoPayload,
              },
            ])
            .select()
            .single();

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
              Carga masiva e Incidencias con asignación correcta de Bonos
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
              {loading ? "Importando..." : "🚀 Importar Empleados y Bonos Reales"}
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
                <th className="p-3 text-right">Total Bonos (Fila)</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado, index) => {
                const sumaBonos = empleado.bono_puesto + empleado.bono_puntualidad + empleado.bono_asistencia + empleado.bono_multiplicador + empleado.bono_desempeno + empleado.bono_extra + empleado.apoyo_medico + empleado.gratificacion_especial;
                return (
                  <tr key={index} className="border-t hover:bg-slate-50">
                    <td className="p-3">{empleado.numero_empleado}</td>
                    <td className="p-3 font-medium">{empleado.nombre_completo}</td>
                    <td className="p-3">{empleado.puesto}</td>
                    <td className="p-3 text-right">${empleado.sueldo_base.toFixed(2)}</td>
                    <td className="p-3 text-right">${empleado.bono_puesto.toFixed(2)}</td>
                    <td className="p-3 text-right">${empleado.bono_puntualidad.toFixed(2)}</td>
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