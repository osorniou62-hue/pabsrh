import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Vacaciones() {

  const [empleados, setEmpleados] =
    useState([]);

  const [vacaciones, setVacaciones] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      fecha_inicio: "",
      fecha_fin: "",
      dias: "",
      observaciones: "",
    });

  useEffect(() => {

    cargarEmpleados();
    cargarVacaciones();

  }, []);

  const cargarEmpleados =
    async () => {

      const { data } =
        await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true)
          .order("nombre_completo");

      setEmpleados(data || []);

    };

  const cargarVacaciones =
    async () => {

      const { data } =
        await supabase
          .from("vacaciones")
          .select(`
            *,
            empleados (
              nombre_completo
            )
          `)
          .order(
            "fecha_inicio",
            {
              ascending: false,
            }
          );

      setVacaciones(data || []);

    };

  const guardar =
    async () => {

      if (
        !form.empleado_id ||
        !form.fecha_inicio ||
        !form.fecha_fin ||
        !form.dias
      ) {

        alert(
          "Completa los campos requeridos"
        );

        return;

      }

      const { error } =
        await supabase
          .from("vacaciones")
          .insert([
            {
              empleado_id:
                Number(
                  form.empleado_id
                ),
              fecha_inicio:
                form.fecha_inicio,
              fecha_fin:
                form.fecha_fin,
              dias:
                Number(form.dias),
              observaciones:
                form.observaciones,
              estatus:
                "PENDIENTE",
            },
          ]);

      if (error) {

        alert(error.message);

        return;

      }

      setForm({
        empleado_id: "",
        fecha_inicio: "",
        fecha_fin: "",
        dias: "",
        observaciones: "",
      });

      await cargarVacaciones();

    };

  const totalSolicitudes =
    vacaciones.length;

  const pendientes =
    vacaciones.filter(
      (v) =>
        v.estatus ===
        "PENDIENTE"
    ).length;

  const autorizadas =
    vacaciones.filter(
      (v) =>
        v.estatus ===
        "AUTORIZADA"
    ).length;

  const diasSolicitados =
    vacaciones.reduce(
      (a, b) =>
        a +
        Number(
          b.dias || 0
        ),
      0
    );

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            🏖 Vacaciones
          </h1>

          <p className="text-gray-500 mt-2">
            Gestión de vacaciones de empleados
          </p>

        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">

          <KpiCard
            titulo="Solicitudes"
            valor={totalSolicitudes}
            icono="📄"
            color="text-blue-600"
          />

          <KpiCard
            titulo="Pendientes"
            valor={pendientes}
            icono="⏳"
            color="text-orange-600"
          />

          <KpiCard
            titulo="Autorizadas"
            valor={autorizadas}
            icono="✅"
            color="text-green-600"
          />

          <KpiCard
            titulo="Días Solicitados"
            valor={diasSolicitados}
            icono="📅"
            color="text-purple-600"
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

          <h2 className="text-xl font-bold mb-4">
            Nueva Solicitud
          </h2>

          <div className="grid md:grid-cols-2 gap-4">

            <select
              value={form.empleado_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  empleado_id:
                    e.target.value,
                })
              }
              className="
                border
                rounded-xl
                p-3
              "
            >

              <option value="">
                Seleccionar empleado
              </option>

              {empleados.map(
                (empleado) => (

                  <option
                    key={empleado.id}
                    value={empleado.id}
                  >
                    {empleado.nombre_completo}
                  </option>

                )
              )}

            </select>

            <input
              type="number"
              placeholder="Días"
              value={form.dias}
              onChange={(e) =>
                setForm({
                  ...form,
                  dias:
                    e.target.value,
                })
              }
              className="
                border
                rounded-xl
                p-3
              "
            />

            <input
              type="date"
              value={form.fecha_inicio}
              onChange={(e) =>
                setForm({
                  ...form,
                  fecha_inicio:
                    e.target.value,
                })
              }
              className="
                border
                rounded-xl
                p-3
              "
            />

            <input
              type="date"
              value={form.fecha_fin}
              onChange={(e) =>
                setForm({
                  ...form,
                  fecha_fin:
                    e.target.value,
                })
              }
              className="
                border
                rounded-xl
                p-3
              "
            />

            <textarea
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) =>
                setForm({
                  ...form,
                  observaciones:
                    e.target.value,
                })
              }
              className="
                border
                rounded-xl
                p-3
                md:col-span-2
              "
            />

          </div>

          <button
            onClick={guardar}
            className="
              mt-4
              bg-green-600
              hover:bg-green-700
              text-white
              px-5
              py-3
              rounded-xl
            "
          >
            Guardar Solicitud
          </button>

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
                  Empleado
                </th>

                <th className="p-4 text-center">
                  Inicio
                </th>

                <th className="p-4 text-center">
                  Fin
                </th>

                <th className="p-4 text-center">
                  Días
                </th>

                <th className="p-4 text-center">
                  Estado
                </th>

              </tr>

            </thead>

            <tbody>

              {vacaciones.map(
                (vacacion) => (

                  <tr
                    key={vacacion.id}
                    className="
                      border-t
                      hover:bg-slate-50
                    "
                  >

                    <td className="p-4">

                      {
                        vacacion.empleados
                          ?.nombre_completo
                      }

                    </td>

                    <td className="p-4 text-center">
                      {vacacion.fecha_inicio}
                    </td>

                    <td className="p-4 text-center">
                      {vacacion.fecha_fin}
                    </td>

                    <td className="p-4 text-center">
                      {vacacion.dias}
                    </td>

                    <td className="p-4 text-center">

                      {vacacion.estatus ===
                      "AUTORIZADA" ? (

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
                          AUTORIZADA
                        </span>

                      ) : (

                        <span
                          className="
                            bg-orange-100
                            text-orange-700
                            px-3
                            py-1
                            rounded-full
                            text-sm
                            font-medium
                          "
                        >
                          PENDIENTE
                        </span>

                      )}

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