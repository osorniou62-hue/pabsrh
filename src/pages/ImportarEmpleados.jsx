import { useState } from "react";
import * as XLSX from "xlsx";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function ImportarEmpleados() {

  const [archivo, setArchivo] =
    useState(null);

  const [rawRows, setRawRows] =
    useState([]);

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

            const data =
              e.target.result;

            const workbook =
              XLSX.read(
                data,
                {
                  type: "binary",
                }
              );

            console.clear();

            console.log(
              "========================"
            );

            console.log(
              "ARCHIVO:",
              file.name
            );

            console.log(
              "HOJAS:"
            );

            console.log(
              workbook.SheetNames
            );

            console.log(
              "========================"
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

            setRawRows(rows);

            console.log(
              "TOTAL FILAS:",
              rows.length
            );

            console.log(
              "========================"
            );

            console.log(
              "ROW 0"
            );

            console.log(
              rows[0]
            );

            console.log(
              "ROW 1"
            );

            console.log(
              rows[1]
            );

            console.log(
              "ROW 2"
            );

            console.log(
              rows[2]
            );

            console.log(
              "ROW 3"
            );

            console.log(
              rows[3]
            );

            console.log(
              "ROW 4"
            );

            console.log(
              rows[4]
            );

            console.log(
              "========================"
            );

            console.table(
              rows.slice(0, 20)
            );

            alert(
              `Filas detectadas: ${rows.length}`
            );

          } catch (error) {

            console.error(
              "ERROR AL LEER EXCEL",
              error
            );

            alert(
              "Error leyendo el archivo"
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
            📥 Diagnóstico Excel
          </h1>

          <p className="text-gray-500 mt-2">
            Herramienta temporal para analizar NOMINA.xlsx
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
            titulo="Filas"
            valor={
              rawRows.length
            }
            icono="📊"
            color="text-green-600"
          />

          <KpiCard
            titulo="Estado"
            valor={
              rawRows.length > 0
                ? "Leído"
                : "Esperando"
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
            p-6
            mb-6
          "
        >

          <h2
            className="
              text-xl
              font-bold
              mb-4
            "
          >
            🔍 Primeras 10 filas
          </h2>

          <div
            className="
              bg-slate-100
              rounded-lg
              p-4
              overflow-auto
              max-h-[500px]
              text-xs
            "
          >

            <pre>

              {JSON.stringify(
                rawRows.slice(
                  0,
                  10
                ),
                null,
                2
              )}

            </pre>

          </div>

        </div>

      </div>

    </Layout>

  );

}