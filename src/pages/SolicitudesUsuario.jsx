import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function SolicitudesUsuario() {

  const [solicitudes, setSolicitudes] =
    useState([]);

  useEffect(() => {

    cargarSolicitudes();

  }, []);

  const cargarSolicitudes =
    async () => {

      const { data, error } =
        await supabase
          .from("solicitudes_usuario")
          .select("*")
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

      setSolicitudes(data || []);

    };

  const aprobarSolicitud =
    async (solicitud) => {

      const { error } =
        await supabase
          .from("solicitudes_usuario")
          .update({
            estatus:
              "APROBADA",
          })
          .eq(
            "id",
            solicitud.id
          );

      if (error) {

        alert(error.message);
        return;

      }

      alert(
        "Solicitud aprobada. Ahora debes crear el usuario en Authentication."
      );

      cargarSolicitudes();

    };

  const rechazarSolicitud =
    async (solicitud) => {

      const { error } =
        await supabase
          .from("solicitudes_usuario")
          .update({
            estatus:
              "RECHAZADA",
          })
          .eq(
            "id",
            solicitud.id
          );

      if (error) {

        alert(error.message);
        return;

      }

      cargarSolicitudes();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          📨 Solicitudes de Usuario
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

      <div className="bg-white shadow rounded p-4">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">
                Nombre
              </th>

              <th className="border p-2">
                Correo
              </th>

              <th className="border p-2">
                Teléfono
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

            {solicitudes.map(
              (solicitud) => (

                <tr
                  key={solicitud.id}
                >

                  <td className="border p-2">
                    {solicitud.nombre}
                  </td>

                  <td className="border p-2">
                    {solicitud.correo}
                  </td>

                  <td className="border p-2">
                    {solicitud.telefono}
                  </td>

                  <td className="border p-2 text-center">

                    {solicitud.estatus === "PENDIENTE" && "🟡 Pendiente"}
                    {solicitud.estatus === "APROBADA" && "✅ Aprobada"}
                    {solicitud.estatus === "RECHAZADA" && "❌ Rechazada"}

                  </td>

                  <td className="border p-2">

                    {solicitud.estatus === "PENDIENTE" && (

                      <div className="flex gap-2">

                        <button
                          onClick={() =>
                            aprobarSolicitud(
                              solicitud
                            )
                          }
                          className="
                            bg-green-600
                            text-white
                            px-3
                            py-1
                            rounded
                          "
                        >
                          Aprobar
                        </button>

                        <button
                          onClick={() =>
                            rechazarSolicitud(
                              solicitud
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
                          Rechazar
                        </button>

                      </div>

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