import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Prestamos() {

  const [empleados, setEmpleados] =
    useState([]);

  const [prestamos, setPrestamos] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      importe_total: "",
      descuento_periodo: "",
      observaciones: "",
    });

  useEffect(() => {

    cargarEmpleados();
    cargarPrestamos();

  }, []);

  const cargarEmpleados =
    async () => {

      const { data, error } =
        await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true)
          .order("nombre_completo");

      if (error) {

        console.error(error);
        return;

      }

      setEmpleados(data || []);

    };

  const cargarPrestamos =
    async () => {

      const { data, error } =
        await supabase
          .from("prestamos")
          .select(`
            *,
            empleados (
              nombre_completo,
              numero_empleado
            )
          `)
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

      if (error) {

        console.error(error);
        return;

      }

      setPrestamos(data || []);

    };

  const guardarPrestamo =
    async () => {

      if (
        !form.empleado_id ||
        !form.importe_total ||
        !form.descuento_periodo
      ) {

        alert(
          "Completa los campos requeridos"
        );

        return;

      }

      const { error } =
        await supabase
          .from("prestamos")
          .insert([
            {
              empleado_id:
                Number(form.empleado_id),

              importe_total:
                Number(
                  form.importe_total
                ),

              saldo_actual:
                Number(
                  form.importe_total
                ),

              descuento_periodo:
                Number(
                  form.descuento_periodo
                ),

              observaciones:
                form.observaciones,
            },
          ]);

      if (error) {

        alert(error.message);

        return;

      }

      alert(
        "Préstamo registrado"
      );

      setForm({
        empleado_id: "",
        importe_total: "",
        descuento_periodo: "",
        observaciones: "",
      });

      cargarPrestamos();

    };

  const liquidarPrestamo =
    async (prestamo) => {

      const confirmar =
        window.confirm(
          "¿Deseas marcar el préstamo como liquidado?"
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("prestamos")
          .update({
            estatus:
              "LIQUIDADO",
            saldo_actual: 0,
          })
          .eq(
            "id",
            prestamo.id
          );

      if (error) {

        alert(error.message);

        return;

      }

      cargarPrestamos();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        💳 Préstamos
      </h1>

      <div className="bg-white shadow rounded p-6 mb-6">

        <div className="grid md:grid-cols-2 gap-4">

          <select
            value={form.empleado_id}
            onChange={(e) =>
              setForm({
                ...form,
                empleado_id:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          >

            <option value="">
              Seleccionar empleado
            </option>

            {empleados.map(
              (empleado) => (

                <option
                  key={empleado.id}
                  value={empleado.id}
                >
                  {empleado.nombre_completo}
                </option>

              )
            )}

          </select>

          <input
            type="number"
            step="0.01"
            placeholder="Importe total"
            value={form.importe_total}
            onChange={(e) =>
              setForm({
                ...form,
                importe_total:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            step="0.01"
            placeholder="Descuento por período"
            value={form.descuento_periodo}
            onChange={(e) =>
              setForm({
                ...form,
                descuento_periodo:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          />

          <textarea
            placeholder="Observaciones"
            value={form.observaciones}
            onChange={(e) =>
              setForm({
                ...form,
                observaciones:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          />

        </div>

        <button
          onClick={
            guardarPrestamo
          }
          className="
            mt-4
            bg-green-600
            text-white
            px-4
            py-2
            rounded
          "
        >
          Guardar Préstamo
        </button>

      </div>

      <div className="bg-white shadow rounded p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                Empleado
              </th>

              <th className="border p-2">
                Monto
              </th>

              <th className="border p-2">
                Saldo
              </th>

              <th className="border p-2">
                Descuento
              </th>

              <th className="border p-2">
                Estatus
              </th>

              <th className="border p-2">
                Acción
              </th>

            </tr>

          </thead>

          <tbody>

            {prestamos.map(
              (prestamo) => (

                <tr
                  key={prestamo.id}
                >

                  <td className="border p-2">

                    {
                      prestamo.empleados
                        ?.nombre_completo
                    }

                  </td>

                  <td className="border p-2 text-right">

                    $
                    {Number(
                      prestamo.importe_total
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2 text-right">

                    $
                    {Number(
                      prestamo.saldo_actual
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2 text-right">

                    $
                    {Number(
                      prestamo.descuento_periodo
                    ).toFixed(2)}

                  </td>

                  <td className="border p-2 text-center">

                    {prestamo.estatus}

                  </td>

                  <td className="border p-2 text-center">

                    {prestamo.estatus ===
                      "ACTIVO" && (

                      <button
                        onClick={() =>
                          liquidarPrestamo(
                            prestamo
                          )
                        }
                        className="
                          bg-red-600
                          text-white
                          px-3
                          py-1
                          rounded
                        "
                      >
                        Liquidar
                      </button>

                    )}

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