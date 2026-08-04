import { Link } from "react-router-dom";

export default function Sidebar() {

  return (

    <aside
      className="
        w-64
        bg-slate-900
        text-white
        min-h-screen
        p-4
      "
    >

      <h1
        className="
          text-2xl
          font-bold
          mb-8
        "
      >
        RH Suite
      </h1>

      <nav className="space-y-2">

        <Link
          to="/dashboard"
          className="block p-3 rounded hover:bg-slate-700"
        >
          📊 Dashboard
        </Link>

        <Link
          to="/dashboard-ejecutivo"
          className="block p-3 rounded hover:bg-slate-700"
        >
          📈 Ejecutivo
        </Link>

        <Link
          to="/empleados"
          className="block p-3 rounded hover:bg-slate-700"
        >
          👥 Empleados
        </Link>

        <Link
          to="/vacaciones"
          className="block p-3 rounded hover:bg-slate-700"
        >
          🏖 Vacaciones
        </Link>

        <Link
          to="/prestamos"
          className="block p-3 rounded hover:bg-slate-700"
        >
          💳 Préstamos
        </Link>

        <Link
          to="/nomina"
          className="block p-3 rounded hover:bg-slate-700"
        >
          🧮 Nómina
        </Link>

        <Link
          to="/reportes"
          className="block p-3 rounded hover:bg-slate-700"
        >
          📊 Reportes
        </Link>

        <Link
          to="/configuracion"
          className="block p-3 rounded hover:bg-slate-700"
        >
          ⚙️ Configuración
        </Link>

      </nav>

    </aside>

  );

}