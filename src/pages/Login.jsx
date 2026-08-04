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

        setLoading(false);

        alert(
          "Correo o contraseña incorrectos"
        );

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

      setLoading(false);

      if (perfilError) {

        console.error(
          perfilError
        );

        alert(
          "El usuario no tiene perfil asignado"
        );

        await supabase.auth.signOut();

        return;

      }

      if (!perfil.activo) {

        alert(
          "Usuario inactivo"
        );

        await supabase.auth.signOut();

        return;

      }

      switch (
        perfil.rol
      ) {

        case "ADMIN":

          navigate(
            "/dashboard"
          );

          break;

        case "RH":

          navigate(
            "/dashboard"
          );

          break;

        case "CONSULTA":

          navigate(
            "/dashboard"
          );

          break;

        default:

          alert(
            "Rol no configurado"
          );

          await supabase.auth.signOut();

      }

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
          onSubmit={
            iniciarSesion
          }
          className="space-y-4"
        >

          <div>

            <label
              className="
                block
                mb-1
                font-medium
              "
            >
              Correo
            </label>

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

          </div>

          <div>

            <label
              className="
                block
                mb-1
                font-medium
              "
            >
              Contraseña
            </label>

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

          </div>

          <button
            type="submit"
            disabled={loading}
            className="
              w-full
              bg-blue-600
              text-white
              py-3
              rounded
              hover:bg-blue-700
              disabled:bg-gray-400
            "
          >

            {loading
              ? "Ingresando..."
              : "Ingresar"}

          </button>

        </form>

      </div>

    </div>

  );

}