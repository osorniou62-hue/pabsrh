import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export default function DashboardEjecutivo() {

  const [totales, setTotales] =
    useState({
      empleadosActivos: 0,
      empleadosInactivos: 0,
      departamentos: 0,
      puestos: 0,
      vacaciones: 0,
      prestamos: 0,
      usuarios: 0,
    });

  const [departamentosChart,
    setDepartamentosChart] =
    useState([]);

  useEffect(() => {

    cargarIndicadores();

  }, []);

  const cargarIndicadores =
    async () => {

      const { count: activos } =
        await supabase
          .from("empleados")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("activo", true);

      const { count: inactivos } =
        await supabase
          .from("empleados")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("activo", false);

      const { count: departamentos } =
        await supabase
          .from("departamentos")
          .select("*", {
            count: "exact",
            head: true,
          });

      const { count: puestos } =
        await supabase
          .from("puestos")
          .select("*", {
            count: "exact",
            head: true,
          });

      const { count: vacaciones } =
        await supabase
          .from("vacaciones")
          .select("*", {
            count: "exact",
            head: true,
          });

      const { count: prestamos } =
        await supabase
          .from("prestamos")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq(
            "estatus",
            "ACTIVO"
          );

      const { count: usuarios } =
        await supabase
          .from("profiles")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq(
            "activo",
            true
          );

      setTotales({
        empleadosActivos:
          activos || 0,

        empleadosInactivos:
          inactivos || 0,

        departamentos:
          departamentos || 0,

        puestos:
          puestos || 0,

        vacaciones:
          vacaciones || 0,

        prestamos:
          prestamos || 0,

        usuarios:
          usuarios || 0,
      });

      cargarGraficaDepartamentos();

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
          .eq(
            "activo",
            true
          );

      if (error) {

        console.error(error);

        return;

      }

      const agrupados = {};

      data.forEach((item) => {

        const nombre =
          item.departamentos
            ?.nombre ||
          "Sin Departamento";

        agrupados[nombre] =
          (agrupados[nombre] || 0) + 1;

      });

      const grafica =
        Object.keys(
          agrupados
        ).map((key) => ({

          departamento: key,

          empleados:
            agrupados[key],

        }));

      setDepartamentosChart(
        grafica
      );

    };

  const Tarjeta = ({
    titulo,
    valor,
    icono,
  }) => (

    <div
      className="
        bg-white
        rounded-xl
        shadow
        p-6
      "
    >

      <div className="text-3xl mb-2">
        {icono}
      </div>

      <div className="text-gray-600">
        {titulo}
      </div>

      <div
        className="
          text-3xl
          font-bold
          mt-2
        "
      >
        {valor}
      </div>

    </div>

  );

  return (

    <div className="p-6">

      <h1
        className="
          text-3xl
          font-bold
          mb-6
        "
      >
        📈 Dashboard Ejecutivo
      </h1>

      <div
        className="
          grid
          md:grid-cols-4
          gap-4
          mb-8
        "
      >

        <Tarjeta
          titulo="Activos"
          valor={
            totales.empleadosActivos
          }
          icono="👥"
        />

        <Tarjeta
          titulo="Inactivos"
          valor={
            totales.empleadosInactivos
          }
          icono="🚫"
        />

        <Tarjeta
          titulo="Departamentos"
          valor={
            totales.departamentos
          }
          icono="🏢"
        />

        <Tarjeta
          titulo="Puestos"
          valor={
            totales.puestos
          }
          icono="💼"
        />

        <Tarjeta
          titulo="Vacaciones"
          valor={
            totales.vacaciones
          }
          icono="🏖"
        />

        <Tarjeta
          titulo="Préstamos"
          valor={
            totales.prestamos
          }
          icono="💳"
        />

        <Tarjeta
          titulo="Usuarios"
          valor={
            totales.usuarios
          }
          icono="👤"
        />

      </div>

      <div
        className="
          bg-white
          shadow
          rounded-xl
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
              departamentosChart
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

    </div>

  );

}