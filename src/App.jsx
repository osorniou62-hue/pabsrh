import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Departamentos from "./pages/Departamentos";
import Puestos from "./pages/Puestos";
import Empleados from "./pages/Empleados";
import EmpleadoForm from "./pages/EmpleadoForm";
import DetalleEmpleado from "./pages/DetalleEmpleado";
import PeriodosNomina from "./pages/PeriodosNomina";
import Incidencias from "./pages/Incidencias";
import Nomina from "./pages/Nomina";
import ReciboNomina from "./pages/ReciboNomina";
import Usuarios from "./pages/Usuarios";
import SolicitudesUsuario from "./pages/SolicitudesUsuario";
import Vacaciones from "./pages/Vacaciones";
import Prestamos from "./pages/Prestamos";
import Reportes from "./pages/Reportes";
import DashboardEjecutivo from "./pages/DashboardEjecutivo";
import Auditoria from "./pages/Auditoria";
import Notificaciones from "./pages/Notificaciones";
import RecibosMasivos from "./pages/RecibosMasivos";
import ConfiguracionEmpresa from "./pages/ConfiguracionEmpresa";
import ImportarEmpleados from "./pages/ImportarEmpleados";
import ConfiguracionTablas from "./pages/ConfiguracionTablas";
import IncidenciasSupervisor from "./pages/IncidenciasSupervisor";
import NuevoEmpleado from "./pages/NuevoEmpleado";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ======================== */}
        {/* 🔐 AUTENTICACIÓN */}
        {/* ======================== */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} /> {/* 🔥 Agregada para redirecciones */}

        {/* ======================== */}
        {/* 📊 DASHBOARDS */}
        {/* ======================== */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard-ejecutivo" element={<DashboardEjecutivo />} />

        {/* ======================== */}
        {/* 👥 EMPLEADOS */}
        {/* ======================== */}
        <Route path="/empleados" element={<Empleados />} />
        
        {/* 🔥 CORREGIDO: Nueva empleado usa NuevoEmpleado */}
        <Route path="/empleados/nuevo" element={<NuevoEmpleado />} />
        
        {/* Editar empleado existente usa EmpleadoForm */}
        <Route path="/empleados/:id" element={<EmpleadoForm />} />
        <Route path="/empleados/detalle/:id" element={<DetalleEmpleado />} />
        <Route path="/importar-empleados" element={<ImportarEmpleados />} />

        {/* ======================== */}
        {/* 🏢 ORGANIZACIÓN */}
        {/* ======================== */}
        <Route path="/departamentos" element={<Departamentos />} />
        <Route path="/puestos" element={<Puestos />} />

        {/* ======================== */}
        {/* 📅 PERIODOS Y NOMINA */}
        {/* ======================== */}
        <Route path="/periodos" element={<PeriodosNomina />} />
        <Route path="/nomina" element={<Nomina />} />
        <Route path="/nomina/recibo/:empleadoId/:periodoId" element={<ReciboNomina />} />
        <Route path="/recibos-masivos" element={<RecibosMasivos />} />

        {/* ======================== */}
        {/* ⚡ INCIDENCIAS */}
        {/* ======================== */}
        <Route path="/incidencias" element={<Incidencias />} />
        <Route path="/incidencias/supervisor" element={<IncidenciasSupervisor />} />

        {/* ======================== */}
        {/* 🌴 BENEFICIOS */}
        {/* ======================== */}
        <Route path="/vacaciones" element={<Vacaciones />} />
        <Route path="/prestamos" element={<Prestamos />} />

        {/* ======================== */}
        {/* 👤 USUARIOS Y PERMISOS */}
        {/* ======================== */}
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/solicitudes" element={<SolicitudesUsuario />} />

        {/* ======================== */}
        {/* ⚙️ CONFIGURACIÓN */}
        {/* ======================== */}
        <Route path="/configuracion" element={<ConfiguracionEmpresa />} />
        <Route path="/configuracion-tablas" element={<ConfiguracionTablas />} />

        {/* ======================== */}
        {/* 📈 REPORTES Y UTILIDADES */}
        {/* ======================== */}
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/notificaciones" element={<Notificaciones />} />

        {/* ======================== */}
        {/* 🔄 FALLBACK: Redirigir rutas no encontradas */}
        {/* ======================== */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}