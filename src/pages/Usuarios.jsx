import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Usuarios() {

  const [usuarios, setUsuarios] =
    useState([]);

  useEffect(() => {

    cargarUsuarios();

  }, []);

  const cargarUsuarios =
    async () => {

      const { data, error } =
        await supabase
          .from("profiles")
          .select("*")
          .order("nombre");

      if (error) {

        console.error(error);
        return;

      }

      setUsuarios(data || []);

    };

  const cambiarRol =
    async (id, rol) => {

      const { error } =
        await supabase
          .from("profiles")
          .update({
            rol,
          })
          .eq("id", id);

      if (error) {

        alert(error.message);
        return;

      }

      cargarUsuarios();

    };

  const cambiarEstatus =
    async (usuario) => {

      const { error } =
        await supabase
          .from("profiles")
          .update({
            activo:
              !usuario.activo,
          })
          .eq(
            "id",
            usuario.id
          );

      if (error) {

        alert(error.message);
        return;

      }

      cargarUsuarios();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          👥 Usuarios
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

      <div className="bg-white rounded shadow p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                Nombre
              </th>

              <th className="border p-2">
                Rol
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

            {usuarios.map(
              (usuario) => (

                <tr
                  key={usuario.id}
                >

                  <td className="border p-2">
                    {usuario.nombre}
                  </td>

                  <td className="border p-2">

                    <select
                      value={usuario.rol}
                      onChange={(e) =>
                        cambiarRol(
                          usuario.id,
                          e.target.value
                        )
                      }
                      className="
                        border
                        p-1
                        rounded
                      "
                    >

                      <option value="ADMIN">
                        ADMIN
                      </option>

                      <option value="RH">
                        RH
                      </option>

                      <option value="CONSULTA">
                        CONSULTA
                      </option>

                    </select>

                  </td>

                  <td className="border p-2 text-center">

                    {usuario.activo
                      ? "✅ Activo"
                      : "🚫 Inactivo"}

                  </td>

                  <td className="border p-2 text-center">

                    <button
                      onClick={() =>
                        cambiarEstatus(
                          usuario
                        )
                      }
                      className={`
                        px-3
                        py-1
                        rounded
                        text-white
                        ${
                          usuario.activo
                            ? "bg-red-600"
                            : "bg-green-600"
                        }
                      `}
                    >

                      {usuario.activo
                        ? "Desactivar"
                        : "Activar"}

                    </button>

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