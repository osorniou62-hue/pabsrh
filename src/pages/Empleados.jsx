import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Empleados() {

  const [empleados, setEmpleados] =
    useState([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [estatus, setEstatus] =
    useState("ACTIVOS");

  const [
  departamentoFiltro,
  setDepartamentoFiltro
] = useState("TODOS");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    cargarEmpleados();

  }, []);

  const cargarEmpleados =
    async () => {

      setLoading(true);

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
          .order(
            "nombre_completo"
          );

      if (error) {

        console.error(error);

      } else {

        setEmpleados(data || []);

      }

      setLoading(false);

    };

  const darDeBaja =
    async (empleado) => {

      const confirmar =
        window.confirm(
          `¿Deseas dar de baja a ${empleado.nombre_completo}?`
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("empleados")
          .update({
            activo: false,
            fecha_baja:
              new Date()
                .toISOString()
                .split("T")[0],
          })
          .eq(
            "id",
            empleado.id
          );

      if (error) {

        alert(error.message);

        return;

      }

      await cargarEmpleados();

    };

  const reactivarEmpleado =
    async (empleado) => {

      const { error } =
        await supabase
          .from("empleados")
          .update({
            activo: true,
            fecha_baja: null,
          })
          .eq(
            "id",
            empleado.id
          );

      if (error) {

        alert(error.message);

        return;

      }

      await cargarEmpleados();

    };
  const departamentos =
  [
    "TODOS",

    ...new Set(
      empleados
        .map(
          (e) =>
            e.departamentos
              ?.nombre
        )
        .filter(Boolean)
    ),
  ].sort();

  const empleadosFiltrados =
  empleados.filter(
    (empleado) => {

      const texto =
        busqueda.toLowerCase();

      const coincideBusqueda =

        empleado.nombre_completo
          ?.toLowerCase()
          .includes(texto)

        ||

        empleado.numero_empleado
          ?.toString()
          .toLowerCase()
          .includes(texto);

      let coincideEstatus =
        true;

      if (
        estatus === "ACTIVOS"
      ) {

        coincideEstatus =
          empleado.activo;

      }

      if (
        estatus === "BAJAS"
      ) {

        coincideEstatus =
          !empleado.activo;

      }

      const coincideDepartamento =

        departamentoFiltro ===
          "TODOS"

        ||

        empleado.departamentos
          ?.nombre ===
          departamentoFiltro;

      return (

        coincideBusqueda &&

        coincideEstatus &&

        coincideDepartamento

      );

    }
  );

  const total =
    empleados.length;

  const activos =
    empleados.filter(
      (e) => e.activo
    ).length;

  const bajas =
    empleados.filter(
      (e) => !e.activo
    ).length;

  return (

    <Layout>

      <div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">

          <div>

            <h1 className="text-4xl font-bold">
              👥 Empleados
            </h1>

            <p className="text-gray-500 mt-2">
              Administración de empleados
            </p>

          </div>

          <Link
            to="/empleados/nuevo"
            className="
              mt-4
              md:mt-0
              bg-green-600
              hover:bg-green-700
              text-white
              px-5
              py-3
              rounded-xl
              transition
            "
          >
            + Nuevo Empleado
          </Link>

        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">

          <KpiCard
            titulo="Activos"
            valor={activos}
            icono="✅"
            color="text-green-600"
          />

          <KpiCard
            titulo="Bajas"
            valor={bajas}
            icono="🚫"
            color="text-red-600"
          />

          <KpiCard
            titulo="Total"
            valor={total}
            icono="👥"
            color="text-blue-600"
          />

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-6
            mb-6
          "
        >

          <div className="grid md:grid-cols-3 gap-4">

            <input
              type="text"
              placeholder="🔍 Buscar empleado..."
              value={busqueda}
              onChange={(e) =>
                setBusqueda(
                  e.target.value
                )
              }
              className="
                border
                rounded-xl
                p-3
              "
            />

            <select
              value={estatus}
              onChange={(e) =>
                setEstatus(
                  e.target.value
                )
              }
              className="
                border
                rounded-xl
                p-3
              "
            >

              <option value="ACTIVOS">
                Activos
              </option>

              <option value="BAJAS">
                Bajas
              </option>

              <option value="TODOS">
                Todos
              </option>

            </select>

          <select
  value={
    departamentoFiltro
  }
  onChange={(e) =>
    setDepartamentoFiltro(
      e.target.value
    )
  }
  className="
    border
    rounded-xl
    p-3
  "
>
  {departamentos.map(
    (dep) => (
      <option
        key={dep}
        value={dep}
      >
        {dep}
      </option>
    )
  )}
</select>

          </div>

        </div>

        <div className="mb-4 text-gray-600">

          Mostrando

          {" "}

          <strong>
            {empleadosFiltrados.length}
          </strong>

          {" "}

          empleados

        </div>

        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            overflow-x-auto
          "
        >

          <table className="w-full">

            <thead className="bg-slate-100">

              <tr>

                <th className="p-4 text-left">
                  No.
                </th>

                <th className="p-4 text-left">
                  Nombre
                </th>

                <th className="p-4 text-left">
                  Departamento
                </th>

                <th className="p-4 text-left">
                  Puesto
                </th>

                <th className="p-4 text-center">
                  Estatus
                </th>

                <th className="p-4 text-center">
                  Acciones
                </th>

              </tr>

            </thead>

            <tbody>

              {loading && (

                <tr>

                  <td
                    colSpan="6"
                    className="
                      p-6
                      text-center
                    "
                  >
                    Cargando...
                  </td>

                </tr>

              )}

              {!loading &&
                empleadosFiltrados.map(
                  (empleado) => (

                    <tr
                      key={empleado.id}
                      className="
                        border-t
                        hover:bg-slate-50
                        transition
                      "
                    >

                      <td className="p-4">
                        {
                          empleado.numero_empleado
                        }
                      </td>

                      <td className="p-4 font-medium">
                        {
                          empleado.nombre_completo
                        }
                      </td>

                      <td className="p-4">
                        {
                          empleado.departamentos
                            ?.nombre
                        }
                      </td>

                      <td className="p-4">
                        {
                          empleado.puestos
                            ?.nombre
                        }
                      </td>

                      <td className="p-4 text-center">

                        {empleado.activo ? (

                          <span
                            className="
                              bg-green-100
                              text-green-700
                              px-3
                              py-1
                              rounded-full
                              text-sm
                              font-medium
                            "
                          >
                            Activo
                          </span>

                        ) : (

                          <span
                            className="
                              bg-red-100
                              text-red-700
                              px-3
                              py-1
                              rounded-full
                              text-sm
                              font-medium
                            "
                          >
                            Baja
                          </span>

                        )}

                      </td>

                      <td className="p-4">

                        <div className="flex gap-2 justify-center">

                          <Link
                            to={`/empleados/detalle/${empleado.id}`}
                            className="
                              bg-blue-600
                              hover:bg-blue-700
                              text-white
                              px-3
                              py-2
                              rounded-xl
                            "
                          >
                            Ver
                          </Link>

                          <Link
                            to={`/empleados/${empleado.id}`}
                            className="
                              bg-amber-500
                              hover:bg-amber-600
                              text-white
                              px-3
                              py-2
                              rounded-xl
                            "
                          >
                            Editar
                          </Link>

                          {empleado.activo ? (

                            <button
                              onClick={() =>
                                darDeBaja(
                                  empleado
                                )
                              }
                              className="
                                bg-red-600
                                hover:bg-red-700
                                text-white
                                px-3
                                py-2
                                rounded-xl
                              "
                            >
                              Baja
                            </button>

                          ) : (

                            <button
                              onClick={() =>
                                reactivarEmpleado(
                                  empleado
                                )
                              }
                              className="
                                bg-green-600
                                hover:bg-green-700
                                text-white
                                px-3
                                py-2
                                rounded-xl
                              "
                            >
                              Reactivar
                            </button>

                          )}

                        </div>

                      </td>

                    </tr>

                  )
                )}

            </tbody>

          </table>

        </div>

      </div>

    </Layout>

  );

}