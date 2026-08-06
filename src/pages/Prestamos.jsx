import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Prestamos() {
  const [empleados, setEmpleados] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [prestamosFiltrados, setPrestamosFiltrados] = useState([]);

  // Estados para Búsqueda e Historial
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [historialModal, setHistorialModal] = useState(null); // Almacena los datos del historial para el modal

  const [form, setForm] = useState({
    empleado_id: "",
    importe_total: "",
    descuento_periodo: "",
    observaciones: "",
  });

  useEffect(() => {
    cargarEmpleados();
    cargarPrestamos();
  }, []);

  const cargarEmpleados = async () => {
    const { data } = await supabase
      .from("empleados")
      .select("*")
      .eq("activo", true)
      .order("nombre_completo");

    setEmpleados(data || []);
  };

  const cargarPrestamos = async () => {
    const { data } = await supabase
      .from("prestamos")
      .select(`
        *,
        empleados (
          nombre_completo,
          numero_empleado
        )
      `)
      .order("created_at", { ascending: false });

    setPrestamos(data || []);
    setPrestamosFiltrados(data || []);
  };

  // Función para buscar préstamos e historial de un empleado específico
  const buscarPrestamoEmpleado = () => {
    if (!empleadoSeleccionadoId) {
      setPrestamosFiltrados(prestamos);
      setBusquedaActiva(false);
      return;
    }

    const filtrados = prestamos.filter(
      (p) => String(p.empleado_id) === String(empleadoSeleccionadoId)
    );

    setPrestamosFiltrados(filtrados);
    setBusquedaActiva(true);
  };

  const limpiarBusqueda = () => {
    setEmpleadoSeleccionadoId("");
    setPrestamosFiltrados(prestamos);
    setBusquedaActiva(false);
  };

  const verHistorialDetallado = async (prestamo) => {
    // Si manejas una tabla de pagos/abonos o historial_prestamos en Supabase:
    const { data: historialPagos } = await supabase
      .from("historial_prestamos")
      .select("*")
      .eq("prestamo_id", prestamo.id)
      .order("created_at", { ascending: false });

    setHistorialModal({
      prestamo,
      pagos: historialPagos || [],
    });
  };

  const guardarPrestamo = async () => {
    if (
      !form.empleado_id ||
      !form.importe_total ||
      !form.descuento_periodo
    ) {
      alert("Completa los campos requeridos");
      return;
    }

    const { error } = await supabase.from("prestamos").insert([
      {
        empleado_id: Number(form.empleado_id),
        importe_total: Number(form.importe_total),
        saldo_actual: Number(form.importe_total),
        descuento_periodo: Number(form.descuento_periodo),
        observaciones: form.observaciones,
        estatus: "ACTIVO",
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

  const liquidarPrestamo = async (prestamo) => {
    const confirmar = window.confirm("¿Deseas liquidar este préstamo?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("prestamos")
      .update({
        estatus: "LIQUIDADO",
        saldo_actual: 0,
      })
      .eq("id", prestamo.id);

    if (error) {
      alert(error.message);
      return;
    }

    await cargarPrestamos();
  };

  const activos = prestamos.filter((p) => p.estatus === "ACTIVO").length;
  const liquidados = prestamos.filter((p) => p.estatus === "LIQUIDADO").length;

  const totalPrestado = prestamos.reduce(
    (a, b) => a + Number(b.importe_total || 0),
    0
  );

  const saldoPendiente = prestamos.reduce(
    (a, b) => a + Number(b.saldo_actual || 0),
    0
  );

  return (
    <Layout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold">💳 Préstamos</h1>
          <p className="text-gray-500 mt-2">
            Administración de préstamos a empleados
          </p>
        </div>

        {/* KPIs */}
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

        {/* BUSCADOR DE HISTORIAL DE EMPLEADO */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-3 text-slate-700">
            🔎 Buscar Préstamo e Historial por Empleado
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
              onClick={buscarPrestamoEmpleado}
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

        {/* FORMULARIO NUEVO PRÉSTAMO */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Nuevo Préstamo</h2>

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
              step="0.01"
              placeholder="Importe Total"
              value={form.importe_total}
              onChange={(e) =>
                setForm({
                  ...form,
                  importe_total: e.target.value,
                })
              }
              className="border rounded-xl p-3"
            />

            <input
              type="number"
              step="0.01"
              placeholder="Descuento por período"
              value={form.descuento_periodo}
              onChange={(e) =>
                setForm({
                  ...form,
                  descuento_periodo: e.target.value,
                })
              }
              className="border rounded-xl p-3"
            />

            <textarea
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) =>
                setForm({
                  ...form,
                  observaciones: e.target.value,
                })
              }
              className="border rounded-xl p-3"
            />
          </div>

          <button
            onClick={guardarPrestamo}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium"
          >
            Guardar Préstamo
          </button>
        </div>

        {/* TABLA DE PRÉSTAMOS */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-4 text-left">Empleado</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4 text-right">Saldo</th>
                <th className="p-4 text-right">Descuento</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {prestamosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-500">
                    No se encontraron préstamos para la búsqueda.
                  </td>
                </tr>
              ) : (
                prestamosFiltrados.map((prestamo) => (
                  <tr key={prestamo.id} className="border-t hover:bg-slate-50">
                    <td className="p-4 font-medium">
                      {prestamo.empleados?.nombre_completo}
                    </td>

                    <td className="p-4 text-right">
                      ${Number(prestamo.importe_total).toFixed(2)}
                    </td>

                    <td className="p-4 text-right">
                      ${Number(prestamo.saldo_actual).toFixed(2)}
                    </td>

                    <td className="p-4 text-right">
                      ${Number(prestamo.descuento_periodo).toFixed(2)}
                    </td>

                    <td className="p-4 text-center">
                      {prestamo.estatus === "ACTIVO" ? (
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                          ACTIVO
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                          LIQUIDADO
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-center flex justify-center gap-2">
                      <button
                        onClick={() => verHistorialDetallado(prestamo)}
                        className="bg-gray-100 hover:bg-gray-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium"
                      >
                        📜 Historial
                      </button>

                      {prestamo.estatus === "ACTIVO" && (
                        <button
                          onClick={() => liquidarPrestamo(prestamo)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
                        >
                          Liquidar
                        </button>
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
                  Historial de Préstamo -{" "}
                  {historialModal.prestamo.empleados?.nombre_completo}
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
                  <strong>Monto Total:</strong> $
                  {Number(historialModal.prestamo.importe_total).toFixed(2)}
                </div>
                <div>
                  <strong>Saldo Actual:</strong> $
                  {Number(historialModal.prestamo.saldo_actual).toFixed(2)}
                </div>
                <div>
                  <strong>Descuento Período:</strong> $
                  {Number(historialModal.prestamo.descuento_periodo).toFixed(2)}
                </div>
                <div>
                  <strong>Estatus:</strong> {historialModal.prestamo.estatus}
                </div>
                {historialModal.prestamo.observaciones && (
                  <div className="col-span-2">
                    <strong>Observaciones:</strong>{" "}
                    {historialModal.prestamo.observaciones}
                  </div>
                )}
              </div>

              <h4 className="font-bold mb-2">Abonos / Pagos Registrados</h4>

              <div className="max-h-60 overflow-y-auto border rounded-xl">
                {historialModal.pagos.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">
                    No hay registro detallado de abonos individuales aún.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left">Fecha</th>
                        <th className="p-2 text-right">Monto</th>
                        <th className="p-2 text-left">Concepto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialModal.pagos.map((pago) => (
                        <tr key={pago.id} className="border-t">
                          <td className="p-2">
                            {new Date(pago.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-2 text-right">${pago.monto}</td>
                          <td className="p-2">{pago.concepto || "Abono"}</td>
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