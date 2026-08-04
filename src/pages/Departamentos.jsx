import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Departamentos() {

  const [departamentos, setDepartamentos] =
    useState([]);

  const [nombre, setNombre] =
    useState("");

  const [busqueda, setBusqueda] =
    useState("");

  const [editandoId, setEditandoId] =
    useState(null);

  useEffect(() => {

    cargarDepartamentos();

  }, []);

  const cargarDepartamentos =
    async () => {

      const { data, error } =
        await supabase
          .from("departamentos")
          .select("*")
          .order("nombre");

      if (error) {

        console.error(error);

        return;

      }

      setDepartamentos(data || []);

    };

  const guardarDepartamento =
    async () => {

      if (!nombre.trim()) {

        alert(
          "Ingresa un nombre"
        );

        return;

      }

      if (editandoId) {

        const { error } =
          await supabase
            .from("departamentos")
            .update({
              nombre,
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
          "Departamento actualizado"
        );

      } else {

        const { error } =
          await supabase
            .from("departamentos")
            .insert([
              {
                nombre,
              },
            ]);

        if (error) {

          alert(error.message);

          return;

        }

        alert(
          "Departamento creado"
        );

      }

      setNombre("");
      setEditandoId(null);

      await cargarDepartamentos();

    };

  const editarDepartamento =
    (departamento) => {

      setNombre(
        departamento.nombre
      );

      setEditandoId(
        departamento.id
      );

    };

  const desactivarDepartamento =
    async (id) => {

      const confirmar =
        window.confirm(
          "¿Deseas desactivar este departamento?"
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("departamentos")
          .update({
            activo: false,
          })
          .eq("id", id);

      if (error) {

        alert(error.message);

        return;

      }

      await cargarDepartamentos();

    };

  const departamentosFiltrados =
    departamentos.filter(
      (d) =>
        d.nombre
          ?.toLowerCase()
          .includes(
            busqueda.toLowerCase()
          )
    );

  return (

    <div className="max-w-6xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          🏢 Departamentos
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
            ? "Editar Departamento"
            : "Nuevo Departamento"}

        </h2>

        <div className="flex gap-3">

          <input
            type="text"
            value={nombre}
            onChange={(e) =>
              setNombre(
                e.target.value
              )
            }
            placeholder="Nombre"
            className="
              flex-1
              border
              rounded
              p-2
            "
          />

          <button
            onClick={
              guardarDepartamento
            }
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
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
          placeholder="Buscar departamento..."
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
                Nombre
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

            {departamentosFiltrados.map(
              (departamento) => (

                <tr
                  key={departamento.id}
                >

                  <td className="border p-2 text-center">
                    {departamento.id}
                  </td>

                  <td className="border p-2">
                    {departamento.nombre}
                  </td>

                  <td className="border p-2 text-center">

                    {departamento.activo
                      ? "✅ Activo"
                      : "🚫 Inactivo"}

                  </td>

                  <td className="border p-2">

                    <div className="flex gap-2">

                      <button
                        onClick={() =>
                          editarDepartamento(
                            departamento
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

                      {departamento.activo && (

                        <button
                          onClick={() =>
                            desactivarDepartamento(
                              departamento.id
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