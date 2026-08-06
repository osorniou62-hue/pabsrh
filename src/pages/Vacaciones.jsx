import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [vacacionesFiltradas, setVacacionesFiltradas] = useState([]);

  // Estados para Búsqueda e Historial
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [historialModal, setHistorialModal] = useState(null); // Almacena los datos para el modal

  const [form, setForm] = useState({
    empleado_id: "",
    fecha_inicio: "",
    fecha_fin: "",
    dias_solicitados: "",
    observaciones: "",
  });

  useEffect(() => {
    cargarEmpleados();
    cargarVacaciones();
  }, []);

  const cargarEmpleados = async () => {
    const { data } = await supabase
      .from("empleados")
      .select("*")
      .eq("activo", true)
      .order("nombre_completo");

    setEmpleados(data || []);
  };

  const cargarVacaciones = async () => {
    const { data } = await supabase
      .from("vacaciones")
      .select(`
        *,
        empleados (
          nombre_completo,
          numero_empleado
        )
      `)
      .order("created_at", { ascending: false });

    setVacaciones(data || []);
    setVacacionesFiltradas(data || []);
  };

  // Función para buscar vacaciones e historial de un empleado específico
  const buscarVacacionesEmpleado = () => {
    if (!empleadoSeleccionadoId) {
      setVacacionesFiltradas(vacaciones);
      setBusquedaActiva(false);
      return;
    }

    const filtrados = vacaciones.filter(
      (v) => String(v.empleado_id) === String(empleadoSeleccionadoId)
    );

    setVacacionesFiltradas(filtrados);
    setBusquedaActiva(true);
  };

  const limpiarBusqueda = () => {
    setEmpleadoSeleccionadoId("");
    setVacacionesFiltradas(vacaciones);
    setBusquedaActiva(false);
  };

  const verHistorialDetallado = async (vacacion) => {
    // Si cuentas con una tabla de detalle de historial/seguimiento:
    const { data: historialDetalle } = await supabase
      .from("historial_vacaciones")
      .select("*")
      .eq("vacacion_id", vacacion.id)
      .order("created_at", { ascending: false });

    setHistorialModal({
      vacacion,
      registros: historialDetalle || [],
    });
  };

  const guardarVacaciones = async () => {
    if (
      !form.empleado_id ||
      !form.fecha_inicio ||
      !form.fecha_fin ||
      !form.dias_solicitados
    ) {
      alert("Completa los campos requeridos");
      return;
    }

    const { error } = await supabase.from("vacaciones").insert([
      {
        empleado_id: Number(form.empleado_id),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_solicitados: Number(form.dias_solicitados),
        observaciones: form.observaciones,
        estatus: "PENDIENTE",
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
      dias_solicitados: "",
      observaciones: "",
    });

    await cargarVacaciones();
  };

  const cambiarEstatusVacacion = async (vacacion, nuevoEstatus) => {
    const confirmar = window.confirm(
      `¿Deseas cambiar el estatus de la solicitud a ${nuevoEstatus}?`
    );
    if (!confirmar) return;

    const { error } = await supabase
      .from("vacaciones")
      .update({ estatus: nuevoEstatus })
      .eq("id", vacacion.id);

    if (error) {
      alert(error.message);
      return;
    }

    await cargarVacaciones();
  };

  // Cálculos de KPIs
  const pendientes = vacaciones.filter((v) => v.estatus === "PENDIENTE").length;
  const aprobadas = vacaciones.filter((v) => v.estatus === "APROBADO").length;
  const rechazadas = vacaciones.filter((v) => v.estatus === "RECHAZADO").length;

  const totalDiasOtorgados = vacaciones
    .filter((v) => v.estatus === "APROBADO")
    .reduce((a, b) => a + Number(b.dias_solicitados || 0), 0);

  return (
    <Layout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold">🏖️ Vacaciones</h1>
          <p className="text-gray-500 mt-2">
            Administración y control de solicitudes de vacaciones de empleados
          </p>
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard
            titulo="Pendientes"
            valor={pendientes}
            icono="⏳"
            color="text-amber-600"
          />
          <KpiCard
            titulo="Aprobadas"
            valor={aprobadas}
            icono="✅"
            color="text-green-600"
          />
          <KpiCard
            titulo="Rechazadas"
            valor={rechazadas}
            icono="❌"
            color="text-red-600"
          />
          <KpiCard
            titulo="Días Aprobados"
            valor={totalDiasOtorgados}
            icono="🗓️"
            color="text-blue-600"
          />
        </div>

        {/* BUSCADOR DE HISTORIAL DE EMPLEADO */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-3 text-slate-700">
            🔎 Buscar Vacaciones e Historial por Empleado
          </h2>
          <div className="flex flex-col md:flex-row gap-3">
            <select
              value={empleadoSeleccionadoId}
              onChange={(e) => setEmpleadoSeleccionadoId(e.target.value)}
              className="border rounded-xl p-3 bg-white flex-1"
            >
              <option value="">-- Selecciona un empleado --</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  [{emp.numero_empleado}] {emp.nombre_completo}
                </option>
              ))}
            </select>

            <button
              onClick={buscarVacacionesEmpleado}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium"
            >
              Buscar
            </button>

            {busquedaActiva && (
              <button
                onClick={limpiarBusqueda}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-xl"
              >
                Ver Todos
              </button>
            )}
          </div>
        </div>

        {/* FORMULARIO NUEVA SOLICITUD DE VACACIONES */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Nueva Solicitud de Vacaciones</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <select
              value={form.empleado_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  empleado_id: e.target.value,
                })
              }
              className="border rounded-xl p-3"
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map((empleado) => (
                <option key={empleado.id} value={empleado.id}>
                  {empleado.nombre_completo}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Días Solicitados"
              value={form.dias_solicitados}
              onChange={(e) =>
                setForm({
                  ...form,
                  dias_solicitados: e.target.value,
                })
              }
              className="border rounded-xl p-3"
            />

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Fecha de Inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fecha_inicio: e.target.value,
                  })
                }
                className="border rounded-xl p-3"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Fecha de Fin</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fecha_fin: e.target.value,
                  })
                }
                className="border rounded-xl p-3"
              />
            </div>

            <textarea
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) =>
                setForm({
                  ...form,
                  observaciones: e.target.value,
                })
              }
              className="border rounded-xl p-3 md:col-span-2"
            />
          </div>

          <button
            onClick={guardarVacaciones}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium"
          >
            Guardar Solicitud
          </button>
        </div>

        {/* TABLA DE VACACIONES */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-4 text-left">Empleado</th>
                <th className="p-4 text-center">Periodo</th>
                <th className="p-4 text-center">Días</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {vacacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">
                    No se encontraron registros de vacaciones para la búsqueda.
                  </td>
                </tr>
              ) : (
                vacacionesFiltradas.map((vacacion) => (
                  <tr key={vacacion.id} className="border-t hover:bg-slate-50">
                    <td className="p-4 font-medium">
                      {vacacion.empleados?.nombre_completo}
                    </td>

                    <td className="p-4 text-center text-sm text-gray-600">
                      {vacacion.fecha_inicio} al {vacacion.fecha_fin}
                    </td>

                    <td className="p-4 text-center font-semibold">
                      {vacacion.dias_solicitados}
                    </td>

                    <td className="p-4 text-center">
                      {vacacion.estatus === "PENDIENTE" && (
                        <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-medium">
                          PENDIENTE
                        </span>
                      )}
                      {vacacion.estatus === "APROBADO" && (
                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                          APROBADO
                        </span>
                      )}
                      {vacacion.estatus === "RECHAZADO" && (
                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                          RECHAZADO
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-center flex justify-center gap-2">
                      <button
                        onClick={() => verHistorialDetallado(vacacion)}
                        className="bg-gray-100 hover:bg-gray-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium"
                      >
                        📜 Historial
                      </button>

                      {vacacion.estatus === "PENDIENTE" && (
                        <>
                          <button
                            onClick={() =>
                              cambiarEstatusVacacion(vacacion, "APROBADO")
                            }
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() =>
                              cambiarEstatusVacacion(vacacion, "RECHAZADO")
                            }
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL PARA MOSTRAR HISTORIAL COMPLETO */}
        {historialModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  Historial de Vacaciones -{" "}
                  {historialModal.vacacion.empleados?.nombre_completo}
                </h3>
                <button
                  onClick={() => setHistorialModal(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl mb-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <strong>Fecha Inicio:</strong> {historialModal.vacacion.fecha_inicio}
                </div>
                <div>
                  <strong>Fecha Fin:</strong> {historialModal.vacacion.fecha_fin}
                </div>
                <div>
                  <strong>Días Solicitados:</strong>{" "}
                  {historialModal.vacacion.dias_solicitados}
                </div>
                <div>
                  <strong>Estatus Actual:</strong> {historialModal.vacacion.estatus}
                </div>
                {historialModal.vacacion.observaciones && (
                  <div className="col-span-2">
                    <strong>Observaciones:</strong>{" "}
                    {historialModal.vacacion.observaciones}
                  </div>
                )}
              </div>

              <h4 className="font-bold mb-2">Detalles / Registro de Modificaciones</h4>

              <div className="max-h-60 overflow-y-auto border rounded-xl">
                {historialModal.registros.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">
                    No hay registro detallado de movimientos adicionales.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left">Fecha Movimiento</th>
                        <th className="p-2 text-left">Estatus Anterior</th>
                        <th className="p-2 text-left">Comentario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialModal.registros.map((registro) => (
                        <tr key={registro.id} className="border-t">
                          <td className="p-2">
                            {new Date(registro.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-2">{registro.estatus}</td>
                          <td className="p-2">{registro.comentario || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-6 text-right">
                <button
                  onClick={() => setHistorialModal(null)}
                  className="bg-slate-800 text-white px-5 py-2 rounded-xl"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}