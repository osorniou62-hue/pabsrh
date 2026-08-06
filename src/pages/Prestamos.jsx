import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Prestamos() {
  const [empleados, setEmpleados] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [prestamosFiltrados, setPrestamosFiltrados] = useState([]);

  // Filtro de Estado (Actuales vs Histórico/Viejos)
  const [filtroEstatus, setFiltroEstatus] = useState("ACTIVO"); // 'ACTIVO', 'LIQUIDADO' o 'TODOS'

  // Búsqueda con Autocomplete
  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);

  // Modales
  const [historialModal, setHistorialModal] = useState(null);
  const [editarModal, setEditarModal] = useState(null);

  // Formulario Nuevo Préstamo
  const [form, setForm] = useState({
    empleado_id: "",
    importe_total: "",
    descuento_periodo: "",
    observaciones: "",
    fecha_solicitud: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    cargarEmpleados();
    cargarPrestamos();
  }, []);

  useEffect(() => {
    aplicarFiltros();
  }, [prestamos, filtroEstatus, empleadoSeleccionadoId, busquedaActiva]);

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
  };

  // Filtrado compuesto (por estatus y por empleado buscado)
  const aplicarFiltros = () => {
    let resultado = [...prestamos];

    // 1. Filtrar por tipo (Actuales / Viejos)
    if (filtroEstatus !== "TODOS") {
      resultado = resultado.filter((p) => p.estatus === filtroEstatus);
    }

    // 2. Filtrar por empleado si la búsqueda está activa
    if (busquedaActiva && empleadoSeleccionadoId) {
      resultado = resultado.filter(
        (p) => String(p.empleado_id) === String(empleadoSeleccionadoId)
      );
    }

    setPrestamosFiltrados(resultado);
  };

  // Sugerencias de Autocomplete
  const sugerenciasEmpleados = empleados.filter((emp) => {
    const query = busquedaTexto.toLowerCase();
    const nombre = (emp.nombre_completo || "").toLowerCase();
    const numero = (emp.numero_empleado || "").toString().toLowerCase();
    return nombre.includes(query) || numero.includes(query);
  });

  const seleccionarEmpleadoBuscador = (empleado) => {
    setBusquedaTexto(`[${empleado.numero_empleado}] ${empleado.nombre_completo}`);
    setEmpleadoSeleccionadoId(empleado.id);
    setMostrarSugerencias(false);
  };

  const buscarPrestamoEmpleado = () => {
    let idTarget = empleadoSeleccionadoId;

    if (!idTarget && busquedaTexto.trim() !== "") {
      const coincidencia = empleados.find((e) =>
        e.nombre_completo.toLowerCase().includes(busquedaTexto.toLowerCase())
      );
      if (coincidencia) idTarget = coincidencia.id;
    }

    if (idTarget) {
      setEmpleadoSeleccionadoId(idTarget);
      setBusquedaActiva(true);
    } else {
      setBusquedaActiva(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusquedaTexto("");
    setEmpleadoSeleccionadoId("");
    setBusquedaActiva(false);
    setMostrarSugerencias(false);
  };

  // Guardar Nuevo Préstamo
  const guardarPrestamo = async () => {
    if (!form.empleado_id || !form.importe_total || !form.descuento_periodo) {
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
        fecha_solicitud: form.fecha_solicitud,
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
      fecha_solicitud: new Date().toISOString().split("T")[0],
    });

    await cargarPrestamos();
  };

  // Actualizar Préstamo (Corregir errores o cambiar descuento global)
  const guardarEdicionPrestamo = async () => {
    const { id, importe_total, saldo_actual, descuento_periodo, observaciones, descuento_semana_actual, omitir_descuento_semana } = editarModal;

    const { error } = await supabase
      .from("prestamos")
      .update({
        importe_total: Number(importe_total),
        saldo_actual: Number(saldo_actual),
        descuento_periodo: Number(descuento_periodo),
        observaciones,
        descuento_semana_actual: descuento_semana_actual !== "" ? Number(descuento_semana_actual) : null,
        omitir_descuento_semana,
      })
      .eq("id", id);

    if (error) {
      alert("Error al actualizar: " + error.message);
      return;
    }

    alert("Préstamo actualizado correctamente.");
    setEditarModal(null);
    await cargarPrestamos();
  };

  // Liquidación con generación de reporte (Descarga de archivo TXT/CSV)
  const liquidarPrestamo = async (prestamo) => {
    const confirmar = window.confirm(`¿Confirmas liquidar el préstamo de ${prestamo.empleados?.nombre_completo}?`);
    if (!confirmar) return;

    const fechaLiquidacion = new Date().toISOString();

    const { error } = await supabase
      .from("prestamos")
      .update({
        estatus: "LIQUIDADO",
        saldo_actual: 0,
        fecha_liquidacion: fechaLiquidacion,
      })
      .eq("id", prestamo.id);

    if (error) {
      alert(error.message);
      return;
    }

    // Obtener pagos del historial para armar el documento final
    const { data: pagos } = await supabase
      .from("historial_prestamos")
      .select("*")
      .eq("prestamo_id", prestamo.id);

    descargarReporteLiquidacion(prestamo, pagos || [], fechaLiquidacion);
    await cargarPrestamos();
  };

  // Función para descargar el archivo de liquidación histórico
  const descargarReporteLiquidacion = (prestamo, pagos, fechaLiquidacion) => {
    let contenido = `=================================================\n`;
    contenido += `       HISTÓRICO DE LIQUIDACIÓN DE PRÉSTAMO      \n`;
    contenido += `=================================================\n\n`;
    contenido += `Empleado: ${prestamo.empleados?.nombre_completo}\n`;
    contenido += `No. Empleado: ${prestamo.empleados?.numero_empleado}\n`;
    contenido += `Fecha de Solicitud: ${prestamo.fecha_solicitud || "N/A"}\n`;
    contenido += `Fecha de Liquidación: ${new Date(fechaLiquidacion).toLocaleString("es-MX")}\n`;
    contenido += `Importe Total Solicitado: $${Number(prestamo.importe_total).toFixed(2)}\n`;
    contenido += `Descuento Semanal Base: $${Number(prestamo.descuento_periodo).toFixed(2)}\n`;
    contenido += `Estatus: LIQUIDADO\n\n`;
    contenido += `-------------------------------------------------\n`;
    contenido += `DETALLE DE PAGOS / ABONOS REGISTRADOS:\n`;
    contenido += `-------------------------------------------------\n`;

    if (pagos.length === 0) {
      contenido += `No se registraron abonos individuales. Se liquidó manualmente.\n`;
    } else {
      pagos.forEach((p, idx) => {
        contenido += `${idx + 1}. Fecha: ${new Date(p.created_at).toLocaleDateString("es-MX")} | Monto: $${Number(p.monto).toFixed(2)} | Concepto: ${p.concepto || "Abono Nómina"}\n`;
      });
    }

    contenido += `\n=================================================\n`;

    const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Liquidacion_${prestamo.empleados?.nombre_completo.replace(/\s+/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const verHistorialDetallado = async (prestamo) => {
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

  // Métricas
  const activos = prestamos.filter((p) => p.estatus === "ACTIVO").length;
  const liquidados = prestamos.filter((p) => p.estatus === "LIQUIDADO").length;
  const totalPrestado = prestamos.reduce((a, b) => a + Number(b.importe_total || 0), 0);
  const saldoPendiente = prestamos.reduce((a, b) => a + Number(b.saldo_actual || 0), 0);

  return (
    <Layout>
      <div>
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">💳 Préstamos</h1>
            <p className="text-gray-500 mt-2">
              Administración y control de retenciones a empleados
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="💳" color="text-blue-600" />
          <KpiCard titulo="Liquidados" valor={liquidados} icono="✅" color="text-green-600" />
          <KpiCard titulo="Total Prestado" valor={`$${totalPrestado.toLocaleString("es-MX")}`} icono="💰" color="text-emerald-600" />
          <KpiCard titulo="Saldo Pendiente" valor={`$${saldoPendiente.toLocaleString("es-MX")}`} icono="📉" color="text-red-600" />
        </div>

        {/* BUSCADOR CON AUTOCOMPLETE */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-3 text-slate-700">
            🔎 Buscar Préstamo e Historial por Empleado
          </h2>
          <div className="flex flex-col md:flex-row gap-3 relative">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Escribe el nombre o número de empleado..."
                value={busquedaTexto}
                onChange={(e) => {
                  setBusquedaTexto(e.target.value);
                  setEmpleadoSeleccionadoId("");
                  setMostrarSugerencias(true);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                className="border rounded-xl p-3 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {mostrarSugerencias && busquedaTexto.trim() !== "" && (
                <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-lg max-h-56 overflow-y-auto">
                  {sugerenciasEmpleados.length === 0 ? (
                    <li className="p-3 text-gray-400 text-sm">No se encontraron empleados</li>
                  ) : (
                    sugerenciasEmpleados.map((emp) => (
                      <li
                        key={emp.id}
                        onClick={() => seleccionarEmpleadoBuscador(emp)}
                        className="p-3 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 flex justify-between items-center"
                      >
                        <span className="font-medium">{emp.nombre_completo}</span>
                        <span className="text-xs text-gray-400">#{emp.numero_empleado}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <button
              onClick={buscarPrestamoEmpleado}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium"
            >
              Buscar
            </button>

            {(busquedaActiva || busquedaTexto !== "") && (
              <button onClick={limpiarBusqueda} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-xl">
                Limpiar Filtro
              </button>
            )}
          </div>
        </div>

        {/* FORMULARIO NUEVO PRÉSTAMO */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Nuevo Préstamo</h2>

          <div className="grid md:grid-cols-3 gap-4">
            <select
              value={form.empleado_id}
              onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}
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
              type="date"
              value={form.fecha_solicitud}
              onChange={(e) => setForm({ ...form, fecha_solicitud: e.target.value })}
              className="border rounded-xl p-3"
            />

            <input
              type="number"
              step="0.01"
              placeholder="Importe Total"
              value={form.importe_total}
              onChange={(e) => setForm({ ...form, importe_total: e.target.value })}
              className="border rounded-xl p-3"
            />

            <input
              type="number"
              step="0.01"
              placeholder="Descuento Semanal Base"
              value={form.descuento_periodo}
              onChange={(e) => setForm({ ...form, descuento_periodo: e.target.value })}
              className="border rounded-xl p-3"
            />

            <input
              type="text"
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="border rounded-xl p-3 md:col-span-2"
            />
          </div>

          <button
            onClick={guardarPrestamo}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium"
          >
            Guardar Préstamo
          </button>
        </div>

        {/* CONTROLES Y TABLA DE PRÉSTAMOS */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            {/* SELECCIÓN ACTUALES vs HISTÓRICO */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setFiltroEstatus("ACTIVO")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filtroEstatus === "ACTIVO" ? "bg-white text-blue-600 shadow" : "text-gray-500"
                }`}
              >
                Préstamos Activos
              </button>
              <button
                onClick={() => setFiltroEstatus("LIQUIDADO")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filtroEstatus === "LIQUIDADO" ? "bg-white text-green-600 shadow" : "text-gray-500"
                }`}
              >
                Histórico (Liquidados)
              </button>
              <button
                onClick={() => setFiltroEstatus("TODOS")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filtroEstatus === "TODOS" ? "bg-white text-slate-800 shadow" : "text-gray-500"
                }`}
              >
                Todos
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-4 text-left">Empleado</th>
                  <th className="p-4 text-center">F. Solicitud</th>
                  <th className="p-4 text-right">Monto</th>
                  <th className="p-4 text-right">Saldo</th>
                  <th className="p-4 text-right">Dcto. Base</th>
                  <th className="p-4 text-center">Dcto. Esta Semana</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {prestamosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-6 text-center text-gray-500">
                      No se encontraron registros con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  prestamosFiltrados.map((prestamo) => {
                    // Cálculo dinámico de lo que se descontará esta semana
                    let descuentoAplica = `$${Number(prestamo.descuento_periodo).toFixed(2)}`;
                    let badgeAplica = null;

                    if (prestamo.omitir_descuento_semana) {
                      descuentoAplica = "$0.00";
                      badgeAplica = <span className="block text-xs text-red-500 font-bold">(Suspendido)</span>;
                    } else if (prestamo.descuento_semana_actual !== null && prestamo.descuento_semana_actual !== undefined) {
                      descuentoAplica = `$${Number(prestamo.descuento_semana_actual).toFixed(2)}`;
                      badgeAplica = <span className="block text-xs text-blue-500 font-bold">(Ajustado)</span>;
                    }

                    return (
                      <tr key={prestamo.id} className="border-t hover:bg-slate-50">
                        <td className="p-4 font-medium">{prestamo.empleados?.nombre_completo}</td>
                        <td className="p-4 text-center text-sm">{prestamo.fecha_solicitud || "—"}</td>
                        <td className="p-4 text-right">${Number(prestamo.importe_total).toFixed(2)}</td>
                        <td className="p-4 text-right font-bold">${Number(prestamo.saldo_actual).toFixed(2)}</td>
                        <td className="p-4 text-right">${Number(prestamo.descuento_periodo).toFixed(2)}</td>
                        <td className="p-4 text-center">
                          {descuentoAplica}
                          {badgeAplica}
                        </td>
                        <td className="p-4 text-center">
                          {prestamo.estatus === "ACTIVO" ? (
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">ACTIVO</span>
                          ) : (
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">LIQUIDADO</span>
                          )}
                        </td>
                        <td className="p-4 text-center flex justify-center gap-2">
                          <button
                            onClick={() => verHistorialDetallado(prestamo)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-medium"
                          >
                            📜 Detalle
                          </button>

                          <button
                            onClick={() => setEditarModal(prestamo)}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-medium"
                          >
                            ✏️ Editar / Ajustar
                          </button>

                          {prestamo.estatus === "ACTIVO" && (
                            <button
                              onClick={() => liquidarPrestamo(prestamo)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium"
                            >
                              Liquidar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL DE EDICIÓN Y AJUSTE SEMANAL */}
        {editarModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  Editar Préstamo - {editarModal.empleados?.nombre_completo}
                </h3>
                <button onClick={() => setEditarModal(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div className="border-b pb-3">
                  <h4 className="font-semibold text-slate-700 mb-2">1. Corrección de Parámetros Globales</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Monto Original Solicitado</label>
                      <input
                        type="number"
                        value={editarModal.importe_total}
                        onChange={(e) => setEditarModal({ ...editarModal, importe_total: e.target.value })}
                        className="border rounded-xl p-2 w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Saldo Pendiente Actual</label>
                      <input
                        type="number"
                        value={editarModal.saldo_actual}
                        onChange={(e) => setEditarModal({ ...editarModal, saldo_actual: e.target.value })}
                        className="border rounded-xl p-2 w-full"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Descuento Semanal por Defecto (Base)</label>
                      <input
                        type="number"
                        value={editarModal.descuento_periodo}
                        onChange={(e) => setEditarModal({ ...editarModal, descuento_periodo: e.target.value })}
                        className="border rounded-xl p-2 w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* OPCIÓN DE DESCUENTO O PARO EN LA SEMANA ESPECÍFICA */}
                <div className="bg-blue-50 p-4 rounded-xl space-y-3">
                  <h4 className="font-semibold text-blue-900">2. Excepción para la Nómina de la Semana Actual</h4>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editarModal.omitir_descuento_semana || false}
                      onChange={(e) =>
                        setEditarModal({
                          ...editarModal,
                          omitir_descuento_semana: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-slate-800 font-medium">🚫 NO descontar este préstamo en la nómina de esta semana</span>
                  </label>

                  {!editarModal.omitir_descuento_semana && (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Descuento especial solo para esta semana (Dejar vacío para usar base: ${editarModal.descuento_periodo})
                      </label>
                      <input
                        type="number"
                        placeholder={`Ej. ${editarModal.descuento_periodo}`}
                        value={editarModal.descuento_semana_actual ?? ""}
                        onChange={(e) => setEditarModal({ ...editarModal, descuento_semana_actual: e.target.value })}
                        className="border rounded-xl p-2 w-full bg-white"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Observaciones</label>
                  <textarea
                    value={editarModal.observaciones || ""}
                    onChange={(e) => setEditarModal({ ...editarModal, observaciones: e.target.value })}
                    className="border rounded-xl p-2 w-full"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setEditarModal(null)} className="px-4 py-2 border rounded-xl text-gray-600">
                  Cancelar
                </button>
                <button onClick={guardarEdicionPrestamo} className="px-5 py-2 bg-blue-600 text-white rounded-xl font-medium">
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL HISTORIAL COMPLETO */}
        {historialModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  Historial de Préstamo - {historialModal.prestamo.empleados?.nombre_completo}
                </h3>
                <button onClick={() => setHistorialModal(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl mb-4 grid grid-cols-2 gap-2 text-sm">
                <div><strong>Fecha de Solicitud:</strong> {historialModal.prestamo.fecha_solicitud || "N/A"}</div>
                <div><strong>Estatus:</strong> {historialModal.prestamo.estatus}</div>
                <div><strong>Monto Total:</strong> ${Number(historialModal.prestamo.importe_total).toFixed(2)}</div>
                <div><strong>Saldo Pendiente:</strong> ${Number(historialModal.prestamo.saldo_actual).toFixed(2)}</div>
                <div><strong>Descuento Semanal Base:</strong> ${Number(historialModal.prestamo.descuento_periodo).toFixed(2)}</div>
                {historialModal.prestamo.fecha_liquidacion && (
                  <div><strong>Fecha Liquidación:</strong> {new Date(historialModal.prestamo.fecha_liquidacion).toLocaleDateString()}</div>
                )}
              </div>

              <h4 className="font-bold mb-2">Abonos / Pagos Registrados</h4>

              <div className="max-h-60 overflow-y-auto border rounded-xl">
                {historialModal.pagos.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">No hay registro detallado de abonos individuales aún.</p>
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
                          <td className="p-2">{new Date(pago.created_at).toLocaleDateString()}</td>
                          <td className="p-2 text-right">${pago.monto}</td>
                          <td className="p-2">{pago.concepto || "Abono"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-6 flex justify-between">
                {historialModal.prestamo.estatus === "LIQUIDADO" ? (
                  <button
                    onClick={() => descargarReporteLiquidacion(historialModal.prestamo, historialModal.pagos, historialModal.prestamo.fecha_liquidacion)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
                  >
                    📥 Descargar Reporte de Liquidación
                  </button>
                ) : <div />}

                <button onClick={() => setHistorialModal(null)} className="bg-slate-800 text-white px-5 py-2 rounded-xl">
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