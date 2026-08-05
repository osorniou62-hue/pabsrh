import { useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

import { supabase } from "../services/supabase";

export default function ImportarEmpleados() {
  const [archivo, setArchivo] =
    useState(null);

  const [empleados, setEmpleados] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const esLineaMolienda = (
    valor
  ) => {
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

  const convertirFechaExcel = (
    valor
  ) => {
    if (
      typeof valor !== "number"
    ) {
      return null;
    }

    const fecha = new Date(
      (valor - 25569) *
        86400 *
        1000
    );

    if (
      isNaN(fecha.getTime())
    ) {
      return null;
    }

    return fecha
      .toISOString()
      .split("T")[0];
  };

  const analizarNomina = (
    rows
  ) => {
    const encontrados = [];

    rows.forEach(
      (fila, index) => {
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

        const sueldoBase =
          Number(
            fila?.[51] || 0
          );

        const empleadoValido =
          typeof numeroEmpleado ===
            "number" &&
          typeof puesto ===
            "string" &&
          typeof departamento ===
            "string" &&
          typeof nombre ===
            "string" &&
          nombre.trim() !== "";

        if (
          empleadoValido
        ) {
          encontrados.push({
            numero_empleado:
              String(
                numeroEmpleado
              ),
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
          });
        } else if (
          typeof numeroEmpleado ===
          "number"
        ) {
          console.log(
            `FILA DESCARTADA (${index})`
          );
          console.log(fila);
        }
      }
    );

    console.log(
      "EMPLEADOS DETECTADOS:",
      encontrados.length
    );

    setEmpleados(
      encontrados
    );
  };

  const leerArchivo = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setArchivo(file);

    const reader =
      new FileReader();
          reader.onload = (e) => {
      try {
        const workbook =
          XLSX.read(
            e.target.result,
            {
              type: "binary",
            }
          );

        const sheet =
          workbook.Sheets[
            workbook.SheetNames[0]
          ];

        const rows =
          XLSX.utils.sheet_to_json(
            sheet,
            {
              header: 1,
              defval: "",
            }
          );

        console.log(
          "TOTAL FILAS:",
          rows.length
        );

        console.log(
          "FILA 50:",
          rows[50]
        );

        console.log(
          "FILA 100:",
          rows[100]
        );

        console.log(
          "FILA 150:",
          rows[150]
        );

        console.log(
2
"ULTIMA FILA:",
3
rows[rows.length - 1]
4
);

        console.table(
          rows.slice(0, 20)
        );

        analizarNomina(
          rows
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          "Error leyendo Excel"
        );
      }
    };

    reader.readAsBinaryString(
      file
    );
  };

  const importarEmpleados =
    async () => {
      if (
        empleados.length === 0
      ) {
        alert(
          "No hay empleados para importar"
        );

        return;
      }

      try {

        setLoading(true);

        const {
          data: departamentos,
          error:
            departamentosError,
        } =
          await supabase
            .from(
              "departamentos"
            )
            .select("*");

        if (
          departamentosError
        ) {
          throw departamentosError;
        }

        const {
          data: puestos,
          error: puestosError,
        } =
          await supabase
            .from("puestos")
            .select("*");

        if (
          puestosError
        ) {
          throw puestosError;
        }

        const {
          data: lineas,
          error: lineasError,
        } =
          await supabase
            .from("lineas")
            .select("*");

        if (
          lineasError
        ) {
          throw lineasError;
        }

        let insertados = 0;
        let actualizados = 0;

        const errores = [];

        const departamentosNoEncontrados =
          [];
                  for (
          const empleado of empleados
        ) {
          let nombreDepartamento =
            empleado.departamento
              ?.trim()
              ?.toUpperCase();

          let lineaId =
            null;

          if (
            esLineaMolienda(
              nombreDepartamento
            )
          ) {
            const linea =
              lineas.find(
                (l) =>
                  l.nombre ===
                  nombreDepartamento
              );

            if (
              linea
            ) {
              lineaId =
                linea.id;
            }

            nombreDepartamento =
              "MOLIENDA";
          }

          const departamento =
            departamentos.find(
              (d) =>
                d.nombre
                  ?.trim()
                  ?.toUpperCase() ===
                nombreDepartamento
            );

          if (
            !departamento
          ) {
            departamentosNoEncontrados.push(
              empleado.departamento
            );

            errores.push({
              numero:
                empleado.numero_empleado,

              nombre:
                empleado.nombre_completo,

              motivo:
                `Departamento no encontrado: ${empleado.departamento}`,
            });

            continue;
          }

          let puesto =
            puestos.find(
              (p) =>
                p.nombre
                  ?.trim()
                  ?.toUpperCase() ===
                  empleado.puesto
                    ?.trim()
                    ?.toUpperCase() &&
                p.departamento_id ===
                  departamento.id
            );

          if (
            !puesto
          ) {
            const {
              data: nuevoPuesto,
              error:
                puestoError,
            } =
              await supabase
                .from(
                  "puestos"
                )
                .insert([
                  {
                    nombre:
                      empleado.puesto,

                    departamento_id:
                      departamento.id,

                    activo: true,
                  },
                ])
                .select()
                .single();

            if (
              puestoError
            ) {
              errores.push({
                numero:
                  empleado.numero_empleado,

                nombre:
                  empleado.nombre_completo,

                motivo:
                  puestoError.message,
              });

              continue;
            }

            puesto =
              nuevoPuesto;

            puestos.push(
              nuevoPuesto
            );
          }

          const {
            data:
              existente,
          } =
            await supabase
              .from(
                "empleados"
              )
              .select("id")
              .eq(
                "numero_empleado",
                empleado.numero_empleado
              )
              .maybeSingle();

          if (
            existente
          ) {
            const {
              error:
                updateError,
            } =
              await supabase
                .from(
                  "empleados"
                )
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

            if (
              updateError
            ) {
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

            actualizados++;
          } else {

            const {
              error:
                insertError,
            } =
              await supabase
                .from(
                  "empleados"
                )
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
                ]);

            if (
              insertError
            ) {
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

            insertados++;
          }
        }

        console.log(
          "ERRORES"
        );

        console.table(
          errores
        );

        console.log(
          "DEPARTAMENTOS NO ENCONTRADOS"
        );

        console.table([
          ...new Set(
            departamentosNoEncontrados
          ),
        ]);

        alert(
          `Importación finalizada

Insertados: ${insertados}
Actualizados: ${actualizados}
Errores: ${errores.length}

Revisa la consola (F12).`
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          "Error durante la importación"
        );

      }

      setLoading(false);
    };

  return (
    <Layout>
      {/* AQUÍ PEGA TODO TU RETURN ORIGINAL
          DESDE <div> HASTA </Layout>
          NO NECESITA CAMBIOS */}
    </Layout>
  );
}
