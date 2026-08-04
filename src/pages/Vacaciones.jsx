import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Vacaciones() {

  const [empleados, setEmpleados] =
    useState([]);

  const [vacaciones, setVacaciones] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      fecha_inicio: "",
      fecha_fin: "",
      dias: 0,
      observaciones: "",
    });

  useEffect(() => {

    cargarEmpleados();
    cargarVacaciones();

  }, []);

  const cargarEmpleados =
    async () => {

      const { data } =
        await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true)
          .order("nombre_completo");

      setEmpleados(data || []);

    };

  const cargarVacaciones =
    async () => {

      const { data } =
        await supabase
          .from("vacaciones")
          .select(`
            *,
            empleados (
              nombre_completo
            )
          `)
          .order(
            "fecha_inicio",
            {
              ascending: false,
            }
          );

      setVacaciones(data || []);

    };

  const guardar =
    async () => {

      const { error } =
        await supabase
          .from("vacaciones")
          .insert([
            {
              empleado_id:
                Number(
                  form.empleado_id
                ),
              fecha_inicio:
                form.fecha_inicio,
              fecha_fin:
                form.fecha_fin,
              dias:
                Number(form.dias),
              observaciones:
                form.observaciones,
            },
          ]);

      if (error) {

        alert(error.message);

        return;

      }

      alert(
        "Vacaciones registradas"
      );

      setForm({
        empleado_id: "",
        fecha_inicio: "",
        fecha_fin: "",
        dias: 0,
        observaciones: "",
      });

      cargarVacaciones();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        🏖 Vacaciones
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
            placeholder="Días"
            value={form.dias}
            onChange={(e) =>
              setForm({
                ...form,
                dias:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={form.fecha_inicio}
            onChange={(e) =>
              setForm({
                ...form,
                fecha_inicio:
                  e.target.value,
              })
            }
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={form.fecha_fin}
            onChange={(e) =>
              setForm({
                ...form,
                fecha_fin:
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
            className="
              border
              p-2
              rounded
              md:col-span-2
            "
          />

        </div>

        <button
          onClick={guardar}
          className="
            mt-4
            bg-green-600
            text-white
            px-4
            py-2
            rounded
          "
        >
          Guardar
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
                Inicio
              </th>

              <th className="border p-2">
                Fin
              </th>

              <th className="border p-2">
                Días
              </th>

              <th className="border p-2">
                Estatus
              </th>

            </tr>

          </thead>

          <tbody>

            {vacaciones.map(
              (vacacion) => (

                <tr key={vacacion.id}>

                  <td className="border p-2">
                    {
                      vacacion.empleados
                        ?.nombre_completo
                    }
                  </td>

                  <td className="border p-2">
                    {vacacion.fecha_inicio}
                  </td>

                  <td className="border p-2">
                    {vacacion.fecha_fin}
                  </td>

                  <td className="border p-2 text-center">
                    {vacacion.dias}
                  </td>

                  <td className="border p-2 text-center">
                    {vacacion.estatus}
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