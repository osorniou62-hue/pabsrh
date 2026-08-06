import { useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

import { supabase } from "../services/supabase";

export default function ImportarEmpleados() {
  const [archivo, setArchivo] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(false);

  const esLineaMolienda = (valor) => {
    return ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].includes(valor);
  };

  const convertirFechaExcel = (valor) => {
    if (typeof valor !== "number") return null;
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    if (isNaN(fecha.getTime())) return null;
    return fecha.toISOString().split("T")[0];
  };

  // ==================== FUNCIONES NUEVAS ====================
  const actualizarVacaciones = async (empleadoId, empleado) => {
    if (empleado.dias_vacaciones <= 0) return;
    const fechaActual = new Date().toISOString().split("T")[0];

    const { data: existente, error } = await supabase
      .from("vacaciones")
      .select("id")
      .eq("empleado_id", empleadoId)
      .eq("estatus", "IMPORTADO")
      .maybeSingle();

    if (existente) {
      // Actualizar
      await supabase
        .from("vacaciones")
        .update({
          dias: empleado.dias_vacaciones,
          fecha_inicio: fechaActual,
          fecha_fin: fechaActual,
        })
        .eq("id", existente.id);
    } else {
      // Insertar
      await supabase
        .from("vacaciones")
        .insert([
          {
            empleado_id: empleadoId,
            fecha_inicio: fechaActual,
            fecha_fin: fechaActual,
            dias: empleado.dias_vacaciones,
            estatus: "IMPORTADO",
          },
        ]);
    }

    if (error) throw error;
  };

  const actualizarPrestamo = async (empleadoId, empleado) => {
    const saldo = Number(empleado.saldo_prestamo || 0);
    const descuento = Number(empleado.descuento_prestamo || 0);
    if (saldo === 0 && descuento === 0) return;

    const { data: prestamoExistente, error: busquedaError } = await supabase
      .from("prestamos")
      .select("id")
      .eq("empleado_id", empleadoId)
      .maybeSingle();

    if (busquedaError) throw busquedaError;

    if (prestamoExistente) {
      // Actualizar préstamo existente
      const { error: updateError } = await supabase
        .from("prestamos")
        .update({
          saldo_actual: saldo,
          descuento_periodo: descuento,
        })
        .eq("id", prestamoExistente.id);
      if (updateError) throw updateError;
    } else {
      // Crear nuevo préstamo
      const { error: insertError } = await supabase
        .from("prestamos")
        .insert([
          {
            empleado_id: empleadoId,
            importe_total: saldo,
            saldo_actual: saldo,
            descuento_periodo: descuento,
            estatus: "ACTIVO",
          },
        ]);
      if (insertError) throw insertError;
    }
  };
  // ==================== FIN funciones nuevas ====================

  const analizarNomina = (rows) => {
    const encontrados = [];

    rows.forEach((fila) => {
      const numeroEmpleado = fila?.[0];
      const puesto = fila?.[1];
      const departamento = fila?.[2];
      const nombre = fila?.[3];
      const fechaIngreso = convertirFechaExcel(fila?.[5]);
      const sueldoBase = Number(fila?.[51] || 0);
      const diasVacaciones = Number(fila?.[63] || 0);
      const saldoPrestamo = Number(fila?.[71] || 0);
      const descuentoPrestamo = Number(fila?.[70] || 0);

      const empleadoValido =
        typeof numeroEmpleado === "number" &&
        typeof puesto === "string" &&
        typeof departamento === "string" &&
        typeof nombre === "string" &&
        nombre.trim() !== "";

      if (empleadoValido) {
        encontrados.push({
          numero_empleado: String(numeroEmpleado),
          nombre_completo: nombre.trim(),
          puesto: puesto.trim(),
          departamento: departamento.trim(),
          fecha_ingreso: fechaIngreso,
          sueldo_base: sueldoBase,
          dias_vacaciones: diasVacaciones,
          saldo_prestamo: saldoPrestamo,
          descuento_prestamo: descuentoPrestamo,
        });
      }
    });

    console.log("EMPLEADOS DETECTADOS:", encontrados.length);
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
        alert("Error leyendo Excel");
      }
    };
    reader.readAsBinaryString(file);
  };

  const importarEmpleados = async () => {
    if (empleados.length === 0) {
      alert("No hay empleados para importar");
      return;
    }
    try {
      setLoading(true);
      const { data: departamentos, error: departamentosError } = await supabase.from("departamentos").select("*");
      if (departamentosError) throw departamentosError;

      const { data: puestos, error: puestosError } = await supabase.from("puestos").select("*");
      if (puestosError) throw puestosError;

      const { data: lineas, error: lineasError } = await supabase.from("lineas").select("*");
      if (lineasError) throw lineasError;

      let insertados = 0;
      let actualizados = 0;
      const errores = [];
      const departamentosNoEncontrados = [];

      for (const empleado of empleados) {
        let nombreDepartamento = empleado.departamento?.trim()?.toUpperCase();

        const equivalencias = {
          "MTTO NAVE 3": "MTTO",
          "AYU CHOFER": "LOGISTICA INTERNA",
          "CHOFER": "LOGISTICA INTERNA",
        };

        if (equivalencias[nombreDepartamento]) {
          nombreDepartamento = equivalencias[nombreDepartamento];
        }

        let lineaId = null;
        if (esLineaMolienda(nombreDepartamento)) {
          const linea = lineas.find((l) => l.nombre === nombreDepartamento);
          if (linea) {
            lineaId = linea.id;
          }
          nombreDepartamento = "MOLIENDA";
        }

        const departamento =
          departamentos.find(
            (d) => d.nombre?.trim()?.toUpperCase() === nombreDepartamento
          );

        if (!departamento) {
          if (!empleado.departamento || empleado.departamento.trim() === "") {
            console.log("EMPLEADO SIN DEPARTAMENTO", empleado);
          }
          departamentosNoEncontrados.push(empleado.departamento);
          errores.push({
            numero: empleado.numero_empleado,
            nombre: empleado.nombre_completo,
            motivo: `Departamento no encontrado: ${empleado.departamento}`,
          });
          continue;
        }

        let puesto =
          puestos.find(
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

        const { data: existente, error: existeError } = await supabase
          .from("empleados")
          .select("id")
          .eq("numero_empleado", empleado.numero_empleado)
          .maybeSingle();

        if (existeError) throw existeError;

        if (existente) {
          // UPDATE
          const { error: updateError } = await supabase
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
            .eq("id", existente.id);

          if (updateError) throw updateError;
          actualizados++;
          await actualizarVacaciones(existente.id, empleado);
          await actualizarPrestamo(existente.id, empleado);
        } else {
          // INSERT
          const { data: empleadoGuardado, error: insertError } = await supabase
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

          if (insertError) throw insertError;
          insertados++;
          await actualizarVacaciones(empleadoGuardado.id, empleado);
          await actualizarPrestamo(empleadoGuardado.id, empleado);
        }
      }

      console.log("ERRORES");
      console.table(errores);
      console.log("DEPARTAMENTOS NO ENCONTRADOS");
      console.table([...new Set(departamentosNoEncontrados)]);
      alert(`Importación finalizada
Insertados: ${insertados}
Actualizados: ${actualizados}
Errores: ${errores.length}
Revisa la consola (F12).`);
    } catch (error) {
      console.error(error);
      alert("Error durante la importación");
    }
    setLoading(false);
  };

  return (
    <Layout>
      {/* ... Tu JSX sin cambios ... */}
    </Layout>
  );
}