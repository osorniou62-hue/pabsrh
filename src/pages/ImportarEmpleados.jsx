import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

import { supabase } from "../services/supabase";

export default function ImportarEmpleados() {

  const [archivo, setArchivo] =
    useState(null);

  const [empleados, setEmpleados] =
    useState([]);

  const [departamentos,
    setDepartamentos] =
    useState([]);

  const [puestos, setPuestos] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {

    cargarCatalogos();

  }, []);

  const cargarCatalogos =
    async () => {

      const { data: deps } =
        await supabase
          .from("departamentos")
          .select("*");

      const { data: pues } =
        await supabase
          .from("puestos")
          .select("*");

      setDepartamentos(
        deps || []
      );

      setPuestos(
        pues || []
      );

    };

  const leerArchivo =
    (event) => {

      const file =
        event.target.files[0];

      if (!file)
        return;

      setArchivo(file);

      const reader =
        new FileReader();

      reader.onload =
        (e) => {

          const data =
            e.target.result;

          const workbook =
            XLSX.read(data, {
              type: "binary",
            });

          const sheet =
            workbook.Sheets[
              workbook.SheetNames[0]
            ];

          const rows =
            XLSX.utils.sheet_to_json(
              sheet,
              {
                header: 1,
              }
            );

          analizarNomina(
            rows
          );

        };

      reader.readAsBinaryString(
        file
      );

    };

  const analizarNomina =
    (rows) => {

      const encontrados =
        [];

      for (
        let i = 0;
        i < rows.length - 10;
        i++
      ) {

        const valor =
          rows[i]?.[0];

        if (
          typeof valor === "number" &&
          valor > 0 &&
          valor < 10000
        ) {

          const puesto =
            rows[i + 1]?.[0];

          const departamento =
            rows[i + 2]?.[0];

          const nombre =
            rows[i + 3]?.[0];

          const fechaIngreso =
            rows[i + 5]?.[0];

          if (
            typeof nombre ===
              "string" &&
            typeof puesto ===
              "string" &&
            typeof departamento ===
              "string"
          ) {

            encontrados.push({

              numero_empleado:
                String(valor),

              nombre_completo:
                nombre,

              puesto,

              departamento,

              fecha_ingreso:
                fechaIngreso,

              sueldo_base: 0,

            });

          }

        }

      }

      setEmpleados(
        encontrados
      );

    };

  const importar =
    async () => {

      if (
        empleados.length === 0
      ) {

        alert(
          "No hay empleados para importar"
        );

        return;

      }

      setLoading(true);

      try {

        for (
          const empleado of empleados
        ) {

          const departamento =
            departamentos.find(
              (d) =>
                d.nombre
                  ?.trim()
                  ?.toUpperCase() ===
                empleado.departamento
                  ?.trim()
                  ?.toUpperCase()
            );

          if (
            !departamento
          ) {

            console.warn(
              "Departamento no encontrado",
              empleado.departamento
            );

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
                  ?.toUpperCase()
            );

          if (
            !puesto
          ) {

            const {
              data,
              error,
            } =
              await supabase
                .from("puestos")
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
              error
            ) {

              console.error(
                error
              );

              continue;

            }

            puesto =
              data;

            setPuestos(
              (
                prev
              ) => [
                ...prev,
                data,
              ]
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
              .select(
                "id"
              )
              .eq(
                "numero_empleado",
                empleado.numero_empleado
              )
              .maybeSingle();

          if (
            existente
          ) {

            await supabase
              .from(
                "empleados"
              )
              .update({
                nombre_completo:
                  empleado.nombre_completo,

                fecha_ingreso:
                  empleado.fecha_ingreso,

                departamento_id:
                  departamento.id,

                puesto_id:
                  puesto.id,

                activo: true,
              })
              .eq(
                "id",
                existente.id
              );

          } else {

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

                  departamento_id:
                    departamento.id,

                  puesto_id:
                    puesto.id,

                  activo: true,
                },
              ]);

          }

        }

        alert(
          "Importación finalizada"
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          "Error en la importación"
        );

      }

      setLoading(false);

    };

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            📥 Importar Empleados
          </h1>

          <p className="text-gray-500 mt-2">
            Carga masiva desde Excel
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

          <button
            onClick={
              importar
            }
            disabled={
              loading
            }
            className="
              mt-4
              bg-green-600
              hover:bg-green-700
              text-white
              px-5
              py-3
              rounded-xl
            "
          >

            {loading
              ? "Importando..."
              : "Importar Empleados"}

          </button>

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
                  Número
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