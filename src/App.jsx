import { BrowserRouter, Routes, Route } from "react-router-dom";

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

export default function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Login />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/departamentos"
          element={<Departamentos />}
        />

        <Route
          path="/puestos"
          element={<Puestos />}
        />

        <Route
          path="/empleados"
          element={<Empleados />}
        />

        <Route
          path="/empleados/nuevo"
          element={<EmpleadoForm />}
        />

        <Route
          path="/empleados/:id"
          element={<EmpleadoForm />}
        />

        <Route
          path="/empleados/detalle/:id"
          element={<DetalleEmpleado />}
        />

        <Route
          path="/periodos"
          element={<PeriodosNomina />}
        />

        <Route
          path="/incidencias"
          element={<Incidencias />}
        />

        <Route
          path="/nomina"
          element={<Nomina />}
        />

        <Route
          path="/nomina/recibo/:empleadoId/:periodoId"
          element={<ReciboNomina />}
        />

      </Routes>

    </BrowserRouter>

  );

}