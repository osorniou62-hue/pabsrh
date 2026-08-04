import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Auditoria() {

  const [registros, setRegistros] =
    useState([]);

  useEffect(() => {

    cargar();

  }, []);

  const cargar = async () => {

    const { data } =
      await supabase
        .from("auditoria")
        .select(`
          *,
          profiles (
            nombre
          )
        `)
        .order(
          "fecha",
          {
            ascending: false,
          }
        );

    setRegistros(data || []);

  };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        📋 Auditoría
      </h1>

      <div className="bg-white rounded shadow p-4">

        <table className="w-full border">

          <thead>

            <tr>

              <th>Fecha</th>
              <th>Usuario</th>
              <th>Módulo</th>
              <th>Acción</th>
              <th>Descripción</th>

            </tr>

          </thead>

          <tbody>

            {registros.map(
              (item) => (

                <tr key={item.id}>

                  <td>
                    {new Date(
                      item.fecha
                    ).toLocaleString(
                      "es-MX"
                    )}
                  </td>

                  <td>
                    {
                      item.profiles
                        ?.nombre
                    }
                  </td>

                  <td>
                    {item.modulo}
                  </td>

                  <td>
                    {item.accion}
                  </td>

                  <td>
                    {item.descripcion}
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