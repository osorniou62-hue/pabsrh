import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Descuentos() {

  const [empleados, setEmpleados] =
    useState([]);

  const [periodos, setPeriodos] =
    useState([]);

  const [tipos, setTipos] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      periodo_id: "",
      tipo_descuento_id: "",
      importe: 0,
      observaciones: "",
    });

  useEffect(() => {

    cargarCatalogos();

  }, []);

  const cargarCatalogos =
    async () => {

      const { data: empleados }
        = await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true);

      const { data: periodos }
        = await supabase
          .from("periodos_nomina")
          .select("*")
          .eq("estatus", "ABIERTO");

      const { data: tipos }
        = await supabase
          .from("tipos_descuento")
          .select("*")
          .eq("activo", true);

      setEmpleados(empleados || []);
      setPeriodos(periodos || []);
      setTipos(tipos || []);

    };

  const guardar = async () => {

    const { error } = await supabase
      .from("descuentos_empleado")
      .insert([
        {
          ...form,
          empleado_id:
            Number(form.empleado_id),
          periodo_id:
            Number(form.periodo_id),
          tipo_descuento_id:
            Number(form.tipo_descuento_id),
        },
      ]);

    if (error) {

      alert(error.message);
      return;

    }

    alert("Descuento guardado");

  };

  return (

    <div className="max-w-4xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        ➖ Descuentos
      </h1>

      <div className="grid gap-3">

        <select
          onChange={(e) =>
            setForm({
              ...form,
              empleado_id:
                e.target.value,
            })
          }
        >
          <option>Empleado</option>

          {empleados.map((e) => (

            <option
              key={e.id}
              value={e.id}
            >
              {e.nombre_completo}
            </option>

          ))}

        </select>

        <select
          onChange={(e) =>
            setForm({
              ...form,
              periodo_id:
                e.target.value,
            })
          }
        >
          <option>Periodo</option>

          {periodos.map((p) => (

            <option
              key={p.id}
              value={p.id}
            >
              {p.descripcion}
            </option>

          ))}

        </select>

        <select
          onChange={(e) =>
            setForm({
              ...form,
              tipo_descuento_id:
                e.target.value,
            })
          }
        >
          <option>Tipo</option>

          {tipos.map((t) => (

            <option
              key={t.id}
              value={t.id}
            >
              {t.nombre}
            </option>

          ))}

        </select>

        <input
          type="number"
          placeholder="Importe"
          onChange={(e) =>
            setForm({
              ...form,
              importe:
                e.target.value,
            })
          }
        />

        <textarea
          placeholder="Observaciones"
          onChange={(e) =>
            setForm({
              ...form,
              observaciones:
                e.target.value,
            })
          }
        />

        <button
          onClick={guardar}
          className="bg-green-600 text-white p-2 rounded"
        >
          Guardar
        </button>

      </div>

    </div>

  );

}