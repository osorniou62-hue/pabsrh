import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import JSZip from "jszip";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export default function RecibosMasivos() {

  const [periodos, setPeriodos] =
    useState([]);

  const [periodoSeleccionado,
    setPeriodoSeleccionado] =
    useState("");

  const [periodoNombre,
    setPeriodoNombre] =
    useState("");

  const [nominas, setNominas] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [generandoZip,
    setGenerandoZip] =
    useState(false);

  useEffect(() => {

    cargarPeriodos();

  }, []);

  const cargarPeriodos =
    async () => {

      const { data, error } =
        await supabase
          .from("periodos_nomina")
          .select("*")
          .order(
            "fecha_inicio",
            {
              ascending: false,
            }
          );

      if (error) {

        console.error(error);

        return;

      }

      setPeriodos(data || []);

    };

  const consultarNominas =
    async () => {

      if (!periodoSeleccionado) {

        alert(
          "Selecciona un período"
        );

        return;

      }

      setLoading(true);

      const { data, error } =
        await supabase
          .from("nomina")
          .select(`
            *,
            empleados (
              id,
              numero_empleado,
              nombre_completo
            )
          `)
          .eq(
            "periodo_id",
            periodoSeleccionado
          );

      if (error) {

        console.error(error);

        alert(error.message);

        setLoading(false);

        return;

      }

      setNominas(data || []);

      setLoading(false);

    };

  const generarZip =
    async () => {

      if (
        nominas.length === 0
      ) {

        alert(
          "No existen recibos para exportar"
        );

        return;

      }

      setGenerandoZip(true);

      try {

        const zip =
          new JSZip();

        for (
          const nomina of nominas
        ) {

          const pdf =
            new jsPDF();

          pdf.setFontSize(18);

          pdf.text(
            "RECIBO DE NOMINA",
            20,
            20
          );

          pdf.setFontSize(12);

          pdf.text(
            `Empleado: ${
              nomina.empleados
                ?.nombre_completo
            }`,
            20,
            40
          );

          pdf.text(
            `Numero: ${
              nomina.empleados
                ?.numero_empleado
            }`,
            20,
            50
          );

          pdf.text(
            `Percepciones: $${Number(
              nomina.total_percepciones
            ).toFixed(2)}`,
            20,
            70
          );

          pdf.text(
            `Descuentos: $${Number(
              nomina.total_descuentos
            ).toFixed(2)}`,
            20,
            80
          );

          pdf.text(
            `Neto: $${Number(
              nomina.neto_pagar
            ).toFixed(2)}`,
            20,
            90
          );

          const pdfBlob =
            pdf.output("blob");

          zip.file(
            `Recibo_${
              nomina.empleados
                ?.numero_empleado
            }.pdf`,
            pdfBlob
          );

        }

        const contenido =
          await zip.generateAsync({
            type: "blob",
          });

        saveAs(
          contenido,
          `Recibos_${periodoNombre}.zip`
        );

        alert(
          "ZIP generado correctamente"
        );

      } catch (error) {

        console.error(error);

        alert(
          "Error al generar ZIP"
        );

      } finally {

        setGenerandoZip(false);

      }

    };

  const totalNomina =
    nominas.reduce(
      (acum, item) =>
        acum +
        Number(
          item.neto_pagar || 0
        ),
      0
    );

  const totalPercepciones =
    nominas.reduce(
      (acum, item) =>
        acum +
        Number(
          item.total_percepciones || 0
        ),
      0
    );

  const totalDescuentos =
    nominas.reduce(
      (acum, item) =>
        acum +
        Number(
          item.total_descuentos || 0
        ),
      0
    );

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        📦 Recibos Masivos
      </h1>

      <div className="bg-white shadow rounded p-6 mb-6">

        <div className="flex gap-4">

          <select
            value={
              periodoSeleccionado
            }
            onChange={(e) => {

              setPeriodoSeleccionado(
                e.target.value
              );

              const periodo =
                periodos.find(
                  (p) =>
                    p.id ==
                    e.target.value
                );

              setPeriodoNombre(
                periodo
                  ?.descripcion || ""
              );

            }}
            className="
              border
              p-2
              rounded
              min-w-[300px]
            "
          >

            <option value="">
              Seleccionar período
            </option>

            {periodos.map(
              (periodo) => (

                <option
                  key={periodo.id}
                  value={periodo.id}
                >
                  {periodo.descripcion}
                </option>

              )
            )}

          </select>

          <button
            onClick={
              consultarNominas
            }
            className="
              bg-blue-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Consultar
          </button>

        </div>

      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">

        <div className="bg-white rounded shadow p-4">

          <div className="text-gray-500">
            Recibos
          </div>

          <div className="text-2xl font-bold">
            {nominas.length}
          </div>

        </div>

        <div className="bg-white rounded shadow p-4">

          <div className="text-gray-500">
            Percepciones
          </div>

          <div className="text-2xl font-bold">
            $
            {totalPercepciones.toLocaleString(
              "es-MX",
              {
                minimumFractionDigits: 2,
              }
            )}
          </div>

        </div>

        <div className="bg-white rounded shadow p-4">

          <div className="text-gray-500">
            Descuentos
          </div>

          <div className="text-2xl font-bold">
            $
            {totalDescuentos.toLocaleString(
              "es-MX",
              {
                minimumFractionDigits: 2,
              }
            )}
          </div>

        </div>

        <div className="bg-white rounded shadow p-4">

          <div className="text-gray-500">
            Neto Total
          </div>

          <div className="text-2xl font-bold">
            $
            {totalNomina.toLocaleString(
              "es-MX",
              {
                minimumFractionDigits: 2,
              }
            )}
          </div>

        </div>

      </div>

      <div className="bg-white shadow rounded p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                No.
              </th>

              <th className="border p-2">
                Empleado
              </th>

              <th className="border p-2">
                Percepciones
              </th>

              <th className="border p-2">
                Descuentos
              </th>

              <th className="border p-2">
                Neto
              </th>

              <th className="border p-2">
                Acción
              </th>

            </tr>

          </thead>

          <tbody>

            {nominas.map(
              (nomina) => (

                <tr
                  key={nomina.id}
                >

                  <td className="border p-2">

                    {
                      nomina.empleados
                        ?.numero_empleado
                    }

                  </td>

                  <td className="border p-2">

                    {
                      nomina.empleados
                        ?.nombre_completo
                    }

                  </td>

                  <td className="border p-2 text-right">

                    $
                    {Number(
                      nomina.total_percepciones
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2 text-right">

                    $
                    {Number(
                      nomina.total_descuentos
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2 text-right font-bold">

                    $
                    {Number(
                      nomina.neto_pagar
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2">

                    <Link
                      to={`/nomina/recibo/${nomina.empleado_id}/${nomina.periodo_id}`}
                      className="
                        bg-green-600
                        text-white
                        px-3
                        py-1
                        rounded
                      "
                    >
                      Ver Recibo
                    </Link>

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div>

      <div className="mt-6">

        <button
          onClick={generarZip}
          disabled={
            generandoZip ||
            nominas.length === 0
          }
          className="
            bg-green-600
            text-white
            px-4
            py-2
            rounded
            disabled:bg-gray-400
          "
        >
          {generandoZip
            ? "Generando ZIP..."
            : "📦 Descargar ZIP"}
        </button>

      </div>

    </div>

  );

}