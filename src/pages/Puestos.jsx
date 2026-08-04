import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Puestos() {

  const [puestos, setPuestos] =
    useState([]);

  const [departamentos, setDepartamentos] =
    useState([]);

  const [nombre, setNombre] =
    useState("");

  const [departamentoId, setDepartamentoId] =
    useState("");

  const [busqueda, setBusqueda] =
    useState("");

  const [editandoId, setEditandoId] =
    useState(null);

  useEffect(() => {

    cargarPuestos();
    cargarDepartamentos();

  }, []);

  const cargarPuestos = async () => {

    const { data, error } =
      await supabase
        .from("puestos")
        .select(`
          *,
          departamentos (
            nombre
          )
        `)
        .order("nombre");

    if (error) {

      console.error(error);
      return;

    }

    setPuestos(data || []);

  };

  const cargarDepartamentos =
    async () => {

      const { data, error } =
        await supabase
          .from("departamentos")
          .select("*")
          .eq("activo", true)
          .order("nombre");

      if (error) {

        console.error(error);
        return;

      }

      setDepartamentos(
        data || []
      );

    };

  const guardarPuesto =
    async () => {

      if (
        !nombre.trim() ||
        !departamentoId
      ) {

        alert(
          "Completa todos los campos"
        );

        return;

      }

      if (editandoId) {

        const { error } =
          await supabase
            .from("puestos")
            .update({
              nombre,
              departamento_id:
                Number(
                  departamentoId
                ),
            })
            .eq(
              "id",
              editandoId
            );

        if (error) {

          alert(
            error.message
          );

          return;

        }

        alert(
          "Puesto actualizado"
        );

      } else {

        const { error } =
          await supabase
            .from("puestos")
            .insert([
              {
                nombre,
                departamento_id:
                  Number(
                    departamentoId
                  ),
              },
            ]);

        if (error) {

          alert(
            error.message
          );

          return;

        }

        alert(
          "Puesto creado"
        );

      }

      setNombre("");
      setDepartamentoId("");
      setEditandoId(null);

      await cargarPuestos();

    };

  const editarPuesto =
    (puesto) => {

      setEditandoId(
        puesto.id
      );

      setNombre(
        puesto.nombre
      );

      setDepartamentoId(
        puesto.departamento_id
      );

    };

  const desactivarPuesto =
    async (id) => {

      const confirmar =
        window.confirm(
          "¿Deseas desactivar este puesto?"
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("puestos")
          .update({
            activo: false,
          })
          .eq("id", id);

      if (error) {

        alert(
          error.message
        );

        return;

      }

      await cargarPuestos();

    };

  const puestosFiltrados =
    puestos.filter(
      (puesto) =>
        puesto.nombre
          .toLowerCase()
          .includes(
            busqueda.toLowerCase()
          )
    );

  return (

    <div className="max-w-6xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          💼 Puestos
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
          Regresar
        </Link>

      </div>

      <div className="bg-white shadow rounded p-4 mb-6">

        <h2 className="text-xl font-bold mb-4">

          {editandoId
            ? "Editar Puesto"
            : "Nuevo Puesto"}

        </h2>

        <div className="grid md:grid-cols-3 gap-3">

          <input
            type="text"
            placeholder="Nombre del puesto"
            value={nombre}
            onChange={(e) =>
              setNombre(
                e.target.value
              )
            }
            className="
              border
              rounded
              p-2
            "
          />

          <select
            value={departamentoId}
            onChange={(e) =>
              setDepartamentoId(
                e.target.value
              )
            }
            className="
              border
              rounded
              p-2
            "
          >

            <option value="">
              Selecciona departamento
            </option>

            {departamentos.map(
              (departamento) => (

                <option
                  key={departamento.id}
                  value={departamento.id}
                >
                  {departamento.nombre}
                </option>

              )
            )}

          </select>

          <button
            onClick={
              guardarPuesto
            }
            className="
              bg-green-600
              text-white
              rounded
              px-4
              py-2
            "
          >

            {editandoId
              ? "Actualizar"
              : "Guardar"}

          </button>

        </div>

      </div>

      <div className="bg-white shadow rounded p-4 mb-6">

        <input
          type="text"
          placeholder="Buscar puesto..."
          value={busqueda}
          onChange={(e) =>
            setBusqueda(
              e.target.value
            )
          }
          className="
            w-full
            border
            rounded
            p-2
          "
        />

      </div>

      <div className="bg-white shadow rounded p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                ID
              </th>

              <th className="border p-2">
                Puesto
              </th>

              <th className="border p-2">
                Departamento
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

            {puestosFiltrados.map(
              (puesto) => (

                <tr
                  key={puesto.id}
                >

                  <td className="border p-2 text-center">
                    {puesto.id}
                  </td>

                  <td className="border p-2">
                    {puesto.nombre}
                  </td>

                  <td className="border p-2">

                    {puesto.departamentos
                      ?.nombre ||
                      "-"}

                  </td>

                  <td className="border p-2 text-center">

                    {puesto.activo
                      ? "✅ Activo"
                      : "🚫 Inactivo"}

                  </td>

                  <td className="border p-2">

                    <div className="flex gap-2">

                      <button
                        onClick={() =>
                          editarPuesto(
                            puesto
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

                      {puesto.activo && (

                        <button
                          onClick={() =>
                            desactivarPuesto(
                              puesto.id
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
                          Desactivar
                        </button>

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