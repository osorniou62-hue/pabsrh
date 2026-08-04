import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

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

      try {

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
          .eq(
            "estatus",
            "ACTIVO"
          );

        const { data: nomina } =
          await supabase
            .from("nomina")
            .select("neto_pagar");

        const costoNomina =
          (nomina || []).reduce(
            (total, item) =>
              total +
              Number(
                item.neto_pagar || 0
              ),
            0
          );

        const {
          data: empleados,
        } = await supabase
          .from("empleados")
          .select("sueldo_base")
          .eq("activo", true);

        const promedioSalarial =
          empleados?.length > 0
            ? empleados.reduce(
                (total, item) =>
                  total +
                  Number(
                    item.sueldo_base || 0
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

      } catch (error) {

        console.error(error);

      }

    };

  const cargarGraficaDepartamentos =
    async () => {

      const { data, error } =
        await supabase
          .from("empleados")
          .select(`
            departamento_id,
            departamentos (
              nombre
            )
          `)
          .eq("activo", true);

      if (error) {

        console.error(error);
        return;

      }

      const agrupado = {};

      (data || []).forEach(
        (item) => {

          const nombre =
            item.departamentos
              ?.nombre ||
            "Sin Departamento";

          agrupado[nombre] =
            (agrupado[nombre] || 0) + 1;

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

  return (

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            📈 Dashboard Ejecutivo
          </h1>

          <p className="text-gray-500 mt-2">
            Indicadores estratégicos de RH y Nómina
          </p>

        </div>

        <div
          className="
            grid
            md:grid-cols-4
            gap-6
            mb-10
          "
        >

          <KpiCard
            titulo="Activos"
            valor={kpis.empleadosActivos}
            icono="👥"
            color="text-green-600"
          />

          <KpiCard
            titulo="Inactivos"
            valor={kpis.empleadosInactivos}
            icono="🚫"
            color="text-red-600"
          />

          <KpiCard
            titulo="Usuarios"
            valor={kpis.usuariosActivos}
            icono="👤"
            color="text-purple-600"
          />

          <KpiCard
            titulo="Departamentos"
            valor={kpis.departamentos}
            icono="🏢"
            color="text-blue-600"
          />

          <KpiCard
            titulo="Vacaciones"
            valor={kpis.vacaciones}
            icono="🏖"
            color="text-green-600"
          />

          <KpiCard
            titulo="Préstamos"
            valor={kpis.prestamosActivos}
            icono="💳"
            color="text-orange-600"
          />

          <KpiCard
            titulo="Costo Nómina"
            valor={`$${kpis.costoNomina.toLocaleString("es-MX")}`}
            icono="💰"
            color="text-emerald-600"
          />

          <KpiCard
            titulo="Promedio Salarial"
            valor={`$${kpis.promedioSalarial.toFixed(0)}`}
            icono="📊"
            color="text-indigo-600"
          />

        </div>

        <div
          className="
            grid
            lg:grid-cols-2
            gap-6
          "
        >

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <h2
              className="
                text-xl
                font-bold
                mb-4
              "
            >
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
                  radius={[8, 8, 0, 0]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <h2
              className="
                text-xl
                font-bold
                mb-4
              "
            >
              Estado de Préstamos
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
                  label
                >

                  {prestamosChart.map(
                    (entry, index) => (

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

    </Layout>

  );

}