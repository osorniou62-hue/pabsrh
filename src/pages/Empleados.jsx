import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Empleados() {

  const [empleados, setEmpleados] =
    useState([]);

    const [historial, setHistorial] =
  useState([]);

  const [departamentos, setDepartamentos] =
    useState([]);

  const [puestos, setPuestos] =
    useState([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [estatus, setEstatus] =
    useState("ACTIVOS");

  const [departamentoFiltro,
    setDepartamentoFiltro] =
    useState("");

  const [puestoFiltro,
    setPuestoFiltro] =
    useState("");

  useEffect(() => {

    cargarEmpleados();
    cargarDepartamentos();
    cargarPuestos();

  }, []);

  const cargarEmpleados =
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
          .order(
            "nombre_completo"
          );

      if (error) {

        console.error(error);

        return;

      }

      setEmpleados(data || []);

    };

  const cargarDepartamentos =
    async () => {

      const { data } =
        await supabase
          .from("departamentos")
          .select("*")
          .eq("activo", true)
          .order("nombre");

      setDepartamentos(data || []);

    };

  const cargarPuestos =
    async () => {

      const { data } =
        await supabase
          .from("puestos")
          .select("*")
          .eq("activo", true)
          .order("nombre");

      setPuestos(data || []);

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

      await supabase
        .from("historial_empleado")
        .insert([
          {
            empleado_id:
              empleado.id,
            movimiento:
              "Baja de empleado",
          },
        ]);

      await cargarEmpleados();

      alert(
        "Empleado dado de baja"
      );

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

      await supabase
        .from("historial_empleado")
        .insert([
          {
            empleado_id:
              empleado.id,
            movimiento:
              "Reactivación",
          },
        ]);

      await cargarEmpleados();

      alert(
        "Empleado reactivado"
      );

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
            ?.toLowerCase()
            .includes(texto);

        const coincideDepartamento =

          !departamentoFiltro ||

          empleado.departamento_id ==
            departamentoFiltro;

        const coincidePuesto =

          !puestoFiltro ||

          empleado.puesto_id ==
            puestoFiltro;

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

        return (

          coincideBusqueda &&
          coincideDepartamento &&
          coincidePuesto &&
          coincideEstatus

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

    <div className="max-w-7xl mx-auto p-6">

      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          👥 Empleados
        </h1>

        <div className="flex gap-3">

          <Link
            to="/dashboard"
            className="
              bg-blue-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Dashboard
          </Link>

          <Link
            to="/empleados/nuevo"
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            + Nuevo Empleado
          </Link>

        </div>

      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">

        <div className="bg-green-100 p-4 rounded shadow">

          <div className="text-sm">
            Activos
          </div>

          <div className="text-3xl font-bold">
            {activos}
          </div>

        </div>

        <div className="bg-red-100 p-4 rounded shadow">

          <div className="text-sm">
            Bajas
          </div>

          <div className="text-3xl font-bold">
            {bajas}
          </div>

        </div>

        <div className="bg-blue-100 p-4 rounded shadow">

          <div className="text-sm">
            Total
          </div>

          <div className="text-3xl font-bold">
            {total}
          </div>

        </div>

      </div>

      <div className="bg-white shadow rounded p-4 mb-6">

        <div className="grid md:grid-cols-4 gap-4">

          <input
            type="text"
            placeholder="Buscar empleado..."
            value={busqueda}
            onChange={(e) =>
              setBusqueda(
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <select
            value={departamentoFiltro}
            onChange={(e) =>
              setDepartamentoFiltro(
                e.target.value
              )
            }
            className="border p-2 rounded"
          >

            <option value="">
              Todos los departamentos
            </option>

            {departamentos.map(
              (d) => (

                <option
                  key={d.id}
                  value={d.id}
                >
                  {d.nombre}
                </option>

              )
            )}

          </select>

          <select
            value={puestoFiltro}
            onChange={(e) =>
              setPuestoFiltro(
                e.target.value
              )
            }
            className="border p-2 rounded"
          >

            <option value="">
              Todos los puestos
            </option>

            {puestos.map(
              (p) => (

                <option
                  key={p.id}
                  value={p.id}
                >
                  {p.nombre}
                </option>

              )
            )}

          </select>

          <select
            value={estatus}
            onChange={(e) =>
              setEstatus(
                e.target.value
              )
            }
            className="border p-2 rounded"
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

        </div>

      </div>

      <div className="mb-4 text-sm text-gray-600">

        Mostrando
        {" "}
        <strong>
          {empleadosFiltrados.length}
        </strong>
        {" "}
        empleados

      </div>

      <div className="bg-white shadow rounded p-4 overflow-x-auto">

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2">No.</th>
              <th className="border p-2">Nombre</th>
              <th className="border p-2">Departamento</th>
              <th className="border p-2">Puesto</th>
              <th className="border p-2">Ingreso</th>
              <th className="border p-2">Antigüedad</th>
              <th className="border p-2">Estatus</th>
              <th className="border p-2">Acciones</th>

            </tr>

          </thead>

          <tbody>

            {empleadosFiltrados.map(
              (empleado) => (

                <tr key={empleado.id}>

                  <td className="border p-2 text-center">
                    {empleado.numero_empleado}
                  </td>

                  <td className="border p-2">
                    {empleado.nombre_completo}
                  </td>

                  <td className="border p-2">
                    {empleado.departamentos?.nombre}
                  </td>

                  <td className="border p-2">
                    {empleado.puestos?.nombre}
                  </td>

                  <td className="border p-2 text-center">
                    {empleado.fecha_ingreso}
                  </td>

                  <td className="border p-2 text-center">
                    {calcularAntiguedad(
                      empleado.fecha_ingreso
                    )}
                  </td>

                  <td className="border p-2 text-center">

                    {empleado.activo
                      ? "✅ Activo"
                      : "🚫 Baja"}

                  </td>

                  <td className="border p-2">

                    <div className="flex gap-2">

                      <Link
                        to={`/empleados/detalle/${empleado.id}`}
                        className="
                          bg-blue-600
                          text-white
                          px-3
                          py-1
                          rounded
                        "
                      >
                        Ver
                      </Link>

                      <Link
                        to={`/empleados/${empleado.id}`}
                        className="
                          bg-yellow-500
                          text-white
                          px-3
                          py-1
                          rounded
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
                            text-white
                            px-3
                            py-1
                            rounded
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
                            text-white
                            px-3
                            py-1
                            rounded
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

  );

}