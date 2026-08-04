import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";

export default function DetalleEmpleado() {

  const { id } = useParams();

  const navigate = useNavigate();

  const [empleado, setEmpleado] =
    useState(null);

  const [historial, setHistorial] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    cargarDatos();

  }, [id]);

  const cargarDatos =
    async () => {

      setLoading(true);

      await Promise.all([
        cargarEmpleado(),
        cargarHistorial(),
      ]);

      setLoading(false);

    };

  const cargarEmpleado =
    async () => {

      const { data, error } =
        await supabase
          .from("empleados")
          .select(`
            *,
            departamentos (
              nombre
            ),
            puestos (
              nombre
            )
          `)
          .eq("id", id)
          .single();

      if (error) {

        console.error(error);

        return;

      }

      setEmpleado(data);

    };

  const cargarHistorial =
    async () => {

      const { data, error } =
        await supabase
          .from("historial_empleado")
          .select("*")
          .eq(
            "empleado_id",
            id
          )
          .order(
            "fecha",
            {
              ascending: false,
            }
          );

      if (error) {

        console.error(error);

        return;

      }

      setHistorial(data || []);

    };

  const calcularAntiguedad =
    (fechaIngreso) => {

      if (!fechaIngreso)
        return "-";

      const ingreso =
        new Date(fechaIngreso);

      const hoy =
        new Date();

      let años =
        hoy.getFullYear() -
        ingreso.getFullYear();

      let meses =
        hoy.getMonth() -
        ingreso.getMonth();

      if (meses < 0) {

        años--;
        meses += 12;

      }

      return `${años} años ${meses} meses`;

    };

  if (loading) {

    return (

      <Layout>

        <div className="p-8">
          Cargando información...
        </div>

      </Layout>

    );

  }

  if (!empleado) {

    return (

      <Layout>

        <div className="p-8">
          No se encontró el empleado.
        </div>

      </Layout>

    );

  }

  return (

    <Layout>

      <div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">

          <div>

            <h1 className="text-4xl font-bold">
              👤 Expediente del Empleado
            </h1>

            <p className="text-gray-500 mt-2">
              Información general e historial laboral
            </p>

          </div>

          <div className="flex gap-3 mt-4 md:mt-0">

            <button
              onClick={() =>
                navigate(
                  `/empleados/${id}`
                )
              }
              className="
                bg-amber-500
                hover:bg-amber-600
                text-white
                px-4
                py-2
                rounded-xl
              "
            >
              Editar
            </button>

            <button
              onClick={() =>
                navigate("/empleados")
              }
              className="
                bg-blue-600
                hover:bg-blue-700
                text-white
                px-4
                py-2
                rounded-xl
              "
            >
              Regresar
            </button>

          </div>

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-8
            mb-8
          "
        >

          <div className="flex flex-col md:flex-row justify-between">

            <div>

              <h2 className="text-3xl font-bold">

                {empleado.nombre_completo}

              </h2>

              <p className="text-gray-500 mt-2">

                Empleado #
                {" "}
                {empleado.numero_empleado}

              </p>

            </div>

            <div className="mt-4 md:mt-0">

              {empleado.activo ? (

                <span
                  className="
                    bg-green-100
                    text-green-700
                    px-4
                    py-2
                    rounded-full
                    font-semibold
                  "
                >
                  ✅ Activo
                </span>

              ) : (

                <span
                  className="
                    bg-red-100
                    text-red-700
                    px-4
                    py-2
                    rounded-full
                    font-semibold
                  "
                >
                  🚫 Baja
                </span>

              )}

            </div>

          </div>

        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">

          <div
            className="
              bg-white
              shadow-lg
              rounded-2xl
              p-6
            "
          >

            <div className="text-gray-500">
              Antigüedad
            </div>

            <div className="text-3xl font-bold mt-2">
              {calcularAntiguedad(
                empleado.fecha_ingreso
              )}
            </div>

          </div>

          <div
            className="
              bg-white
              shadow-lg
              rounded-2xl
              p-6
            "
          >

            <div className="text-gray-500">
              Departamento
            </div>

            <div className="text-3xl font-bold mt-2">
              {
                empleado.departamentos
                  ?.nombre
              }
            </div>

          </div>

          <div
            className="
              bg-white
              shadow-lg
              rounded-2xl
              p-6
            "
          >

            <div className="text-gray-500">
              Puesto
            </div>

            <div className="text-3xl font-bold mt-2">
              {
                empleado.puestos
                  ?.nombre
              }
            </div>

          </div>

        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <h3 className="text-xl font-bold mb-4">
              Datos Generales
            </h3>

            <div className="space-y-3">

              <p>
                <strong>CURP:</strong>
                {" "}
                {empleado.curp || "-"}
              </p>

              <p>
                <strong>RFC:</strong>
                {" "}
                {empleado.rfc || "-"}
              </p>

              <p>
                <strong>NSS:</strong>
                {" "}
                {empleado.nss || "-"}
              </p>

            </div>

          </div>

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <h3 className="text-xl font-bold mb-4">
              Información Laboral
            </h3>

            <div className="space-y-3">

              <p>
                <strong>Ingreso:</strong>
                {" "}
                {empleado.fecha_ingreso || "-"}
              </p>

              <p>
                <strong>Baja:</strong>
                {" "}
                {empleado.fecha_baja || "-"}
              </p>

              <p>
                <strong>Antigüedad:</strong>
                {" "}
                {calcularAntiguedad(
                  empleado.fecha_ingreso
                )}
              </p>

            </div>

          </div>

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-6
            mt-8
          "
        >

          <h3 className="text-xl font-bold mb-4">
            📜 Historial
          </h3>

          {historial.length === 0 ? (

            <p className="text-gray-500">
              Sin movimientos registrados
            </p>

          ) : (

            <div className="space-y-4">

              {historial.map(
                (item) => (

                  <div
                    key={item.id}
                    className="
                      border-l-4
                      border-blue-500
                      pl-4
                      py-2
                    "
                  >

                    <div className="font-semibold">

                      {item.movimiento}

                    </div>

                    <div className="text-sm text-gray-500">

                      {new Date(
                        item.fecha
                      ).toLocaleString(
                        "es-MX"
                      )}

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-6
            mt-8
          "
        >

          <h3 className="text-xl font-bold mb-4">
            🚀 Próximos módulos
          </h3>

          <div className="grid md:grid-cols-4 gap-4">

            <div className="bg-slate-50 p-4 rounded-xl text-center">
              💰 Nómina
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-center">
              🏖 Vacaciones
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-center">
              💳 Préstamos
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-center">
              📁 Expediente Digital
            </div>

          </div>

        </div>

      </div>

    </Layout>

  );

}