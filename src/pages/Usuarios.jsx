import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

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

  const activos =
    usuarios.filter(
      (u) => u.activo
    ).length;

  const inactivos =
    usuarios.filter(
      (u) => !u.activo
    ).length;

  const admins =
    usuarios.filter(
      (u) => u.rol === "ADMIN"
    ).length;

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            👥 Usuarios
          </h1>

          <p className="text-gray-500 mt-2">
            Administración de accesos y roles
          </p>

        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">

          <KpiCard
            titulo="Usuarios Activos"
            valor={activos}
            icono="✅"
            color="text-green-600"
          />

          <KpiCard
            titulo="Usuarios Inactivos"
            valor={inactivos}
            icono="🚫"
            color="text-red-600"
          />

          <KpiCard
            titulo="Administradores"
            valor={admins}
            icono="👑"
            color="text-purple-600"
          />

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            overflow-x-auto
          "
        >

          <table className="w-full">

            <thead className="bg-slate-100">

              <tr>

                <th className="p-4 text-left">
                  Nombre
                </th>

                <th className="p-4 text-center">
                  Rol
                </th>

                <th className="p-4 text-center">
                  Estado
                </th>

                <th className="p-4 text-center">
                  Acciones
                </th>

              </tr>

            </thead>

            <tbody>

              {usuarios.map(
                (usuario) => (

                  <tr
                    key={usuario.id}
                    className="
                      border-t
                      hover:bg-slate-50
                      transition
                    "
                  >

                    <td className="p-4 font-medium">
                      {usuario.nombre}
                    </td>

                    <td className="p-4 text-center">

                      <div className="flex justify-center">

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
                            rounded-xl
                            px-3
                            py-2
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

                      </div>

                    </td>

                    <td className="p-4 text-center">

                      {usuario.activo ? (

                        <span
                          className="
                            bg-green-100
                            text-green-700
                            px-3
                            py-1
                            rounded-full
                            text-sm
                            font-medium
                          "
                        >
                          Activo
                        </span>

                      ) : (

                        <span
                          className="
                            bg-red-100
                            text-red-700
                            px-3
                            py-1
                            rounded-full
                            text-sm
                            font-medium
                          "
                        >
                          Inactivo
                        </span>

                      )}

                    </td>

                    <td className="p-4 text-center">

                      <button
                        onClick={() =>
                          cambiarEstatus(
                            usuario
                          )
                        }
                        className={`
                          px-4
                          py-2
                          rounded-xl
                          text-white
                          transition
                          ${
                            usuario.activo
                              ? "bg-red-600 hover:bg-red-700"
                              : "bg-green-600 hover:bg-green-700"
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

    </Layout>

  );

}