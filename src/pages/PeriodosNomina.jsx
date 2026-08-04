import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function PeriodosNomina() {

  const [periodos, setPeriodos] =
    useState([]);

  const [descripcion, setDescripcion] =
    useState("");

  const [fechaInicio, setFechaInicio] =
    useState("");

  const [fechaFin, setFechaFin] =
    useState("");

  const [editandoId, setEditandoId] =
    useState(null);

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

  const limpiarFormulario =
    () => {

      setDescripcion("");
      setFechaInicio("");
      setFechaFin("");
      setEditandoId(null);

    };

  const guardarPeriodo =
    async () => {

      if (
        !descripcion ||
        !fechaInicio ||
        !fechaFin
      ) {

        alert(
          "Completa todos los campos"
        );

        return;

      }

      if (editandoId) {

        const { error } =
          await supabase
            .from("periodos_nomina")
            .update({
              descripcion,
              fecha_inicio:
                fechaInicio,
              fecha_fin:
                fechaFin,
            })
            .eq(
              "id",
              editandoId
            );

        if (error) {

          alert(error.message);
          return;

        }

        alert(
          "Periodo actualizado"
        );

      } else {

        const { error } =
          await supabase
            .from("periodos_nomina")
            .insert([
              {
                descripcion,
                fecha_inicio:
                  fechaInicio,
                fecha_fin:
                  fechaFin,
              },
            ]);

        if (error) {

          alert(error.message);
          return;

        }

        alert(
          "Periodo creado"
        );

      }

      limpiarFormulario();
      cargarPeriodos();

    };

  const editarPeriodo =
    (periodo) => {

      if (
        periodo.estatus ===
        "CERRADO"
      ) {

        alert(
          "Un periodo cerrado no puede editarse"
        );

        return;

      }

      setEditandoId(
        periodo.id
      );

      setDescripcion(
        periodo.descripcion
      );

      setFechaInicio(
        periodo.fecha_inicio
      );

      setFechaFin(
        periodo.fecha_fin
      );

    };

  const cerrarPeriodo =
    async (periodo) => {

      const confirmar =
        window.confirm(
          "¿Deseas cerrar este periodo?"
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("periodos_nomina")
          .update({
            estatus:
              "CERRADO",
          })
          .eq(
            "id",
            periodo.id
          );

      if (error) {

        alert(error.message);
        return;

      }

      cargarPeriodos();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          📅 Periodos de Nómina
        </h1>

        <Link
          to="/dashboard"
          className="
            bg-blue-600
            text-white
            px-4
            py-2
            rounded
          "
        >
          Dashboard
        </Link>

      </div>

      <div className="bg-white shadow rounded p-6 mb-6">

        <h2 className="text-xl font-bold mb-4">

          {editandoId
            ? "Editar Periodo"
            : "Nuevo Periodo"}

        </h2>

        <div className="grid md:grid-cols-4 gap-4">

          <input
            type="text"
            placeholder="Semana 31"
            value={descripcion}
            onChange={(e) =>
              setDescripcion(
                e.target.value
              )
            }
            className="
              border
              p-2
              rounded
            "
          />

          <input
            type="date"
            value={fechaInicio}
            onChange={(e) =>
              setFechaInicio(
                e.target.value
              )
            }
            className="
              border
              p-2
              rounded
            "
          />

          <input
            type="date"
            value={fechaFin}
            onChange={(e) =>
              setFechaFin(
                e.target.value
              )
            }
            className="
              border
              p-2
              rounded
            "
          />

          <button
            onClick={
              guardarPeriodo
            }
            className="
              bg-green-600
              text-white
              rounded
            "
          >

            {editandoId
              ? "Actualizar"
              : "Guardar"}

          </button>

        </div>

      </div>

      <div className="bg-white shadow rounded p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                Descripción
              </th>

              <th className="border p-2">
                Inicio
              </th>

              <th className="border p-2">
                Fin
              </th>

              <th className="border p-2">
                Estatus
              </th>

              <th className="border p-2">
                Acciones
              </th>

            </tr>

          </thead>

          <tbody>

            {periodos.map(
              (periodo) => (

                <tr
                  key={periodo.id}
                >

                  <td className="border p-2">
                    {periodo.descripcion}
                  </td>

                  <td className="border p-2 text-center">
                    {periodo.fecha_inicio}
                  </td>

                  <td className="border p-2 text-center">
                    {periodo.fecha_fin}
                  </td>

                  <td className="border p-2 text-center">

                    {periodo.estatus === "ABIERTO"
                      ? "🟢 ABIERTO"
                      : "🔒 CERRADO"}

                  </td>

                  <td className="border p-2">

                    <div className="flex gap-2">

                      {periodo.estatus ===
                        "ABIERTO" && (

                        <>
                          <button
                            onClick={() =>
                              editarPeriodo(
                                periodo
                              )
                            }
                            className="
                              bg-yellow-500
                              text-white
                              px-3
                              py-1
                              rounded
                            "
                          >
                            Editar
                          </button>

                          <button
                            onClick={() =>
                              cerrarPeriodo(
                                periodo
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
                            Cerrar
                          </button>
                        </>

                      )}

                    </div>

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