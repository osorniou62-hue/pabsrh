import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function ReciboNomina() {

  const { empleadoId, periodoId } =
    useParams();

  const navigate =
    useNavigate();

  const [empleado, setEmpleado] =
    useState(null);

  const [periodo, setPeriodo] =
    useState(null);

  const [nomina, setNomina] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    cargarDatos();

  }, []);

  const cargarDatos =
    async () => {

      try {

        const { data: empleado } =
          await supabase
            .from("empleados")
            .select("*")
            .eq("id", empleadoId)
            .single();

        const { data: periodo } =
          await supabase
            .from("periodos_nomina")
            .select("*")
            .eq("id", periodoId)
            .single();

        const { data: nomina } =
          await supabase
            .from("nomina")
            .select("*")
            .eq(
              "empleado_id",
              empleadoId
            )
            .eq(
              "periodo_id",
              periodoId
            )
            .single();

        setEmpleado(empleado);
        setPeriodo(periodo);
        setNomina(nomina);

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    };

  const descargarPDF =
    async () => {

      const contenido =
        document.getElementById(
          "recibo"
        );

      if (!contenido) return;

      const canvas =
        await html2canvas(
          contenido,
          {
            scale: 2,
          }
        );

      const imgData =
        canvas.toDataURL(
          "image/png"
        );

      const pdf =
        new jsPDF(
          "p",
          "mm",
          "a4"
        );

      const anchoPDF =
        pdf.internal.pageSize.getWidth();

      const altoPDF =
        (canvas.height *
          anchoPDF) /
        canvas.width;

      pdf.addImage(
        imgData,
        "PNG",
        0,
        0,
        anchoPDF,
        altoPDF
      );

      pdf.save(
        `Recibo_${empleado.numero_empleado}.pdf`
      );

    };

  if (loading) {

    return (
      <div className="p-6">
        Cargando recibo...
      </div>
    );

  }

  if (
    !empleado ||
    !periodo ||
    !nomina
  ) {

    return (
      <div className="p-6">
        No se encontró información.
      </div>
    );

  }

  return (

    <div className="max-w-4xl mx-auto p-6">

      <div className="flex justify-between mb-6">

        <h1 className="text-3xl font-bold">
          📄 Recibo de Nómina
        </h1>

        <div className="flex gap-3">

          <button
            onClick={descargarPDF}
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Descargar PDF
          </button>

          <button
            onClick={() =>
              navigate(-1)
            }
            className="
              bg-blue-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Regresar
          </button>

        </div>

      </div>

      <div
        id="recibo"
        className="
          bg-white
          shadow
          rounded-lg
          p-8
        "
      >

        <div className="text-center mb-8">

          <h2 className="text-2xl font-bold">
            PABS RH
          </h2>

          <h3 className="text-xl">
            RECIBO DE NÓMINA
          </h3>

        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">

          <div>

            <h4 className="font-bold mb-2">
              Datos del Empleado
            </h4>

            <p>
              <strong>No. Empleado:</strong>{" "}
              {empleado.numero_empleado}
            </p>

            <p>
              <strong>Nombre:</strong>{" "}
              {empleado.nombre_completo}
            </p>

            <p>
              <strong>RFC:</strong>{" "}
              {empleado.rfc || "-"}
            </p>

            <p>
              <strong>CURP:</strong>{" "}
              {empleado.curp || "-"}
            </p>

          </div>

          <div>

            <h4 className="font-bold mb-2">
              Periodo
            </h4>

            <p>
              <strong>
                Descripción:
              </strong>{" "}
              {periodo.descripcion}
            </p>

            <p>
              <strong>
                Fecha Inicio:
              </strong>{" "}
              {periodo.fecha_inicio}
            </p>

            <p>
              <strong>
                Fecha Fin:
              </strong>{" "}
              {periodo.fecha_fin}
            </p>

            <p>
              <strong>Folio:</strong>{" "}
              NOM-{nomina.id}
            </p>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">

          <div>

            <h4 className="font-bold mb-3 text-green-700">
              Percepciones
            </h4>

            <table className="w-full">

              <tbody>

                <tr>

                  <td>
                    Sueldo Base
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.sueldo_base
                    ).toFixed(2)}
                  </td>

                </tr>

                <tr>

                  <td>
                    Bonos
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.total_bonos
                    ).toFixed(2)}
                  </td>

                </tr>

                <tr>

                  <td>
                    Horas Extra
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.total_horas_extra
                    ).toFixed(2)}
                  </td>

                </tr>

                <tr className="font-bold">

                  <td>
                    Total
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.total_percepciones
                    ).toFixed(2)}
                  </td>

                </tr>

              </tbody>

            </table>

          </div>

          <div>

            <h4 className="font-bold mb-3 text-red-700">
              Deducciones
            </h4>

            <table className="w-full">

              <tbody>

                <tr>

                  <td>
                    Descuentos
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.total_descuentos
                    ).toFixed(2)}
                  </td>

                </tr>

                <tr className="font-bold">

                  <td>
                    Total
                  </td>

                  <td className="text-right">
                    $
                    {Number(
                      nomina.total_descuentos
                    ).toFixed(2)}
                  </td>

                </tr>

              </tbody>

            </table>

          </div>

        </div>

        <div className="border-t pt-6 text-center">

          <div className="text-xl font-bold">
            NETO A PAGAR
          </div>

          <div
            className="
              text-4xl
              font-bold
              text-blue-700
              mt-2
            "
          >
            $
            {Number(
              nomina.neto_pagar
            ).toFixed(2)}
          </div>

        </div>

        <div
          className="
            mt-8
            text-xs
            text-gray-600
          "
        >
          Recibí la cantidad
          indicada como salario
          neto correspondiente al
          período señalado en este
          recibo.
        </div>

        <div className="grid grid-cols-2 gap-12 mt-16">

          <div className="text-center">

            <div className="border-t pt-2">
              Empleado
            </div>

          </div>

          <div className="text-center">

            <div className="border-t pt-2">
              Recursos Humanos
            </div>

          </div>

        </div>

      </div>

    </div>

  );

}