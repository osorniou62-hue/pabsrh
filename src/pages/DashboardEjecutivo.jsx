import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
];

export default function DashboardEjecutivo() {

  const [kpis, setKpis] =
    useState({
      empleadosActivos: 0,
      empleadosInactivos: 0,
      usuariosActivos: 0,
      departamentos: 0,
      prestamosActivos: 0,
      vacaciones: 0,
      costoNomina: 0,
      promedioSalarial: 0,
    });

  const [empleadosDepto,
    setEmpleadosDepto] =
    useState([]);

  const [prestamosChart,
    setPrestamosChart] =
    useState([]);

  useEffect(() => {

    cargarDashboard();

  }, []);

  const cargarDashboard =
    async () => {

      const {
        count: activos,
      } = await supabase
        .from("empleados")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activo", true);

      const {
        count: inactivos,
      } = await supabase
        .from("empleados")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activo", false);

      const {
        count: usuarios,
      } = await supabase
        .from("profiles")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activo", true);

      const {
        count: departamentos,
      } = await supabase
        .from("departamentos")
        .select("*", {
          count: "exact",
          head: true,
        });

      const {
        count: vacaciones,
      } = await supabase
        .from("vacaciones")
        .select("*", {
          count: "exact",
          head: true,
        });

      const {
        count: prestamosActivos,
      } = await supabase
        .from("prestamos")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("estatus", "ACTIVO");

      const { data: nomina } =
        await supabase
          .from("nomina")
          .select("neto_pagar");

      const costoNomina =
        (nomina || []).reduce(
          (a, b) =>
            a +
            Number(
              b.neto_pagar || 0
            ),
          0
        );

      const {
        data: empleados,
      } = await supabase
        .from("empleados")
        .select(
          "sueldo_base"
        )
        .eq("activo", true);

      const promedioSalarial =
        empleados?.length > 0
          ? empleados.reduce(
              (a, b) =>
                a +
                Number(
                  b.sueldo_base || 0
                ),
              0
            ) /
            empleados.length
          : 0;

      setKpis({
        empleadosActivos:
          activos || 0,

        empleadosInactivos:
          inactivos || 0,

        usuariosActivos:
          usuarios || 0,

        departamentos:
          departamentos || 0,

        vacaciones:
          vacaciones || 0,

        prestamosActivos:
          prestamosActivos || 0,

        costoNomina,

        promedioSalarial,
      });

      await cargarGraficaDepartamentos();

      await cargarGraficaPrestamos();

    };

  const cargarGraficaDepartamentos =
    async () => {

      const { data } =
        await supabase
          .from("empleados")
          .select(`
            departamento_id,
            departamentos (
              nombre
            )
          `)
          .eq("activo", true);

      const agrupado = {};

      (data || []).forEach(
        (item) => {

          const nombre =
            item.departamentos
              ?.nombre ||
            "Sin Depto";

          agrupado[nombre] =
            (agrupado[nombre] || 0) +
            1;

        }
      );

      const resultado =
        Object.keys(
          agrupado
        ).map((key) => ({
          departamento: key,
          empleados:
            agrupado[key],
        }));

      setEmpleadosDepto(
        resultado
      );

    };

  const cargarGraficaPrestamos =
    async () => {

      const {
        count: activos,
      } = await supabase
        .from("prestamos")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "estatus",
          "ACTIVO"
        );

      const {
        count: liquidados,
      } = await supabase
        .from("prestamos")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "estatus",
          "LIQUIDADO"
        );

      setPrestamosChart([
        {
          name: "Activos",
          value: activos || 0,
        },
        {
          name: "Liquidados",
          value:
            liquidados || 0,
        },
      ]);

    };

  const Card = ({
    titulo,
    valor,
    icono,
  }) => (

    <div
      className="
        bg-white
        shadow
        rounded-xl
        p-6
      "
    >

      <div className="text-3xl">
        {icono}
      </div>

      <div className="text-gray-500 mt-2">
        {titulo}
      </div>

      <div className="text-3xl font-bold">
        {valor}
      </div>

    </div>

  );

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        📈 Dashboard Ejecutivo
      </h1>

      <div className="grid md:grid-cols-4 gap-4 mb-8">

        <Card
          icono="👥"
          titulo="Activos"
          valor={
            kpis.empleadosActivos
          }
        />

        <Card
          icono="🚫"
          titulo="Inactivos"
          valor={
            kpis.empleadosInactivos
          }
        />

        <Card
          icono="👤"
          titulo="Usuarios"
          valor={
            kpis.usuariosActivos
          }
        />

        <Card
          icono="🏢"
          titulo="Departamentos"
          valor={
            kpis.departamentos
          }
        />

        <Card
          icono="🏖"
          titulo="Vacaciones"
          valor={
            kpis.vacaciones
          }
        />

        <Card
          icono="💳"
          titulo="Préstamos"
          valor={
            kpis.prestamosActivos
          }
        />

        <Card
          icono="💰"
          titulo="Costo Nómina"
          valor={`$${kpis.costoNomina.toLocaleString(
            "es-MX"
          )}`}
        />

        <Card
          icono="📊"
          titulo="Promedio Salarial"
          valor={`$${kpis.promedioSalarial.toFixed(0)}`}
        />

      </div>

      <div className="grid md:grid-cols-2 gap-6">

        <div className="bg-white shadow rounded-xl p-6">

          <h2 className="font-bold text-xl mb-4">
            Empleados por Departamento
          </h2>

          <ResponsiveContainer
            width="100%"
            height={350}
          >

            <BarChart
              data={
                empleadosDepto
              }
            >

              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="departamento"
              />

              <YAxis />

              <Tooltip />

              <Bar
                dataKey="empleados"
                fill="#2563eb"
              />

            </BarChart>

          </ResponsiveContainer>

        </div>

        <div className="bg-white shadow rounded-xl p-6">

          <h2 className="font-bold text-xl mb-4">
            Préstamos
          </h2>

          <ResponsiveContainer
            width="100%"
            height={350}
          >

            <PieChart>

              <Pie
                data={
                  prestamosChart
                }
                dataKey="value"
                nameKey="name"
                outerRadius={120}
              >

                {prestamosChart.map(
                  (
                    entry,
                    index
                  ) => (

                    <Cell
                      key={index}
                      fill={
                        COLORS[
                          index %
                            COLORS.length
                        ]
                      }
                    />

                  )
                )}

              </Pie>

              <Tooltip />

              <Legend />

            </PieChart>

          </ResponsiveContainer>

        </div>

      </div>

    </div>

  );

}