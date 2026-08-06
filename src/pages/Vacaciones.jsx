import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Vacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [vacacionesFiltradas, setVacacionesFiltradas] = useState([]);

  // Reglas globales
  const [reglasGlobales, setReglasGlobales] = useState({});
  const [anoReglaInput, setAnoReglaInput] = useState(1);
  const [diasReglaInput, setDiasReglaInput] = useState("");

  // Búsqueda Autocomplete
  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState("");
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);

  // Modal Kardex
  const [modalKardexEmpleado, setModalKardexEmpleado] = useState(null);

  // Formulario dentro del Kardex
  const [formKardex, setFormKardex] = useState({
    fecha_inicio: "",
    fecha_fin: "",
    dias_solicitados: "",
    nomina_impactada: "",
    tipo_vacaciones: "TOMADAS_Y_PAGADAS", // 'TOMADAS_Y_PAGADAS' | 'PAGADAS_NO_TOMADAS'
    observaciones: "",
  });

  // Formulario Solicitud General
  const [form, setForm] = useState({
    empleado_id: "",
    fecha_inicio: "",
    fecha_fin: "",
    dias_solicitados: "",
    nomina_impactada: "",
    tipo_vacaciones: "TOMADAS_Y_PAGADAS",
    observaciones: "",
  });

  useEffect(() => {
    cargarReglasGlobales();
    cargarEmpleados();
    cargarVacaciones();
  }, []);

  useEffect(() => {
    aplicarFiltroEmpleado();
  }, [empleadoSeleccionadoId, busquedaActiva, vacaciones]);

  const cargarReglasGlobales = async () => {
    const { data, error } = await supabase.from("regla_vacaciones").select("*");
    if (!error && data) {
      const mapaReglas = {};
      data.forEach((item) => {
        mapaReglas[item.ano] = item.dias;
      });
      setReglasGlobales(mapaReglas);
    }
  };

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
          fecha_ingreso
        )
      `)
      .order("created_at", { ascending: false });

    setVacaciones(data || []);
    setVacacionesFiltradas(data || []);
  };

  const guardarReglaGlobal = async () => {
    if (diasReglaInput === "" || Number(diasReglaInput) < 0) {
      alert("Ingresa una cantidad válida de días.");
      return;
    }

    const ano = Number(anoReglaInput);
    const dias = Number(diasReglaInput);

    const { error } = await supabase
      .from("regla_vacaciones")
      .upsert({ ano, dias }, { onConflict: "ano" });

    if (error) {
      alert("Error al guardar regla: " + error.message);
      return;
    }

    setReglasGlobales((prev) => ({ ...prev, [ano]: dias }));
    setDiasReglaInput("");
    alert(`Regla actualizada: Año ${ano} = ${dias} días de vacaciones.`);
  };

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

  const obtenerDiasCorrespondientes = (fechaIngresoStr) => {
    const { anosCumplidos } = calcularAntiguedad(fechaIngresoStr);
    return Number(reglasGlobales[anosCumplidos] || 0);
  };

  const obtenerResumenEmpleado = (empleadoId, fechaIngresoStr) => {
    const diasCorrespondientes = obtenerDiasCorrespondientes(fechaIngresoStr);

    const solicitudesAprobadas = vacaciones.filter(
      (v) => String(v.empleado_id) === String(empleadoId) && v.estatus === "APROBADO"
    );

    // Ambas modalidades descuentan saldo
    const diasTomados = solicitudesAprobadas.reduce(
      (acc, curr) => acc + Number(curr.dias_solicitados || 0),
      0
    );

    const diasRemanentes = diasCorrespondientes - diasTomados;

    return {
      diasCorrespondientes,
      diasTomados,
      diasRemanentes,
      solicitudesAprobadas,
    };
  };

  // Autocomplete
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

  // Agregar desde el Modal de Kardex
  const agregarDesdeKardex = async () => {
    if (
      !formKardex.fecha_inicio ||
      !formKardex.fecha_fin ||
      !formKardex.dias_solicitados ||
      !formKardex.nomina_impactada
    ) {
      alert("Completa todos los campos obligatorios del registro.");
      return;
    }

    const emp = modalKardexEmpleado.empleado;

    const { error } = await supabase.from("vacaciones").insert([
      {
        empleado_id: emp.id,
        fecha_inicio: formKardex.fecha_inicio,
        fecha_fin: formKardex.fecha_fin,
        dias_solicitados: Number(formKardex.dias_solicitados),
        nomina_impactada: formKardex.nomina_impactada,
        tipo_vacaciones: formKardex.tipo_vacaciones,
        observaciones: formKardex.observaciones,
        estatus: "APROBADO",
      },
    ]);

    if (error) {
      alert("Error al registrar: " + error.message);
      return;
    }

    setFormKardex({
      fecha_inicio: "",
      fecha_fin: "",
      dias_solicitados: "",
      nomina_impactada: "",
      tipo_vacaciones: "TOMADAS_Y_PAGADAS",
      observaciones: "",
    });

    await cargarVacaciones();

    // Recargar datos en el modal
    const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
    const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);
    setModalKardexEmpleado({ empleado: emp, antiguedad, resumen });
  };

  // Guardar solicitud general
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
        nomina_impactada: form.nomina_impactada,
        tipo_vacaciones: form.tipo_vacaciones,
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
      nomina_impactada: "",
      tipo_vacaciones: "TOMADAS_Y_PAGADAS",
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
            Control global de prestaciones, kardex individual y clasificación de nómina
          </p>
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard titulo="Pendientes" valor={pendientes} icono="⏳" color="text-amber-600" />
          <KpiCard titulo="Aprobadas" valor={aprobadas} icono="✅" color="text-green-600" />
          <KpiCard titulo="Rechazadas" valor={rechazadas} icono="❌" color="text-red-600" />
          <KpiCard titulo="Días Descontados Totales" valor={totalDiasOtorgados} icono="🗓️" color="text-blue-600" />
        </div>

        {/* REGLAS GLOBALES DE VACACIONES */}
        <div className="bg-slate-800 text-white rounded-2xl p-6 mb-6 shadow-xl">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            ⚙️ Reglas Globales de Vacaciones por Antigüedad
          </h2>
          <p className="text-xs text-slate-300 mb-4">
            Ajusta aquí cuántos días le corresponden automáticamente a los trabajadores según sus años cumplidos.
          </p>

          <div className="flex flex-col md:flex-row gap-4 items-end mb-4">
            <div>
              <label className="block text-xs mb-1 text-slate-300">Año de Antigüedad</label>
              <select
                value={anoReglaInput}
                onChange={(e) => {
                  const a = Number(e.target.value);
                  setAnoReglaInput(a);
                  setDiasReglaInput(reglasGlobales[a] !== undefined ? reglasGlobales[a] : "");
                }}
                className="border rounded-xl p-2.5 bg-slate-700 text-white w-full md:w-48"
              >
                {Array.from({ length: 51 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "Año 0 (< 1 año)" : `Año ${i} cumplido`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-300">Días Correspondientes</label>
              <input
                type="number"
                placeholder="Ej. 12"
                value={diasReglaInput}
                onChange={(e) => setDiasReglaInput(e.target.value)}
                className="border rounded-xl p-2.5 bg-slate-700 text-white w-full md:w-40"
              />
            </div>

            <button
              onClick={guardarReglaGlobal}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
            >
              Guardar Regla Global
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
            <span className="text-xs text-slate-400 self-center mr-2">Reglas activas:</span>
            {Object.keys(reglasGlobales).length === 0 ? (
              <span className="text-xs text-slate-500">Sin reglas registradas aún.</span>
            ) : (
              Object.entries(reglasGlobales)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([ano, dias]) => (
                  <span key={ano} className="bg-slate-700 text-xs px-2.5 py-1 rounded-lg border border-slate-600">
                    Año {ano}: <strong>{dias} días</strong>
                  </span>
                ))
            )}
          </div>
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

        {/* TABLA DE BALANCE Y ACCESO AL KARDEX */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">👥 Balance e Historial de Vacaciones por Empleado</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Empleado</th>
                  <th className="p-3 text-center">F. Ingreso</th>
                  <th className="p-3 text-center">Antigüedad</th>
                  <th className="p-3 text-center">Días por Ley</th>
                  <th className="p-3 text-center">Días Descontados</th>
                  <th className="p-3 text-center">Días Remanentes</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {empleados
                  .filter((e) => !empleadoSeleccionadoId || String(e.id) === String(empleadoSeleccionadoId))
                  .map((emp) => {
                    const antiguedad = calcularAntiguedad(emp.fecha_ingreso);
                    const resumen = obtenerResumenEmpleado(emp.id, emp.fecha_ingreso);

                    return (
                      <tr key={emp.id} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">
                          {emp.nombre_completo} <span className="text-xs text-gray-400">(#{emp.numero_empleado})</span>
                        </td>
                        <td className="p-3 text-center">{emp.fecha_ingreso || "No registrada"}</td>
                        <td className="p-3 text-center text-slate-600 font-medium">{antiguedad.texto}</td>
                        <td className="p-3 text-center font-semibold text-blue-600">
                          {resumen.diasCorrespondientes} días
                        </td>
                        <td className="p-3 text-center font-semibold text-amber-600">
                          {resumen.diasTomados} días
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`font-bold px-3 py-1 rounded-full ${
                              resumen.diasRemanentes < 0
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {resumen.diasRemanentes} días
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() =>
                              setModalKardexEmpleado({
                                empleado: emp,
                                antiguedad,
                                resumen,
                              })
                            }
                            className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-semibold"
                          >
                            📜 Ver / Capturar Kardex
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
          <h2 className="text-xl font-bold mb-4">Nueva Solicitud / Registro de Vacaciones</h2>

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
              type="number"
              placeholder="Días Solicitados"
              value={form.dias_solicitados}
              onChange={(e) => setForm({ ...form, dias_solicitados: e.target.value })}
              className="border rounded-xl p-3"
            />

            <input
              type="text"
              placeholder="Nómina / Semana Impactada"
              value={form.nomina_impactada}
              onChange={(e) => setForm({ ...form, nomina_impactada: e.target.value })}
              className="border rounded-xl p-3"
            />

            <select
              value={form.tipo_vacaciones}
              onChange={(e) => setForm({ ...form, tipo_vacaciones: e.target.value })}
              className="border rounded-xl p-3 bg-slate-50 font-medium"
            >
              <option value="TOMADAS_Y_PAGADAS">✅ Pagadas y Tomadas</option>
              <option value="PAGADAS_NO_TOMADAS">💰 Pagadas no Tomadas</option>
            </select>

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

            <input
              type="text"
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="border rounded-xl p-3 md:col-span-3"
            />
          </div>

          <button
            onClick={guardarVacaciones}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium"
          >
            Guardar Solicitud
          </button>
        </div>

        {/* TABLA DE SOLICITUDES RECIENTES */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-4 text-left">Empleado</th>
                <th className="p-4 text-center">Periodo</th>
                <th className="p-4 text-center">Días</th>
                <th className="p-4 text-center">Modalidad</th>
                <th className="p-4 text-center">Nómina Impactada</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {vacacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-gray-500">
                    No se encontraron registros de vacaciones.
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
                    <td className="p-4 text-center text-xs">
                      {vacacion.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? (
                        <span className="bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-full">
                          💰 Pagadas No Tomadas
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-full">
                          ✅ Pagadas y Tomadas
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center text-sm font-medium text-slate-700">
                      {vacacion.nomina_impactada || "—"}
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

        {/* MODAL KARDEX CON REGISTRO RÁPIDO */}
        {modalKardexEmpleado && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-6 my-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">
                  📜 Kardex de Vacaciones - {modalKardexEmpleado.empleado.nombre_completo}
                </h3>
                <button
                  onClick={() => setModalKardexEmpleado(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* SALDOS EN KARDEX */}
              <div className="bg-slate-50 p-4 rounded-xl mb-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border border-slate-200">
                <div>
                  <span className="block text-xs text-gray-500">Antigüedad:</span>
                  <strong>{modalKardexEmpleado.antiguedad.texto}</strong>
                </div>
                <div>
                  <span className="block text-xs text-gray-500">Días por Ley:</span>
                  <strong className="text-blue-600">{modalKardexEmpleado.resumen.diasCorrespondientes} días</strong>
                </div>
                <div>
                  <span className="block text-xs text-gray-500">Días Descontados:</span>
                  <strong className="text-amber-600">{modalKardexEmpleado.resumen.diasTomados} días</strong>
                </div>
                <div>
                  <span className="block text-xs text-gray-500">Días Remanentes:</span>
                  <strong className="text-emerald-600">{modalKardexEmpleado.resumen.diasRemanentes} días</strong>
                </div>
              </div>

              {/* FORMULARIO AGREGAR DÍAS HISTÓRICOS AL KARDEX */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <h4 className="font-bold text-blue-900 text-sm mb-3">➕ Registrar Período Tomado / Pagado a este Empleado</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-gray-600 mb-1">Fecha Inicio</label>
                    <input
                      type="date"
                      value={formKardex.fecha_inicio}
                      onChange={(e) => setFormKardex({ ...formKardex, fecha_inicio: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1">Fecha Fin</label>
                    <input
                      type="date"
                      value={formKardex.fecha_fin}
                      onChange={(e) => setFormKardex({ ...formKardex, fecha_fin: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1">Días a Registrar</label>
                    <input
                      type="number"
                      placeholder="Ej. 6"
                      value={formKardex.dias_solicitados}
                      onChange={(e) => setFormKardex({ ...formKardex, dias_solicitados: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1">Nómina / Semana Impactada</label>
                    <input
                      type="text"
                      placeholder="Ej. Sem 12 - 2026"
                      value={formKardex.nomina_impactada}
                      onChange={(e) => setFormKardex({ ...formKardex, nomina_impactada: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1">Modalidad de Vacaciones</label>
                    <select
                      value={formKardex.tipo_vacaciones}
                      onChange={(e) => setFormKardex({ ...formKardex, tipo_vacaciones: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full font-semibold"
                    >
                      <option value="TOMADAS_Y_PAGADAS">✅ Pagadas y Tomadas</option>
                      <option value="PAGADAS_NO_TOMADAS">💰 Pagadas no Tomadas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1">Observaciones</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={formKardex.observaciones}
                      onChange={(e) => setFormKardex({ ...formKardex, observaciones: e.target.value })}
                      className="border rounded-lg p-2 bg-white w-full"
                    />
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <button
                    onClick={agregarDesdeKardex}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-xs"
                  >
                    Guardar Registro en Kardex
                  </button>
                </div>
              </div>

              {/* HISTORIAL DETALLADO DE REGISTROS */}
              <h4 className="font-bold mb-3 text-slate-700">Historial Detallado del Trabajador</h4>

              <div className="max-h-60 overflow-y-auto border rounded-xl">
                {modalKardexEmpleado.resumen.solicitudesAprobadas.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-500">
                    No existen registros en el historial de este empleado.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-3 text-left">Fechas</th>
                        <th className="p-3 text-center">Días</th>
                        <th className="p-3 text-center">Modalidad</th>
                        <th className="p-3 text-center">Nómina Impactada</th>
                        <th className="p-3 text-left">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalKardexEmpleado.resumen.solicitudesAprobadas.map((item) => (
                        <tr key={item.id} className="border-t hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-800">
                            {item.fecha_inicio} al {item.fecha_fin}
                          </td>
                          <td className="p-3 text-center font-bold text-amber-600">
                            {item.dias_solicitados}
                          </td>
                          <td className="p-3 text-center text-xs">
                            {item.tipo_vacaciones === "PAGADAS_NO_TOMADAS" ? (
                              <span className="bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-md">
                                💰 Pagadas No Tomadas
                              </span>
                            ) : (
                              <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-md">
                                ✅ Pagadas y Tomadas
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-medium text-slate-700">
                            {item.nomina_impactada || "—"}
                          </td>
                          <td className="p-3 text-xs text-slate-500">
                            {item.observaciones || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-6 text-right">
                <button
                  onClick={() => setModalKardexEmpleado(null)}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-medium"
                >
                  Cerrar Kardex
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}