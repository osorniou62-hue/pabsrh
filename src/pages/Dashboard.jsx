 import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Dashboard() {
  const [activos, setActivos] = useState(0);
  const [bajas, setBajas] = useState(0);
  const [departamentos, setDepartamentos] = useState(0);
  const [puestos, setPuestos] = useState(0);

  useEffect(() => {
    cargarIndicadores();
  }, []);

  const cargarIndicadores = async () => {
    const { count: empleadosActivos } = await supabase
      .from("empleados")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("activo", true);

    const { count: empleadosBaja } = await supabase
      .from("empleados")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("activo", false);

    const { count: totalDepartamentos } = await supabase
      .from("departamentos")
      .select("*", {
        count: "exact",
        head: true,
      });

    const { count: totalPuestos } = await supabase
      .from("puestos")
      .select("*", {
        count: "exact",
        head: true,
      });

    setActivos(empleadosActivos || 0);
    setBajas(empleadosBaja || 0);
    setDepartamentos(totalDepartamentos || 0);
    setPuestos(totalPuestos || 0);
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const Modulo = ({ titulo, descripcion, ruta, icono }) => (
    <Link
      to={ruta}
      className="
        bg-white
        rounded-2xl
        shadow-lg
        p-6
        hover:shadow-xl
        transition
      "
    >
      <div className="text-4xl mb-3">{icono}</div>
      <h3 className="text-xl font-bold mb-2">{titulo}</h3>
      <p className="text-gray-500">{descripcion}</p>
    </Link>
  );

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Dashboard</h1>
          <p className="text-gray-500 mt-2">
            Bienvenido al Sistema RH y Nómina
          </p>
        </div>

        <button
          onClick={cerrarSesion}
          className="
            bg-red-600
            hover:bg-red-700
            text-white
            px-5
            py-3
            rounded-xl
            transition
          "
        >
          Cerrar Sesión
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-6 mb-10">
        <KpiCard
          titulo="Activos"
          valor={activos}
          icono="👥"
          color="text-green-600"
        />
        <KpiCard
          titulo="Bajas"
          valor={bajas}
          icono="🚫"
          color="text-red-600"
        />
        <KpiCard
          titulo="Departamentos"
          valor={departamentos}
          icono="🏢"
          color="text-blue-600"
        />
        <KpiCard
          titulo="Puestos"
          valor={puestos}
          icono="💼"
          color="text-purple-600"
        />
      </div>

      <h2 className="text-2xl font-bold mb-6">Módulos</h2>

      <div className="grid md:grid-cols-3 xl:grid-cols-4 gap-6">
        <Modulo
          icono="👥"
          titulo="Empleados"
          descripcion="Altas, bajas y consultas."
          ruta="/empleados"
        />

        <Modulo
          icono="🏢"
          titulo="Departamentos"
          descripcion="Administración de departamentos."
          ruta="/departamentos"
        />

        <Modulo
          icono="💼"
          titulo="Puestos"
          descripcion="Administración de puestos."
          ruta="/puestos"
        />

        <Modulo
          icono="📅"
          titulo="Periodos"
          descripcion="Periodos de nómina."
          ruta="/periodos"
        />

        {/* MÓDULO DE INCIDENCIAS AGREGADO */}
        <Modulo
          icono="📝"
          titulo="Incidencias"
          descripcion="Horas extra, faltas y novedades."
          ruta="/incidencias"
        />

        <Modulo
          icono="👤"
          titulo="Usuarios"
          descripcion="Administración de accesos."
          ruta="/usuarios"
        />

        <Modulo
          icono="📨"
          titulo="Solicitudes"
          descripcion="Solicitudes de usuarios."
          ruta="/solicitudes"
        />

        <Modulo
          icono="🏖"
          titulo="Vacaciones"
          descripcion="Control de vacaciones."
          ruta="/vacaciones"
        />

        <Modulo
          icono="💳"
          titulo="Préstamos"
          descripcion="Administración de préstamos."
          ruta="/prestamos"
        />

        <Modulo
          icono="🧮"
          titulo="Nómina"
          descripcion="Generación de nómina."
          ruta="/nomina"
        />

        <Modulo
          icono="📦"
          titulo="Recibos Masivos"
          descripcion="PDF y ZIP de recibos."
          ruta="/recibos-masivos"
        />

        <Modulo
          icono="📊"
          titulo="Reportes"
          descripcion="Exportación a Excel."
          ruta="/reportes"
        />

        <Modulo
          icono="📈"
          titulo="Dashboard Ejecutivo"
          descripcion="KPIs y gráficas."
          ruta="/dashboard-ejecutivo"
        />

        <Modulo
          icono="🔔"
          titulo="Notificaciones"
          descripcion="Centro de alertas."
          ruta="/notificaciones"
        />

        <Modulo
          icono="📋"
          titulo="Auditoría"
          descripcion="Bitácora del sistema."
          ruta="/auditoria"
        />

        <Modulo
          icono="⚙️"
          titulo="Configuración"
          descripcion="Datos corporativos."
          ruta="/configuracion"
        />
      </div>
    </Layout>
  );
}