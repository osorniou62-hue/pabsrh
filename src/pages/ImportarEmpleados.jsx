import { useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function ImportarEmpleados() {

  const [archivo, setArchivo] =
    useState(null);

  const [empleados, setEmpleados] =
    useState([]);

  const convertirFechaExcel =
    (valor) => {

      if (
        typeof valor !==
        "number"
      ) {
        return null;
      }

      const fecha =
        new Date(
          (valor - 25569) *
          86400 *
          1000
        );

      if (
        isNaN(
          fecha.getTime()
        )
      ) {
        return null;
      }

      return fecha
        .toISOString()
        .split("T")[0];

    };

  const analizarNomina =
    (rows) => {

      const encontrados =
        [];

      rows.forEach(
        (fila) => {

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

          if (

            typeof numeroEmpleado ===
              "number" &&

            typeof puesto ===
              "string" &&

            typeof departamento ===
              "string" &&

            typeof nombre ===
              "string" &&

            nombre.trim() !== ""

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

          }

        }
      );

      console.log(
        "EMPLEADOS:",
        encontrados.length
      );

      console.table(
        encontrados.slice(
          0,
          20
        )
      );

      setEmpleados(
        encontrados
      );

    };

  const leerArchivo =
    (event) => {

      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      setArchivo(file);

      const reader =
        new FileReader();

      reader.onload =
        (e) => {

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

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            📥 Importar Empleados
          </h1>

          <p className="text-gray-500 mt-2">
            Lectura de NOMINA.xlsx
          </p>

        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">

          <KpiCard
            titulo="Archivo"
            valor={
              archivo
                ? "Cargado"
                : "Sin archivo"
            }
            icono="📄"
            color="text-blue-600"
          />

          <KpiCard
            titulo="Detectados"
            valor={
              empleados.length
            }
            icono="👥"
            color="text-green-600"
          />

          <KpiCard
            titulo="Listos"
            valor={
              empleados.length
            }
            icono="✅"
            color="text-purple-600"
          />

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-6
            mb-6
          "
        >

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={
              leerArchivo
            }
            className="
              border
              rounded-xl
              p-3
              w-full
            "
          />

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            overflow-x-auto
          "
        >

          <table className="w-full">

            <thead className="bg-slate-100">

              <tr>

                <th className="p-4">
                  #
                </th>

                <th className="p-4">
                  Nombre
                </th>

                <th className="p-4">
                  Departamento
                </th>

                <th className="p-4">
                  Puesto
                </th>

                <th className="p-4">
                  Fecha Ingreso
                </th>

                <th className="p-4">
                  Sueldo
                </th>

              </tr>

            </thead>

            <tbody>

              {empleados.map(
                (
                  empleado,
                  index
                ) => (

                  <tr
                    key={index}
                    className="
                      border-t
                      hover:bg-slate-50
                    "
                  >

                    <td className="p-3">
                      {
                        empleado.numero_empleado
                      }
                    </td>

                    <td className="p-3">
                      {
                        empleado.nombre_completo
                      }
                    </td>

                    <td className="p-3">
                      {
                        empleado.departamento
                      }
                    </td>

                    <td className="p-3">
                      {
                        empleado.puesto
                      }
                    </td>

                    <td className="p-3">
                      {
                        empleado.fecha_ingreso
                      }
                    </td>

                    <td className="p-3">

                      $
                      {Number(
                        empleado.sueldo_base
                      ).toLocaleString(
                        "es-MX"
                      )}

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </Layout>

  );

}