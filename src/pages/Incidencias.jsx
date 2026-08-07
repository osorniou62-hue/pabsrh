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
    if (typeof valor !== "number") {
      return null;
    }
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    if (isNaN(fecha.getTime())) {
      return null;
    }
    return fecha.toISOString().split("T")[0];
  };

  // ========================================================
  // LECTURA Y ANÁLISIS DINÁMICO DEL EXCEL
  // ========================================================

  const analizarNomina = (rows) => {
    if (!rows || rows.length === 0) return;

    let headerRowIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          (cell.toUpperCase().includes("NOMBRE") ||
            cell.toUpperCase().includes("EMPLEADO") ||
            cell.toUpperCase().includes("PUESTO"))
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

    const idxNumEmpleado = getColIndex(["NUM", "NO.", "CLAVE", "CODIGO", "EMPLEADO"]);
    const idxPuesto = getColIndex(["PUESTO"]);
    const idxDepto = getColIndex(["DEPTO", "DEPARTAMENTO"]);
    const idxNombre = getColIndex(["NOMBRE"]);
    const idxFechaIngreso = getColIndex(["INGRESO", "FECHA"]);
    const idxSueldo = getColIndex(["SUELDO", "SDO", "DIARIO"]);

    const idxVacaciones = getColIndex(["VACACIONES", "VAC"]);
    const idxHorasExtra = getColIndex(["HORAS EXTRA", "H.EXTRA", "EXTRA", "HE"]);
    const idxFaltasJust = getColIndex(["JUSTIFICADA", "F.JUST"]);
    const idxFaltasInjust = getColIndex(["INJUSTIFICADA", "FALTA", "F.INJUST"]);
    const idxDescAusencias = getColIndex(["AUSENCIA", "DESC. AUSENCIA"]);
    const idxBono = getColIndex(["BONO"]);
    const idxDescVarios = getColIndex(["VARIOS", "DESC. VARIOS", "OTROS DESC"]);
    const idxDescPrestamo = getColIndex(["PRESTAMO", "DESC. PRESTAMO"]);
    const idxSaldoPrestamo = getColIndex(["ADEUDO", "SALDO"]);

    const encontrados = [];
    const dataRows = rows.slice(headerRowIndex + 1);

    dataRows.forEach((fila) => {
      const numeroEmpleado = fila[idxNumEmpleado !== -1 ? idxNumEmpleado : 0];
      const puesto = fila[idxPuesto !== -1 ? idxPuesto : 1];
      const departamento = fila[idxDepto !== -1 ? idxDepto : 2];
      const nombre = fila[idxNombre !== -1 ? idxNombre : 3];
      const fechaIngreso = convertirFechaExcel(
        fila[idxFechaIngreso !== -1 ? idxFechaIngreso : 5]
      );
      const sueldoBase = Number(
        (idxSueldo !== -1 ? fila[idxSueldo] : fila[51]) || 0
      );

      const diasVacaciones = Number((idxVacaciones !== -1 ? fila[idxVacaciones] : 0) || 0);
      const horasExtra = Number((idxHorasExtra !== -1 ? fila[idxHorasExtra] : 0) || 0);
      const faltasJustificadas = Number((idxFaltasJust !== -1 ? fila[idxFaltasJust] : 0) || 0);
      const faltasInjustificadas = Number((idxFaltasInjust !== -1 ? fila[idxFaltasInjust] : 0) || 0);
      const descuentoAusencias = Number((idxDescAusencias !== -1 ? fila[idxDescAusencias] : 0) || 0);
      const bono = Number((idxBono !== -1 ? fila[idxBono] : 0) || 0);
      const descuentoVarios = Number((idxDescVarios !== -1 ? fila[idxDescVarios] : 0) || 0);
      const descuentoPrestamo = Number((idxDescPrestamo !== -1 ? fila[idxDescPrestamo] : 0) || 0);
      const saldoPrestamo = Number((idxSaldoPrestamo !== -1 ? fila[idxSaldoPrestamo] : 0) || 0);

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
          dias_vacaciones: diasVacaciones,
          horas_extra: horasExtra,
          faltas_justificadas: faltasJustificadas,
          faltas_injustificadas: faltasInjustificadas,
          descuento_ausencias: descuentoAusencias,
          bono: bono,
          descuento_varios: descuentoVarios,
          saldo_prestamo: saldoPrestamo,
          descuento_prestamo: descuentoPrestamo,
        });
      }
    });

    console.log("EMPLEADOS DETECTADOS:", encontrados.length);
    if (encontrados.length > 0) {
      console.log("PRIMER EMPLEADO DETECTADO:", encontrados[0]);
    }

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
        alert("Error leyendo el archivo Excel");
      }
    };

    reader.readAsBinaryString(file);
  };

  // ========================================================
  // FUNCIONES DE PERSISTENCIA EN SUPABASE (OPCIÓN B: DECIMALES)
  // ========================================================

  const actualizarIncidencias = async (empleadoId, empleado, pId) => {
    if (!pId) return;

    const payload = {
      empleado_id: empleadoId,
      periodo_id: Number(pId),
      // Mantiene el valor decimal exacto que viene del Excel
      horas_extra: Number(empleado.horas_extra || 0),
      faltas_justificadas: Number(empleado.faltas_justificadas || 0),
      faltas_injustificadas: Number(empleado.faltas_injustificadas || 0),
      dias_vacaciones: Number(empleado.dias_vacaciones || 0),
      descuento_ausencias: Number(empleado.descuento_ausencias || 0),
    };

    const { error } = await supabase.from("incidencias").upsert([payload], {
      onConflict: "empleado_id, periodo_id",
    });

    if (error) console.error("Error guardando incidencias:", error.message);
  };

  const actualizarDescuentosYBonos = async (empleadoId, empleado, pId) => {
    if (!pId) return;

    if (Number(empleado.bono || 0) > 0) {
      await supabase
        .from("bonos_empleado")
        .delete()
        .eq("empleado_id", empleadoId)
        .eq("periodo_id", Number(pId));

      const { error: bonoError } = await supabase
        .from("bonos_empleado")
        .insert([
          {
            empleado_id: empleadoId,
            periodo_id: Number(pId),
            tipo_bono_id: 1,
            concepto: "BONO IMPORTADO",
            importe: Number(empleado.bono),
          },
        ]);

      if (bonoError) console.error("Error guardando bono:", bonoError.message);
    }

    if (Number(empleado.descuento_varios || 0) > 0) {
      await supabase
        .from("descuentos_empleado")
        .delete()
        .eq("empleado_id", empleadoId)
        .eq("periodo_id", Number(pId));

      const { error: descError } = await supabase
        .from("descuentos_empleado")
        .insert([
          {
            empleado_id: empleadoId,
            periodo_id: Number(pId),
            concepto: "DESCUENTOS VARIOS",
            importe: Number(empleado.descuento_varios),
          },
        ]);

      if (descError) console.error("Error guardando descuento:", descError.message);
    }
  };

  const actualizarVacaciones = async (empleadoId, empleado) => {
    if (empleado.dias_vacaciones <= 0) return;
    const fechaHoy = new Date().toISOString().split("T")[0];

    const { data: vacacionesExistentes } = await supabase
      .from("vacaciones")
      .select("id")
      .eq("empleado_id", empleadoId)
      .eq("estatus", "IMPORTADO")
      .maybeSingle();

    if (vacacionesExistentes) {
      await supabase
        .from("vacaciones")
        .update({ dias: Number(empleado.dias_vacaciones) })
        .eq("id", vacacionesExistentes.id);
    } else {
      await supabase.from("vacaciones").insert([
        {
          empleado_id: empleadoId,
          fecha_inicio: fechaHoy,
          fecha_fin: fechaHoy,
          dias: Number(empleado.dias_vacaciones),
          estatus: "IMPORTADO",
        },
      ]);
    }
  };

  const actualizarPrestamo = async (empleadoId, empleado) => {
    const saldo = Number(empleado.saldo_prestamo || 0);
    const descuento = Number(empleado.descuento_prestamo || 0);

    if (saldo === 0 && descuento === 0) return;

    const { data: prestamoExistente } = await supabase
      .from("prestamos")
      .select("id")
      .eq("empleado_id", empleadoId)
      .maybeSingle();

    if (prestamoExistente) {
      await supabase
        .from("prestamos")
        .update({
          saldo_actual: saldo,
          descuento_periodo: descuento,
        })
        .eq("id", prestamoExistente.id);
    } else {
      await supabase.from("prestamos").insert([
        {
          empleado_id: empleadoId,
          importe_total: saldo,
          saldo_actual: saldo,
          descuento_periodo: descuento,
          estatus: "ACTIVO",
        },
      ]);
    }
  };

  // ========================================================
  // PROCESO DE IMPORTACIÓN A SUPABASE
  // ========================================================

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
                nombre: empleado.puesto,
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

        if (existente) {
          empId = existente.id;
          await supabase
            .from("empleados")
            .update({
              nombre_completo: empleado.nombre_completo,
              fecha_ingreso: empleado.fecha_ingreso,
              sueldo_base: empleado.sueldo_base,
              departamento_id: departamento.id,
              puesto_id: puesto.id,
              linea_id: lineaId,
              activo: true,
            })
            .eq("id", empId);

          actualizados++;
        } else {
          const { data: empleadoGuardado } = await supabase
            .from("empleados")
            .insert([
              {
                numero_empleado: empleado.numero_empleado,
                nombre_completo: empleado.nombre_completo,
                fecha_ingreso: empleado.fecha_ingreso,
                sueldo_base: empleado.sueldo_base,
                departamento_id: departamento.id,
                puesto_id: puesto.id,
                linea_id: lineaId,
                activo: true,
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
          await actualizarVacaciones(empId, empleado);
          await actualizarPrestamo(empId, empleado);
          await actualizarIncidencias(empId, empleado, periodoId);
          await actualizarDescuentosYBonos(empId, empleado, periodoId);
        }
      }

      alert(
        `Importación Exitosa!\n\nInsertados: ${insertados}\nActualizados: ${actualizados}\nErrores: ${errores.length}`
      );
    } catch (error) {
      console.error(error);
      alert("Error durante la importación");
    }

    setLoading(false);
  };

  return (
    <Layout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold">📥 Importar Empleados</h1>
          <p className="text-gray-500 mt-2">
            Carga masiva e Incidencias desde NOMINA.xlsx
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard
            titulo="Archivo"
            valor={archivo ? "Cargado" : "Sin archivo"}
            icono="📄"
            color="text-blue-600"
          />
          <KpiCard
            titulo="Detectados"
            valor={empleados.length}
            icono="👥"
            color="text-green-600"
          />
          <KpiCard
            titulo="Listos"
            valor={empleados.length}
            icono="✅"
            color="text-purple-600"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col gap-4">
            <label className="font-semibold text-gray-700">
              1. Selecciona el Período para asignar las incidencias:
            </label>
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="border rounded-xl p-3 bg-slate-50"
            >
              <option value="">-- Selecciona Período --</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.descripcion}
                </option>
              ))}
            </select>

            <label className="font-semibold text-gray-700 mt-2">
              2. Carga el archivo Excel:
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={leerArchivo}
              className="border rounded-xl p-3 w-full"
            />

            <button
              onClick={importarEmpleados}
              disabled={loading || empleados.length === 0}
              className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-medium"
            >
              {loading ? "Importando..." : "🚀 Importar Empleados e Incidencias"}
            </button>
          </div>
        </div>

        {/* Tabla de previsualización */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Departamento</th>
                <th className="p-3 text-right">Sueldo</th>
                <th className="p-3 text-center">Vacaciones</th>
                <th className="p-3 text-center">H. Extra</th>
                <th className="p-3 text-right">Bono</th>
                <th className="p-3 text-right">Prestamo (Saldo)</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado, index) => (
                <tr key={index} className="border-t hover:bg-slate-50">
                  <td className="p-3">{empleado.numero_empleado}</td>
                  <td className="p-3 font-medium">{empleado.nombre_completo}</td>
                  <td className="p-3">{empleado.departamento}</td>
                  <td className="p-3 text-right">
                    ${Number(empleado.sueldo_base).toLocaleString("es-MX")}
                  </td>
                  <td className="p-3 text-center">{empleado.dias_vacaciones} d</td>
                  <td className="p-3 text-center">{empleado.horas_extra} hrs</td>
                  <td className="p-3 text-right">
                    ${Number(empleado.bono).toLocaleString("es-MX")}
                  </td>
                  <td className="p-3 text-right">
                    ${Number(empleado.saldo_prestamo).toLocaleString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
