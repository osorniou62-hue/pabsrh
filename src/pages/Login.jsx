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

        const {
          error: crearError,
        } = await supabase
          .from("profiles")
          .insert([
            {
              id: usuario.id,
              nombre:
                usuario.email,
              rol: "ADMIN",
              activo: true,
            },
          ]);

        if (crearError) {

          console.error(
            crearError
          );

          alert(
            crearError.message
          );

          await supabase.auth.signOut();

          setLoading(false);

          return;

        }

        navigate("/dashboard");

        return;

      }

      setLoading(false);

      if (!perfil.activo) {

        alert(
          "Usuario inactivo"
        );

        await supabase.auth.signOut();

        return;

      }

      navigate("/dashboard");

    };

  const registrarUsuario =
    async () => {

      if (
        !correo ||
        !password
      ) {

        alert(
          "Captura correo y contraseña"
        );

        return;

      }

      setLoading(true);

      const {
        data,
        error,
      } = await supabase.auth.signUp({
        email: correo,
        password,
      });

      if (error) {

        alert(error.message);

        setLoading(false);

        return;

      }

      const usuario =
        data?.user;

      if (usuario) {

        await supabase
          .from("profiles")
          .insert([
            {
              id: usuario.id,
              nombre: correo,
              rol: "ADMIN",
              activo: true,
            },
          ]);

      }

      alert(
        "Usuario creado correctamente"
      );

      setLoading(false);

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
          onClick={
            registrarUsuario
          }
          disabled={loading}
          className="
            w-full
            bg-green-600
            text-white
            py-3
            rounded
          "
        >
          Crear Usuario
        </button>

      </div>

    </div>

  );

}