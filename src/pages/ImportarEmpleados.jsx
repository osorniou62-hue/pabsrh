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
    return [
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
      "L6",
      "L7",
      "L8",
    ].includes(valor);
  };

  const convertirFechaExcel = (valor) => {

    if (typeof valor !== "number") {
      return null;
    }

    const fecha = new Date(
      (valor - 25569) * 86400 * 1000
    );

    if (isNaN(fecha.getTime())) {
      return null;
    }

    return fecha
      .toISOString()
      .split("T")[0];
  };

  const actualizarVacaciones = async (
    empleadoId,
    empleado
  ) => {

    if (
      !empleado.dias_vacaciones ||
      empleado.dias_vacaciones <= 0
    ) {
      return;
    }

    await supabase
      .from("vacaciones")
      .insert([
        {
          empleado_id: empleadoId,

          fecha_inicio:
            new Date()
              .toISOString()
              .split("T")[0],

          fecha_fin:
            new Date()
              .toISOString()
              .split("T")[0],

          dias:
            empleado.dias_vacaciones,

          estatus:
            "IMPORTADO",
        },
      ]);
  };

  const actualizarPrestamo = async (
    empleadoId,
    empleado
  ) => {

    const saldo =
      Number(
        empleado.saldo_prestamo || 0
      );

    const descuento =
      Number(
        empleado.descuento_prestamo || 0
      );

    if (
      saldo <= 0 &&
      descuento <= 0
    ) {
      return;
    }

    const {
      data: prestamoExistente,
    } =
      await supabase
        .from("prestamos")
        .select("id")
        .eq(
          "empleado_id",
          empleadoId
        )
        .maybeSingle();

    if (prestamoExistente) {

      await supabase
        .from("prestamos")
        .update({
          saldo_actual:
            saldo,

          descuento_periodo:
            descuento,
        })
        .eq(
          "id",
          prestamoExistente.id
        );

    } else {

      await supabase
        .from("prestamos")
        .insert([
          {
            empleado_id:
              empleadoId,

            importe_total:
              saldo,

            saldo_actual:
              saldo,

            descuento_periodo:
              descuento,

            estatus:
              "ACTIVO",
          },
        ]);
    }
  };
  const analizarNomina = (rows) => {

  const encontrados = [];

  rows.forEach((fila) => {

    const numeroEmpleado =
      fila?.[0];

    const puesto =
      fila?.[1];

    const departamento =
      fila?.[2];

    const nombre =
      fila?.[3];

    const fechaIngreso =
  convertirFechaExcel(
    fila?.[5]
  );

console.table(fila);

if (encontrados.length === 1) {
  console.log(fila);
}

    const sueldoBase =
      Number(
        fila?.[51] || 0
      );

    const empleadoValido =
      typeof numeroEmpleado === "number" &&
      typeof puesto === "string" &&
      typeof departamento === "string" &&
      typeof nombre === "string" &&
      nombre.trim() !== "";

    if (!empleadoValido) {
      return;
    }

    encontrados.push({
      numero_empleado:
        String(numeroEmpleado),

      nombre_completo:
        nombre.trim(),

      puesto:
        puesto.trim(),

      departamento:
        departamento.trim(),

      fecha_ingreso:
        fechaIngreso,

      sueldo_base:
        sueldoBase,

      dias_vacaciones: 0,

      saldo_prestamo: 0,

      descuento_prestamo: 0,
    });
  });

  console.log(
    "EMPLEADOS DETECTADOS:",
    encontrados.length
  );

  setEmpleados(
    encontrados
  );
};
const {
  data: existente,
} =
await supabase
  .from("empleados")
  .select("id")
  .eq(
    "numero_empleado",
    empleado.numero_empleado
  )
  .maybeSingle();

if (existente) {

  const {
    error: updateError,
  } =
    await supabase
      .from("empleados")
      .update({
        nombre_completo:
          empleado.nombre_completo,

        fecha_ingreso:
          empleado.fecha_ingreso,

        sueldo_base:
          empleado.sueldo_base,

        departamento_id:
          departamento.id,

        puesto_id:
          puesto.id,

        linea_id:
          lineaId,

        activo: true,
      })
      .eq(
        "id",
        existente.id
      );

  if (updateError) {

    errores.push({
      numero:
        empleado.numero_empleado,

      nombre:
        empleado.nombre_completo,

      motivo:
        updateError.message,
    });

    continue;
  }

  await actualizarVacaciones(
    existente.id,
    empleado
  );

  await actualizarPrestamo(
    existente.id,
    empleado
  );

  actualizados++;

} else {

  const {
    data: empleadoGuardado,
    error: insertError,
  } =
    await supabase
      .from("empleados")
      .insert([
        {
          numero_empleado:
            empleado.numero_empleado,

          nombre_completo:
            empleado.nombre_completo,

          fecha_ingreso:
            empleado.fecha_ingreso,

          sueldo_base:
            empleado.sueldo_base,

          departamento_id:
            departamento.id,

          puesto_id:
            puesto.id,

          linea_id:
            lineaId,

          activo: true,
        },
      ])
      .select()
      .single();

  if (insertError) {

    errores.push({
      numero:
        empleado.numero_empleado,

      nombre:
        empleado.nombre_completo,

      motivo:
        insertError.message,
    });

    continue;
  }

  await actualizarVacaciones(
    empleadoGuardado.id,
    empleado
  );

  await actualizarPrestamo(
    empleadoGuardado.id,
    empleado
  );

  insertados++;
}