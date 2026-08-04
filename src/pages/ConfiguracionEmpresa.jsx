import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function ConfiguracionEmpresa() {

  const [form, setForm] =
    useState({
      id: null,
      razon_social: "",
      rfc: "",
      direccion: "",
      telefono: "",
      correo: "",
      logo_url: "",
    });

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {

    cargarConfiguracion();

  }, []);

  const cargarConfiguracion =
    async () => {

      const { data } =
        await supabase
          .from("configuracion_empresa")
          .select("*")
          .limit(1)
          .maybeSingle();

      if (data) {

        setForm(data);

      }

    };

  const actualizarCampo =
    (campo, valor) => {

      setForm((prev) => ({
        ...prev,
        valor,
      }));

    };

  const guardar =
    async () => {

      setLoading(true);

      const datos = {
        razon_social:
          form.razon_social,
        rfc:
          form.rfc,
        direccion:
          form.direccion,
        telefono:
          form.telefono,
        correo:
          form.correo,
        logo_url:
          form.logo_url,
      };

      let error = null;

      if (form.id) {

        const respuesta =
          await supabase
            .from(
              "configuracion_empresa"
            )
            .update(datos)
            .eq("id", form.id);

        error =
          respuesta.error;

      } else {

        const respuesta =
          await supabase
            .from(
              "configuracion_empresa"
            )
            .insert([datos]);

        error =
          respuesta.error;

      }

      setLoading(false);

      if (error) {

        alert(error.message);

        return;

      }

      alert(
        "Configuración guardada correctamente"
      );

      cargarConfiguracion();

    };

  return (

    <div className="max-w-5xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        ⚙️ Configuración de Empresa
      </h1>

      <div className="bg-white shadow rounded p-6">

        <div className="grid md:grid-cols-2 gap-4">

          <input
            type="text"
            placeholder="Razón Social"
            value={form.razon_social}
            onChange={(e) =>
              actualizarCampo(
                "razon_social",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="text"
            placeholder="RFC"
            value={form.rfc}
            onChange={(e) =>
              actualizarCampo(
                "rfc",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="text"
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) =>
              actualizarCampo(
                "telefono",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="email"
            placeholder="Correo"
            value={form.correo}
            onChange={(e) =>
              actualizarCampo(
                "correo",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="text"
            placeholder="URL Logo"
            value={form.logo_url}
            onChange={(e) =>
              actualizarCampo(
                "logo_url",
                e.target.value
              )
            }
            className="border p-2 rounded md:col-span-2"
          />

          <textarea
            placeholder="Dirección"
            value={form.direccion}
            onChange={(e) =>
              actualizarCampo(
                "direccion",
                e.target.value
              )
            }
            className="
              border
              p-2
              rounded
              md:col-span-2
              min-h-32
            "
          />

        </div>

        {form.logo_url && (

          <div className="mt-6">

            <p className="font-bold mb-2">
              Vista previa del logo
            </p>

            <img
              src={form.logo_url}
              alt="Logo"
              className="
                h-24
                object-contain
              "
            />

          </div>

        )}

        <button
          onClick={guardar}
          disabled={loading}
          className="
            mt-6
            bg-green-600
            text-white
            px-6
            py-2
            rounded
            disabled:bg-gray-400
          "
        >

          {loading
            ? "Guardando..."
            : "Guardar Configuración"}

        </button>

      </div>

    </div>

  );

}