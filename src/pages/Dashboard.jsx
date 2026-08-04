import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Dashboard() {

  const [activos, setActivos] =
    useState(0);

  const [bajas, setBajas] =
    useState(0);

  const [departamentos, setDepartamentos] =
    useState(0);

  const [puestos, setPuestos] =
    useState(0);

  useEffect(() => {

    cargarIndicadores();

  }, []);

  const cargarIndicadores =
    async () => {

      const {
        count: empleadosActivos,
      } = await supabase
        .from("empleados")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activo", true);

      const {
        count: empleadosBaja,
      } = await supabase
        .from("empleados")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activo", false);

      const {
        count: totalDepartamentos,
      } = await supabase
        .from("departamentos")
        .select("*", {
          count: "exact",
          head: true,
        });

      const {
        count: totalPuestos,
      } = await supabase
        .from("puestos")
        .select("*", {
          count: "exact",
          head: true,
        });

      setActivos(
        empleadosActivos || 0
      );

      setBajas(
        empleadosBaja || 0
      );

      setDepartamentos(
        totalDepartamentos || 0
      );

      setPuestos(
        totalPuestos || 0
      );

    };

  const cerrarSesion =
    async () => {

      await supabase.auth.signOut();

      window.location.href = "/";

    };

  return (

    <div className="min-h-screen bg-gray-100">

      <div className="bg-white shadow">

        <div className="max-w-7xl mx-auto p-4 flex justify-between items-center">

          <h1 className="text-3xl font-bold">
            Sistema RH
          </h1>

          <button
            onClick={cerrarSesion}
            className="
              bg-red-600
              text-white
              px-4
              py-2
              rounded
              hover:bg-red-700
            "
          >
            Cerrar Sesión
          </button>

        </div>

      </div>

      <div className="max-w-7xl mx-auto p-6">

        <h2 className="text-2xl font-bold mb-6">
          Dashboard
        </h2>

        <div className="grid md:grid-cols-4 gap-4 mb-8">

          <div className="bg-white rounded shadow p-6">

            <div className="text-gray-500">
              Empleados Activos
            </div>

            <div className="text-4xl font-bold text-green-600 mt-2">
              {activos}
            </div>

          </div>

          <div className="bg-white rounded shadow p-6">

            <div className="text-gray-500">
              Empleados de Baja
            </div>

            <div className="text-4xl font-bold text-red-600 mt-2">
              {bajas}
            </div>

          </div>

          <div className="bg-white rounded shadow p-6">

            <div className="text-gray-500">
              Departamentos
            </div>

            <div className="text-4xl font-bold text-blue-600 mt-2">
              {departamentos}
            </div>

          </div>

          <div className="bg-white rounded shadow p-6">

            <div className="text-gray-500">
              Puestos
            </div>

            <div className="text-4xl font-bold text-purple-600 mt-2">
              {puestos}
            </div>

          </div>

        </div>

        <h2 className="text-2xl font-bold mb-4">
          Módulos
        </h2>

        <div className="grid md:grid-cols-3 gap-4">

          <Link
            to="/empleados"
            className="
              bg-white
              p-6
              rounded
              shadow
              hover:bg-gray-50
            "
          >
            <h3 className="font-bold text-xl mb-2">
              👥 Empleados
            </h3>

            <p className="text-gray-600">
              Altas, bajas, consultas y búsqueda.
            </p>

          </Link>

          <Link
            to="/departamentos"
            className="
              bg-white
              p-6
              rounded
              shadow
              hover:bg-gray-50
            "
          >
            <h3 className="font-bold text-xl mb-2">
              🏢 Departamentos
            </h3>

            <p className="text-gray-600">
              Administración de departamentos.
            </p>

          </Link>

          <Link
  to="/periodos"
  className="
    bg-white
    p-6
    rounded
    shadow
    hover:bg-gray-50
  "
>
  <h3 className="font-bold text-xl mb-2">
    📅 Periodos Nómina
  </h3>

  <p className="text-gray-600">
    Administración de periodos.
  </p>

</Link>

<Link
  to="/usuarios"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    👥 Usuarios
  </h3>

  <p className="text-gray-600">
    Administración de accesos
  </p>

</Link>

<Link
  to="/vacaciones"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    🏖 Vacaciones
  </h3>

  <p className="text-gray-600">
    Administración de vacaciones
  </p>
</Link>

<Link
  to="/prestamos"
>
  💳 Préstamos
</Link>

<Link
  to="/reportes"
>
  📊 Reportes
</Link>

<Link
  to="/prestamos"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    💳 Préstamos
  </h3>

  <p className="text-gray-600">
    Administración de préstamos
  </p>
</Link>

<Link
  to="/reportes"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📊 Reportes
  </h3>

  <p className="text-gray-600">
    Exportación a Excel
  </p>
</Link>

<Link
  to="/notificaciones"
>
  🔔 Notificaciones
</Link>

<Link
  to="/recibos-masivos"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📦 Recibos Masivos
  </h3>

  <p className="text-gray-600">
    Generación por período
  </p>
</Link>

<Link
  to="/auditoria"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📋 Auditoría
  </h3>

  <p className="text-gray-600">
    Bitácora del sistema
  </p>
</Link>

<Link
  to="/dashboard-ejecutivo"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📈 Dashboard Ejecutivo
  </h3>

  <p className="text-gray-600">
    Indicadores y gráficas
  </p>
</Link>

<Link
  to="/recibos-masivos"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📦 Recibos Masivos
  </h3>

  <p className="text-gray-600">
    Gestión de recibos por período
  </p>
</Link>

<Link
  to="/solicitudes"
  className="
    bg-white
    rounded
    shadow
    p-6
  "
>
  <h3 className="text-xl font-bold">
    📨 Solicitudes
  </h3>

  <p className="text-gray-600">
    Aprobación de usuarios
  </p>
</Link>

<Link
  to="/configuracion"
  className="
    bg-white
    shadow
    rounded
    p-6
  "
>
  <h3 className="text-xl font-bold">
    ⚙️ Configuración
  </h3>

  <p className="text-gray-600">
    Datos de la empresa
  </p>
</Link>

          <Link
            to="/puestos"
            className="
              bg-white
              p-6
              rounded
              shadow
              hover:bg-gray-50
            "
          >
            <h3 className="font-bold text-xl mb-2">
              💼 Puestos
            </h3>

            <p className="text-gray-600">
              Administración de puestos.
            </p>

          </Link>

        </div>

      </div>

    </div>

  );

}