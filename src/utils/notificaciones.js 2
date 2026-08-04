import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Notificaciones() {

  const [notificaciones,
    setNotificaciones] =
    useState([]);

  useEffect(() => {

    cargar();

  }, []);

  const cargar = async () => {

    const { data } =
      await supabase
        .from("notificaciones")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    setNotificaciones(data || []);

  };

  const marcarLeida =
    async (id) => {

      await supabase
        .from("notificaciones")
        .update({
          leida: true,
        })
        .eq("id", id);

      cargar();

    };

  return (

    <div className="max-w-6xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        🔔 Notificaciones
      </h1>

      <div className="space-y-4">

        {notificaciones.map(
          (item) => (

            <div
              key={item.id}
              className="
                bg-white
                rounded
                shadow
                p-4
              "
            >

              <div className="flex justify-between">

                <div>

                  <h3 className="font-bold">

                    {item.titulo}

                  </h3>

                  <p>

                    {item.mensaje}

                  </p>

                  <p className="text-sm text-gray-500">

                    {new Date(
                      item.created_at
                    ).toLocaleString(
                      "es-MX"
                    )}

                  </p>

                </div>

                {!item.leida && (

                  <button
                    onClick={() =>
                      marcarLeida(
                        item.id
                      )
                    }
                    className="
                      bg-blue-600
                      text-white
                      px-3
                      py-1
                      rounded
                    "
                  >
                    Marcar leída
                  </button>

                )}

              </div>

            </div>

          )
        )}

      </div>

    </div>

  );

}