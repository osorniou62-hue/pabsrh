import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Nomina() {

  const [periodos, setPeriodos] =
    useState([]);

  const [periodoId, setPeriodoId] =
    useState("");

  const [nomina, setNomina] =
    useState([]);

  const [loading, setLoading] =
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
            { ascending: false }
          );

      if (error) {

        console.error(error);
        return;

      }

      setPeriodos(data || []);

    };

  const generarNomina =
    async () => {

      if (!periodoId) {

        alert(
          "Selecciona un período"
        );

        return;

      }

      setLoading(true);

      const { data: empleados } =
        await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true);

      const resultado = [];

      for (const empleado of empleados || []) {

        const { data: bonos } =
          await supabase
            .from("bonos_empleado")
            .select("*")
            .eq(
              "empleado_id",
              empleado.id
            )
            .eq(
              "periodo_id",
              periodoId
            );

        const { data: descuentos } =
          await supabase
            .from(
              "descuentos_empleado"
            )
            .select("*")
            .eq(
              "empleado_id",
              empleado.id
            )
            .eq(
              "periodo_id",
              periodoId
            );

        const { data: incidencias } =
          await supabase
            .from("incidencias")
            .select("*")
            .eq(
              "empleado_id",
              empleado.id
            )
            .eq(
              "periodo_id",
              periodoId
            );

        const totalBonos =
          (bonos || []).reduce(
            (acum, item) =>
              acum +
              Number(
                item.importe || 0
              ),
            0
          );

        const totalDescuentos =
          (descuentos || []).reduce(
            (acum, item) =>
              acum +
              Number(
                item.importe || 0
              ),
            0
          );

        const horasExtra =
          (incidencias || []).reduce(
            (acum, item) =>
              acum +
              Number(
                item.horas_extra || 0
              ),
            0
          );

        const pagoHorasExtra =
          horasExtra * 100;

        const sueldoBase =
          Number(
            empleado.sueldo_base || 0
          );

        const percepciones =
          sueldoBase +
          totalBonos +
          pagoHorasExtra;

        const neto =
          percepciones -
          totalDescuentos;

        await supabase
          .from("nomina")
          .upsert([
            {
              empleado_id:
                empleado.id,

              periodo_id:
                Number(periodoId),

              sueldo_base:
                sueldoBase,

              total_bonos:
                totalBonos,

              total_descuentos:
                totalDescuentos,

              total_horas_extra:
                pagoHorasExtra,

              total_percepciones:
                percepciones,

              neto_pagar:
                neto,

              estatus:
                "GENERADA",
            },
          ]);

        resultado.push({

          id: empleado.id,

          numero_empleado:
            empleado.numero_empleado,

          nombre_completo:
            empleado.nombre_completo,

          sueldo_base:
            sueldoBase,

          bonos:
            totalBonos,

          horas_extra:
            pagoHorasExtra,

          descuentos:
            totalDescuentos,

          percepciones,

          neto,

        });

      }

      setNomina(resultado);

      setLoading(false);

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          🧮 Nómina
        </h1>

      </div>

      <div
        className="
          bg-white
          shadow
          rounded
          p-6
          mb-6
        "
      >

        <div className="flex gap-4">

          <select
            value={periodoId}
            onChange={(e) =>
              setPeriodoId(
                e.target.value
              )
            }
            className="
              border
              p-2
              rounded
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
              generarNomina
            }
            disabled={loading}
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >

            {loading
              ? "Generando..."
              : "Generar Nómina"}

          </button>

        </div>

      </div>

      <div
        className="
          bg-white
          shadow
          rounded
          p-4
          overflow-x-auto
        "
      >

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
                Sueldo
              </th>

              <th className="border p-2">
                Bonos
              </th>

              <th className="border p-2">
                Horas Extra
              </th>

              <th className="border p-2">
                Descuentos
              </th>

              <th className="border p-2">
                Percepciones
              </th>

              <th className="border p-2">
                Neto
              </th>

            </tr>

          </thead>

          <tbody>

            {nomina.map(
              (registro) => (

                <tr
                  key={registro.id}
                >

                  <td className="border p-2 text-center">
                    {registro.numero_empleado}
                  </td>

                  <td className="border p-2">
                    {registro.nombre_completo}
                  </td>

                  <td className="border p-2 text-right">
                    $
                    {registro.sueldo_base.toFixed(2)}
                  </td>

                  <td className="border p-2 text-right">
                    $
                    {registro.bonos.toFixed(2)}
                  </td>

                  <td className="border p-2 text-right">
                    $
                    {registro.horas_extra.toFixed(2)}
                  </td>

                  <td className="border p-2 text-right">
                    $
                    {registro.descuentos.toFixed(2)}
                  </td>

                  <td className="border p-2 text-right">
                    $
                    {registro.percepciones.toFixed(2)}
                  </td>

                  <td className="border p-2 text-right font-bold">

                    $
                    {registro.neto.toFixed(2)}

                  </td>
                  <th>Recibo</th>
                  <td>

  <Link
    to={`/nomina/recibo/${registro.id}/${periodoId}`}
    className="
      bg-blue-600
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

    </div>

  );

}