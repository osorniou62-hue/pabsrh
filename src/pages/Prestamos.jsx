import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Prestamos() {

  const [empleados, setEmpleados] =
    useState([]);

  const [prestamos, setPrestamos] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      importe_total: "",
      descuento_periodo: "",
      observaciones: "",
    });

  useEffect(() => {

    cargarEmpleados();
    cargarPrestamos();

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

  const cargarPrestamos =
    async () => {

      const { data } =
        await supabase
          .from("prestamos")
          .select(`
            *,
            empleados (
              nombre_completo,
              numero_empleado
            )
          `)
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

      setPrestamos(data || []);

    };

  const guardarPrestamo =
    async () => {

      if (
        !form.empleado_id ||
        !form.importe_total ||
        !form.descuento_periodo
      ) {

        alert(
          "Completa los campos requeridos"
        );

        return;

      }

      const { error } =
        await supabase
          .from("prestamos")
          .insert([
            {
              empleado_id:
                Number(
                  form.empleado_id
                ),

              importe_total:
                Number(
                  form.importe_total
                ),

              saldo_actual:
                Number(
                  form.importe_total
                ),

              descuento_periodo:
                Number(
                  form.descuento_periodo
                ),

              observaciones:
                form.observaciones,

              estatus:
                "ACTIVO",
            },
          ]);

      if (error) {

        alert(error.message);

        return;

      }

      setForm({
        empleado_id: "",
        importe_total: "",
        descuento_periodo: "",
        observaciones: "",
      });

      await cargarPrestamos();

    };

  const liquidarPrestamo =
    async (prestamo) => {

      const confirmar =
        window.confirm(
          "¿Deseas liquidar este préstamo?"
        );

      if (!confirmar) return;

      const { error } =
        await supabase
          .from("prestamos")
          .update({
            estatus:
              "LIQUIDADO",
            saldo_actual: 0,
          })
          .eq(
            "id",
            prestamo.id
          );

      if (error) {

        alert(error.message);

        return;

      }

      await cargarPrestamos();

    };

  const activos =
    prestamos.filter(
      (p) =>
        p.estatus ===
        "ACTIVO"
    ).length;

  const liquidados =
    prestamos.filter(
      (p) =>
        p.estatus ===
        "LIQUIDADO"
    ).length;

  const totalPrestado =
    prestamos.reduce(
      (a, b) =>
        a +
        Number(
          b.importe_total || 0
        ),
      0
    );

  const saldoPendiente =
    prestamos.reduce(
      (a, b) =>
        a +
        Number(
          b.saldo_actual || 0
        ),
      0
    );

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            💳 Préstamos
          </h1>

          <p className="text-gray-500 mt-2">
            Administración de préstamos a empleados
          </p>

        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">

          <KpiCard
            titulo="Activos"
            valor={activos}
            icono="💳"
            color="text-blue-600"
          />

          <KpiCard
            titulo="Liquidados"
            valor={liquidados}
            icono="✅"
            color="text-green-600"
          />

          <KpiCard
            titulo="Total Prestado"
            valor={`$${totalPrestado.toLocaleString("es-MX")}`}
            icono="💰"
            color="text-emerald-600"
          />

          <KpiCard
            titulo="Saldo Pendiente"
            valor={`$${saldoPendiente.toLocaleString("es-MX")}`}
            icono="📉"
            color="text-red-600"
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
            Nuevo Préstamo
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
              step="0.01"
              placeholder="Importe Total"
              value={form.importe_total}
              onChange={(e) =>
                setForm({
                  ...form,
                  importe_total:
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
              type="number"
              step="0.01"
              placeholder="Descuento por período"
              value={
                form.descuento_periodo
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  descuento_periodo:
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
              value={
                form.observaciones
              }
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
              "
            />

          </div>

          <button
            onClick={
              guardarPrestamo
            }
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
            Guardar Préstamo
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

                <th className="p-4 text-right">
                  Monto
                </th>

                <th className="p-4 text-right">
                  Saldo
                </th>

                <th className="p-4 text-right">
                  Descuento
                </th>

                <th className="p-4 text-center">
                  Estado
                </th>

                <th className="p-4 text-center">
                  Acción
                </th>

              </tr>

            </thead>

            <tbody>

              {prestamos.map(
                (prestamo) => (

                  <tr
                    key={prestamo.id}
                    className="
                      border-t
                      hover:bg-slate-50
                    "
                  >

                    <td className="p-4">

                      {
                        prestamo.empleados
                          ?.nombre_completo
                      }

                    </td>

                    <td className="p-4 text-right">

                      $
                      {Number(
                        prestamo.importe_total
                      ).toFixed(2)}

                    </td>

                    <td className="p-4 text-right">

                      $
                      {Number(
                        prestamo.saldo_actual
                      ).toFixed(2)}

                    </td>

                    <td className="p-4 text-right">

                      $
                      {Number(
                        prestamo.descuento_periodo
                      ).toFixed(2)}

                    </td>

                    <td className="p-4 text-center">

                      {prestamo.estatus ===
                      "ACTIVO" ? (

                        <span
                          className="
                            bg-blue-100
                            text-blue-700
                            px-3
                            py-1
                            rounded-full
                            text-sm
                            font-medium
                          "
                        >
                          ACTIVO
                        </span>

                      ) : (

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
                          LIQUIDADO
                        </span>

                      )}

                    </td>

                    <td className="p-4 text-center">

                      {prestamo.estatus ===
                        "ACTIVO" && (

                        <button
                          onClick={() =>
                            liquidarPrestamo(
                              prestamo
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
                          Liquidar
                        </button>

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