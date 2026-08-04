import { useState } from "react";
import { supabase } from "../services/supabase";
import { useNavigate } from "react-router-dom";

export default function Login() {

  const navigate = useNavigate();

  const [correo, setCorreo] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [mostrarRegistro,
    setMostrarRegistro] =
    useState(false);

  const [registro,
    setRegistro] =
    useState({
      nombre: "",
      correo: "",
      telefono: "",
      password: "",
    });

  const iniciarSesion =
    async (e) => {

      e.preventDefault();

      setLoading(true);

      const {
        data,
        error,
      } = await supabase.auth.signInWithPassword({
        email: correo,
        password,
      });

      if (error) {

        console.error(error);

        setLoading(false);

        alert(error.message);

        return;

      }

      const usuario =
        data?.user;

      if (!usuario) {

        setLoading(false);

        alert(
          "No fue posible iniciar sesión"
        );

        return;

      }

      const {
        data: perfil,
        error: perfilError,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq(
          "id",
          usuario.id
        )
        .single();

      if (perfilError) {

        setLoading(false);

        alert(
          "No existe perfil para este usuario"
        );

        await supabase.auth.signOut();

        return;

      }

      if (!perfil.activo) {

        setLoading(false);

        alert(
          "Usuario inactivo"
        );

        await supabase.auth.signOut();

        return;

      }

      setLoading(false);

      navigate("/dashboard");

    };

  const solicitarRegistro =
    async () => {

      if (
        !registro.nombre ||
        !registro.correo ||
        !registro.password
      ) {

        alert(
          "Completa los campos requeridos"
        );

        return;

      }

      const { error } =
        await supabase
          .from(
            "solicitudes_usuario"
          )
          .insert([
            {
              nombre:
                registro.nombre,

              correo:
                registro.correo,

              telefono:
                registro.telefono,

              password:
                registro.password,

              estatus:
                "PENDIENTE",
            },
          ]);

      if (error) {

        alert(error.message);

        return;

      }

      alert(
        "Solicitud enviada. Un administrador deberá aprobarla."
      );

      setRegistro({
        nombre: "",
        correo: "",
        telefono: "",
        password: "",
      });

      setMostrarRegistro(false);

    };

  return (

    <div
      className="
        min-h-screen
        flex
        items-center
        justify-center
        bg-gray-100
      "
    >

      <div
        className="
          bg-white
          rounded-xl
          shadow-lg
          p-8
          w-full
          max-w-md
        "
      >

        <div className="text-center mb-6">

          <h1
            className="
              text-3xl
              font-bold
            "
          >
            Sistema RH
          </h1>

          <p
            className="
              text-gray-500
              mt-2
            "
          >
            Iniciar sesión
          </p>

        </div>

        <form
          onSubmit={iniciarSesion}
          className="space-y-4"
        >

          <input
            type="email"
            value={correo}
            onChange={(e) =>
              setCorreo(
                e.target.value
              )
            }
            className="
              w-full
              border
              rounded
              p-3
            "
            placeholder="correo@empresa.com"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            className="
              w-full
              border
              rounded
              p-3
            "
            placeholder="********"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="
              w-full
              bg-blue-600
              text-white
              py-3
              rounded
            "
          >

            {loading
              ? "Ingresando..."
              : "Ingresar"}

          </button>

        </form>

        <hr className="my-6" />

        <button
          onClick={() =>
            setMostrarRegistro(true)
          }
          className="
            w-full
            bg-green-600
            text-white
            py-3
            rounded
          "
        >
          Solicitar Registro
        </button>

      </div>

      {mostrarRegistro && (

        <div
          className="
            fixed
            inset-0
            bg-black/50
            flex
            items-center
            justify-center
            z-50
          "
        >

          <div
            className="
              bg-white
              rounded-lg
              p-6
              w-full
              max-w-md
            "
          >

            <h2
              className="
                text-xl
                font-bold
                mb-4
              "
            >
              Solicitud de Registro
            </h2>

            <div className="space-y-3">

              <input
                type="text"
                placeholder="Nombre completo"
                value={registro.nombre}
                onChange={(e) =>
                  setRegistro({
                    ...registro,
                    nombre:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  border
                  rounded
                  p-2
                "
              />

              <input
                type="email"
                placeholder="Correo"
                value={registro.correo}
                onChange={(e) =>
                  setRegistro({
                    ...registro,
                    correo:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  border
                  rounded
                  p-2
                "
              />

              <input
                type="text"
                placeholder="Teléfono"
                value={registro.telefono}
                onChange={(e) =>
                  setRegistro({
                    ...registro,
                    telefono:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  border
                  rounded
                  p-2
                "
              />

              <input
                type="password"
                placeholder="Contraseña"
                value={registro.password}
                onChange={(e) =>
                  setRegistro({
                    ...registro,
                    password:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  border
                  rounded
                  p-2
                "
              />

            </div>

            <div className="flex gap-3 mt-6">

              <button
                onClick={
                  solicitarRegistro
                }
                className="
                  flex-1
                  bg-green-600
                  text-white
                  py-2
                  rounded
                "
              >
                Enviar
              </button>

              <button
                onClick={() =>
                  setMostrarRegistro(false)
                }
                className="
                  flex-1
                  bg-gray-600
                  text-white
                  py-2
                  rounded
                "
              >
                Cancelar
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}