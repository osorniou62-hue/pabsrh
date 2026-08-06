import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [vacacionesFiltradas, setVacacionesFiltradas] = useState([]);

  // Búsqueda Inteligente (Autocomplete por Nombre / Número)
  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);

  // Modales
  const [historialModal, setHistorialModal] = useState(null);
  const [modalConfigVacaciones, setModalConfigVacaciones] = useState(null);

  // Formulario Configuración de Días por Año
  const [anoSeleccionado, setAnoSeleccionado] = useState(1);
  const [diasAsignadosInput, setDiasAsignadosInput] = useState("");

  // Formulario Solicitud
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

  useEffect(() => {
    aplicarFiltroEmpleado();
  }, [empleadoSeleccionadoId, busquedaActiva, vacaciones]);

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
          id,
          nombre_completo,
          numero_empleado,
          fecha_ingreso,
          dias_vacaciones_por_ano
        )
      `)
      .order("created_at", { ascending: false });

    setVacaciones(data || []);
    setVacacionesFiltradas(data || []);
  };

  // Cálculo de Antigüedad basada en 365 días por año
  const calcularAntiguedad = (fechaIngresoStr) => {
    if (!fechaIngresoStr) return { anosCumplidos: 0, diasTranscurridos: 0, texto: "Sin fecha de ingreso" };

    const fechaIngreso = new Date(fechaIngresoStr);
    const hoy = new Date();
    const diferenciaMs = hoy - fechaIngreso;
    
    if (diferenciaMs < 0) return { anosCumplidos: 0, diasTranscurridos: 0, texto: "0 Años (Ingreso Futuro)" };

    const diasTranscurridos = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
    const anosCumplidos = Math.floor(diasTranscurridos / 365);

    return {
      anosCumplidos,
      diasTranscurridos,
      texto: anosCumplidos === 0 ? "Año en curso (< 1 año)" : `${anosCumplidos} año(s) cumplido(s)`,
    };
  };

  // Obtener días correspondientes según el año cumplido
  const obtenerDiasDisponiblesAnual = (empleado) => {
    const { anosCumplidos } = calcularAntiguedad(empleado?.fecha_ingreso);
    const mapaDias = empleado?.dias_vacaciones_por_ano || {};
    return Number(mapaDias[anosCumplidos] || 0);
  };

  // Búsqueda Autocomplete
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

  const aplicarFiltroEmpleado = () => {
    if (!busquedaActiva || !empleadoSeleccionadoId) {
      setVacacionesFiltradas(vacaciones);
      return;
    }
    const filtrados = vacaciones.filter(
      (v) => String(v.empleado_id) === String(empleadoSeleccionadoId)
    );
    setVacacionesFiltradas(filtrados);
  };

  const ejecutarBusqueda = () => {
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

  // Guardar Días por Año en Empleado
  const guardarDiasPorAno = async () => {
    if (diasAsignadosInput === "" || Number(diasAsignadosInput) < 0) {
      alert("Ingresa una cantidad válida de días.");
      return;
    }

    const mapaActual = modalConfigVacaciones.dias_vacaciones_por_ano || {};
    const nuevoMapa = {
      ...mapaActual,
      [anoSeleccionado]: Number(diasAsignadosInput),
    };

    const { error } = await supabase
      .from("empleados")
      .update({ dias_vacaciones_por_ano: nuevoMapa })
      .eq("id", modalConfigVacaciones.id);

    if (error) {
      alert("Error al actualizar días: " + error.message);
      return;
    }

    alert(`Se asignaron ${diasAsignadosInput} días para el Año ${anoSeleccionado}`);
    setModalConfigVacaciones({ ...modalConfigVacaciones, dias_vacaciones_por_ano: nuevoMapa });
    await cargarEmpleados();
    await cargarVacaciones();
  };

  const guardarVacaciones = async () => {
    if (
      !form.empleado_id ||
      !form.fecha_inicio ||
      !form.fecha_fin ||
      !form.dias_solicitados
    ) {
      alert("Completa todos los campos requeridos.");
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

  const verHistorialDetallado = async (vacacion) => {
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

  // KPIs
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
            Administración y control de vacaciones con antigüedad y configuración anual
          </p>
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard titulo="Pendientes" valor={pendientes} icono="⏳" color="text-amber-600" />
          <KpiCard titulo="Aprobadas" valor={aprobadas} icono="✅" color="text-green-600" />
          <KpiCard titulo="Rechazadas" valor={rechazadas} icono="❌" color="text-red-600" />
          <KpiCard titulo="Días Aprobados" valor={totalDiasOtorgados} icono="🗓️" color="text-blue-600" />
        </div>

        {/* BUSCADOR AUTOCOMPLETE */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-3 text-slate-700">
            🔎 Buscar Empleado por Nombre o Número
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
              onClick={ejecutarBusqueda}
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

        {/* DETALLE INFORMACIÓN DE EMPLEADOS Y ASIGNACIÓN DE DÍAS */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">⚙️ Información y Configuración de Días por Empleado</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Empleado</th>
                  <th className="p-3 text-center">F. Ingreso</th>
                  <th className="p-3 text-center">Antigüedad (Días)</th>
                  <th className="p-3 text-center">Años Cumplidos</th>
                  <th className="p-3 text-center">Días Asignados Año Actual</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {empleados
                  .filter((e) => !empleadoSeleccionadoId || String(e.id) === String(empleadoSeleccionadoId))
                  .map((emp) => {
                    const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
                    const diasCorrespondientes = obtenerDiasDisponiblesAnual(emp);

                    return (
                      <tr key={emp.id} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">
                          {emp.nombre_completo} <span className="text-xs text-gray-400">(#{emp.numero_empleado})</span>
                        </td>
                        <td className="p-3 text-center">{emp.fecha_ingreso || "No registrada"}</td>
                        <td className="p-3 text-center">{antiguedad.diasTranscurridos} días</td>
                        <td className="p-3 text-center font-bold text-blue-600">{antiguedad.texto}</td>
                        <td className="p-3 text-center">
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full">
                            {diasCorrespondientes} días
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              setModalConfigVacaciones(emp);
                              setAnoSeleccionado(antiguedad.anosCumplidos);
                              setDiasAsignadosInput(emp.dias_vacaciones_por_ano?.[antiguedad.anosCumplidos] || "");
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold"
                          >
                            ⚙️ Ajustar Días / Año
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMULARIO NUEVA SOLICITUD DE VACACIONES */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Nueva Solicitud de Vacaciones</h2>

          <div className="grid md:grid-cols-2 gap-4">
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
              type="number"
              placeholder="Días Solicitados"
              value={form.dias_solicitados}
              onChange={(e) => setForm({ ...form, dias_solicitados: e.target.value })}
              className="border rounded-xl p-3"
            />

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Fecha de Inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="border rounded-xl p-3"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Fecha de Fin</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className="border rounded-xl p-3"
              />
            </div>

            <textarea
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
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
                    <td className="p-4 font-medium">{vacacion.empleados?.nombre_completo}</td>
                    <td className="p-4 text-center text-sm text-gray-600">
                      {vacacion.fecha_inicio} al {vacacion.fecha_fin}
                    </td>
                    <td className="p-4 text-center font-semibold">{vacacion.dias_solicitados}</td>
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
                            onClick={() => cambiarEstatusVacacion(vacacion, "APROBADO")}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => cambiarEstatusVacacion(vacacion, "RECHAZADO")}
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

        {/* MODAL PARA CONFIGURAR DÍAS MANUALMENTE POR AÑO */}
        {modalConfigVacaciones && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">
                  Asignar Días - {modalConfigVacaciones.nombre_completo}
                </h3>
                <button
                  onClick={() => setModalConfigVacaciones(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Seleccionar Año de Antigüedad (0 a 50)
                  </label>
                  <select
                    value={anoSeleccionado}
                    onChange={(e) => {
                      const a = Number(e.target.value);
                      setAnoSeleccionado(a);
                      setDiasAsignadosInput(modalConfigVacaciones.dias_vacaciones_por_ano?.[a] || "");
                    }}
                    className="border rounded-xl p-3 w-full bg-slate-50"
                  >
                    {Array.from({ length: 51 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? "Año 0 (Año en curso / < 365 días)" : `Año ${i} cumplido`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Cantidad de Días de Vacaciones Asignados
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 12"
                    value={diasAsignadosInput}
                    onChange={(e) => setDiasAsignadosInput(e.target.value)}
                    className="border rounded-xl p-3 w-full"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalConfigVacaciones(null)}
                  className="px-4 py-2 border rounded-xl text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarDiasPorAno}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl font-medium"
                >
                  Guardar Asignación
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL HISTORIAL DE SOLICITUD */}
        {historialModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  Historial de Vacaciones - {historialModal.vacacion.empleados?.nombre_completo}
                </h3>
                <button
                  onClick={() => setHistorialModal(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl mb-4 grid grid-cols-2 gap-2 text-sm">
                <div><strong>Fecha Inicio:</strong> {historialModal.vacacion.fecha_inicio}</div>
                <div><strong>Fecha Fin:</strong> {historialModal.vacacion.fecha_fin}</div>
                <div><strong>Días Solicitados:</strong> {historialModal.vacacion.dias_solicitados}</div>
                <div><strong>Estatus Actual:</strong> {historialModal.vacacion.estatus}</div>
                {historialModal.vacacion.observaciones && (
                  <div className="col-span-2">
                    <strong>Observaciones:</strong> {historialModal.vacacion.observaciones}
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
                          <td className="p-2">{new Date(registro.created_at).toLocaleDateString()}</td>
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