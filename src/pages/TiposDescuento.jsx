import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function TiposDescuento() {

  const [tipos, setTipos] = useState([]);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    cargarTipos();
  }, []);

  const cargarTipos = async () => {

    const { data } = await supabase
      .from("tipos_descuento")
      .select("*")
      .order("nombre");

    setTipos(data || []);

  };

  const guardar = async () => {

    const { error } = await supabase
      .from("tipos_descuento")
      .insert([
        {
          nombre,
          activo: true,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    setNombre("");
    cargarTipos();

  };

  return (

    <div className="max-w-5xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        ➖ Tipos de Descuento
      </h1>

      <div className="flex gap-4 mb-6">

        <input
          value={nombre}
          onChange={(e) =>
            setNombre(e.target.value)
          }
          className="border p-2 rounded flex-1"
          placeholder="Nombre"
        />

        <button
          onClick={guardar}
          className="bg-green-600 text-white px-4 rounded"
        >
          Guardar
        </button>

      </div>

      {tipos.map((tipo) => (

        <div
          key={tipo.id}
          className="border p-3 mb-2 rounded"
        >
          {tipo.nombre}
        </div>

      ))}

    </div>

  );

}