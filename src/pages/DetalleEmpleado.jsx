import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

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

      if (!fechaIngreso) {

        return "-";

      }

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

      <div className="p-6">

        Cargando información...

      </div>

    );

  }

  if (!empleado) {

    return (

      <div className="p-6">

        No se encontró el empleado.

      </div>

    );

  }

  return (

    <div className="max-w-6xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          Detalle del Empleado
        </h1>

        <div className="flex gap-3">

          <button
            onClick={() =>
              navigate(
                `/empleados/${id}`
              )
            }
            className="
              bg-yellow-500
              text-white
              px-4
              py-2
              rounded
            "
          >
            Editar
          </button>

          <button
            onClick={() =>
              navigate(
                "/empleados"
              )
            }
            className="
              bg-blue-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Regresar
          </button>

        </div>

      </div>

      <div
        className="
          bg-white
          rounded-lg
          shadow
          p-6
          mb-6
        "
      >

        <div className="flex justify-between items-start">

          <div>

            <h2
              className="
                text-2xl
                font-bold
              "
            >
              {empleado.nombre_completo}
            </h2>

            <p className="text-gray-500">

              Empleado #
              {" "}
              {empleado.numero_empleado}

            </p>

          </div>

          <div>

            {empleado.activo ? (

              <span
                className="
                  bg-green-100
                  text-green-700
                  px-4
                  py-2
                  rounded
                  font-bold
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
                  rounded
                  font-bold
                "
              >
                🚫 Baja
              </span>

            )}

          </div>

        </div>

      </div>

      <div className="grid md:grid-cols-2 gap-6">

        <div
          className="
            bg-white
            rounded-lg
            shadow
            p-6
          "
        >

          <h3
            className="
              text-xl
              font-bold
              mb-4
            "
          >
            Datos Generales
          </h3>

          <div className="space-y-3">

            <p>
              <strong>Nombre:</strong>
              {" "}
              {empleado.nombre_completo}
            </p>

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
            rounded-lg
            shadow
            p-6
          "
        >

          <h3
            className="
              text-xl
              font-bold
              mb-4
            "
          >
            Información Laboral
          </h3>

          <div className="space-y-3">

            <p>
              <strong>Departamento:</strong>
              {" "}
              {empleado.departamentos?.nombre || "-"}
            </p>

            <p>
              <strong>Puesto:</strong>
              {" "}
              {empleado.puestos?.nombre || "-"}
            </p>

            <p>
              <strong>Fecha Ingreso:</strong>
              {" "}
              {empleado.fecha_ingreso || "-"}
            </p>

            <p>
              <strong>Antigüedad:</strong>
              {" "}
              {calcularAntiguedad(
                empleado.fecha_ingreso
              )}
            </p>

            <p>
              <strong>Fecha Baja:</strong>
              {" "}
              {empleado.fecha_baja || "-"}
            </p>

          </div>

        </div>

      </div>

      <div
        className="
          bg-white
          rounded-lg
          shadow
          p-6
          mt-6
        "
      >

        <h3
          className="
            text-xl
            font-bold
            mb-4
          "
        >
          📜 Historial
        </h3>

        {historial.length === 0 ? (

          <p className="text-gray-500">
            Sin movimientos registrados
          </p>

        ) : (

          <div className="space-y-3">

            {historial.map(
              (movimiento) => (

                <div
                  key={movimiento.id}
                  className="
                    border-b
                    pb-3
                  "
                >

                  <div className="font-semibold">

                    {movimiento.movimiento}

                  </div>

                  <div className="text-sm text-gray-500">

                    {new Date(
                      movimiento.fecha
                    ).toLocaleString(
                      "es-MX"
                    )}

                  </div>

                  {movimiento.usuario && (

                    <div className="text-xs text-gray-400">

                      Usuario:
                      {" "}
                      {movimiento.usuario}

                    </div>

                  )}

                </div>

              )
            )}

          </div>

        )}

      </div>

      <div
        className="
          bg-white
          rounded-lg
          shadow
          p-6
          mt-6
        "
      >

        <h3
          className="
            text-xl
            font-bold
            mb-4
          "
        >
          Módulos Próximamente
        </h3>

        <div className="grid md:grid-cols-4 gap-4">

          <div className="border p-4 rounded text-center">
            💰 Nómina
          </div>

          <div className="border p-4 rounded text-center">
            🏖 Vacaciones
          </div>

          <div className="border p-4 rounded text-center">
            💳 Préstamos
          </div>

          <div className="border p-4 rounded text-center">
            📋 Incidencias
          </div>

        </div>

      </div>

    </div>

  );

}