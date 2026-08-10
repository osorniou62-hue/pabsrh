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
    if (!rows || rows.length === 0) return;

    let headerRowIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          (cell.toUpperCase().includes("COLABORADOR") ||
            cell.toUpperCase().includes("SUELDO BASE") ||
            cell.toUpperCase().includes("NOMBRE"))
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

    const idxNumEmpleado = getColIndex(["#", "NO.", "NUM", "CLAVE"]);
    const idxNombre = getColIndex(["COLABORADOR", "NOMBRE"]);
    const idxPuesto = getColIndex(["PUESTO"]);
    const idxDepto = getColIndex(["DEPARTAMENTO", "DEPTO", "ÁREA", "AREA"]);
    const idxFechaIngreso = getColIndex(["ALTA", "INGRESO"]);
    const idxSueldo = getColIndex(["SUELDO BASE"]);

    const idxBonoPuesto = getColIndex(["BONO POR PUESTO"]);
    const idxBonoPuntualidad = getColIndex(["BONO PUNTUALIDAD", "PAGO PUNTUALIDAD"]);
    const idxBonoAsistencia = getColIndex(["BONO ASISTENCIA"]);
    const idxBonoMultiplicador = getColIndex(["BONOS MULTIPLICADOR", "MULTIPLICADOR"]);
    const idxBonoDesempeno = getColIndex(["BONO POR DESEMPEÑO", "DESEMPEÑO"]);
    const idxBonoExtra = getColIndex(["BONO EXTRA"]);
    const idxApoyoMedico = getColIndex(["APOYO MEDICO"]);
    const idxGratificacionEspecial = getColIndex(["GRATIFICACIÓN ESPECIAL", "GRATIFICACION ESPECIAL"]);

    const idxVacaciones = getColIndex(["VACACIONES"]);
    const idxHorasExtra = getColIndex(["HORAS EXTRAS BASE", "HORAS EXTRA"]);
    const idxDescVarios = getColIndex(["PRESTAMO"]);
    const idxSaldoPrestamo = getColIndex(["ADEUDOS"]);
    const idxMontoFinalSemanal = getColIndex(["SUELDO TOTAL", "TOTAL"]);

    const encontrados = [];
    const dataRows = rows.slice(headerRowIndex + 1);

    dataRows.forEach((fila) => {
      const numeroEmpleado = fila[idxNumEmpleado !== -1 ? idxNumEmpleado : 2];
      const nombre = fila[idxNombre !== -1 ? idxNombre : 3];
      const puesto = fila[idxPuesto !== -1 ? idxPuesto : 1];
      const departamento = fila[idxDepto !== -1 ? idxDepto : 2];
      const fechaIngreso = convertirFechaExcel(fila[idxFechaIngreso !== -1 ? idxFechaIngreso : 5]);
      
      const sueldoBase = limpiarMonto(fila[idxSueldo !== -1 ? idxSueldo : 6]);

      const bonoPuesto = limpiarMonto(fila[idxBonoPuesto !== -1 ? idxBonoPuesto : 13]);
      const bonoPuntualidad = limpiarMonto(fila[idxBonoPuntualidad !== -1 ? idxBonoPuntualidad : 23]);
      const bonoAsistencia = limpiarMonto(fila[idxBonoAsistencia !== -1 ? idxBonoAsistencia : 24]);
      const bonoMultiplicador = limpiarMonto(fila[idxBonoMultiplicador !== -1 ? idxBonoMultiplicador : 26]);
      const bonoDesempeno = limpiarMonto(fila[idxBonoDesempeno !== -1 ? idxBonoDesempeno : 29]);
      const bonoExtra = limpiarMonto(fila[idxBonoExtra !== -1 ? idxBonoExtra : 37]);
      const apoyoMedico = limpiarMonto(fila[idxApoyoMedico !== -1 ? idxApoyoMedico : 30]);
      const gratificacionEspecial = limpiarMonto(fila[idxGratificacionEspecial !== -1 ? idxGratificacionEspecial : 40]);

      const diasVacaciones = limpiarMonto(fila[idxVacaciones !== -1 ? idxVacaciones : 31]);
      const horasExtra = limpiarMonto(fila[idxHorasExtra !== -1 ? idxHorasExtra : 11]);
      const descuentoVarios = limpiarMonto(fila[idxDescVarios !== -1 ? idxDescVarios : 52]);
      const saldoPrestamo = limpiarMonto(fila[idxSaldoPrestamo !== -1 ? idxSaldoPrestamo : 54]);
      const montoFinalSemanal = limpiarMonto(fila[idxMontoFinalSemanal !== -1 ? idxMontoFinalSemanal : 53]);

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
              Carga masiva con lectura correcta de Sueldo Base, Puestos y Bonos
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
              {loading ? "Importando..." : "🚀 Importar Empleados, Sueldo Base y Bonos"}
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