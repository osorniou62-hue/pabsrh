import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useNavigate } from "react-router-dom";

export default function Incidencias() {
  const navigate = useNavigate();

  // --- ESTADOS DE CATÁLOGOS Y DATOS ---
  const [departamentos, setDepartamentos] = useState([]);
  const [empleadosCatalogo, setEmpleadosCatalogo] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [incidencias, setIncidencias] = useState([]);

  // --- ESTADOS DE FILTROS ---
  const [busquedaDepto, setBusquedaDepto] = useState("");
  const [deptoSeleccionado, setDeptoSeleccionado] = useState(null);
  const [supervisorSeleccionado, setSupervisorSeleccionado] = useState("");
  const [mostrarDropdownDepto, setMostrarDropdownDepto] = useState(false);

  // --- ESTADO BUSCADOR POR EMPLEADO ---
  const [busquedaEmpleado, setBusquedaEmpleado] = useState("");
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [mostrarDropdownEmpleado, setMostrarDropdownEmpleado] = useState(false);

  // --- ESTADOS DE MODALES ---
  const [modalPermisos, setModalPermisos] = useState({ abierto: false, datos: null });
  const [modalVacaciones, setModalVacaciones] = useState({ abierto: false, datos: null });
  const [modalRecibo, setModalRecibo] = useState({ abierto: false, datos: null });
  const [modalEdicion, setModalEdicion] = useState({ abierto: false, datos: null });
  const [guardando, setGuardando] = useState(false);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarDepartamentos();
    cargarEmpleadosCatalogo();
    cargarPeriodos();
    cargarIncidencias();
  }, []);

  const cargarDepartamentos = async () => {
    const { data, error } = await supabase.from("departamentos").select("*").order("nombre");
    if (error) console.error("❌ Error al cargar departamentos:", error.message);
    else setDepartamentos(data || []);
  };

  const cargarEmpleadosCatalogo = async () => {
    const { data, error } = await supabase
      .from("empleados")
      .select("id, nombre_completo, departamento_id, supervisor_id, activo")
      .order("nombre_completo");

    if (error) console.error("❌ Error al cargar catálogo de empleados:", error.message);
    else setEmpleadosCatalogo(data || []);
  };

  const cargarPeriodos = async () => {
    const { data, error } = await supabase.from("periodos_nomina").select("*").eq("estatus", "ABIERTO");
    if (error) console.error("❌ Error al cargar periodos:", error.message);
    else setPeriodos(data || []);
  };

  const cargarIncidencias = async () => {
    // Usamos explícitamente los nombres de los FKs confirmados
    const { data, error } = await supabase
      .from("incidencias")
      .select(`
        *,
        empleados!incidencias_empleado_fk ( id, nombre_completo, departamento_id, supervisor_id ),
        periodos_nomina!incidencias_periodo_fk ( descripcion, dias_periodo )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error al cargar incidencias:", error.message);
    } else {
      setIncidencias(data || []);
    }
  };

  // --- DERIVACIÓN DE DATOS (EN MEMORIA) ---
  const supervisoresDisponibles = deptoSeleccionado
    ? empleadosCatalogo.filter((emp) => emp.departamento_id === deptoSeleccionado.id && emp.supervisor_id)
    : [];

  const deptosFiltrados = departamentos.filter((d) =>
    (d.nombre || "").toLowerCase().includes(busquedaDepto.toLowerCase())
  );

  const empleadosBusquedaFiltrados = empleadosCatalogo.filter((e) =>
    (e.nombre_completo || "").toLowerCase().includes(busquedaEmpleado.toLowerCase())
  );

  // --- MANEJO DE SELECCIONES ---
  const handleSeleccionarDepto = (depto) => {
    setBusquedaDepto(depto.nombre);
    setDeptoSeleccionado(depto);
    setSupervisorSeleccionado("");
    setEmpleadoSeleccionado(null);
    setBusquedaEmpleado("");
    setMostrarDropdownDepto(false);
  };

  const handleSeleccionarEmpleadoDirecto = (emp) => {
    setEmpleadoSeleccionado(emp);
    setBusquedaEmpleado(emp.nombre_completo || "");
    setDeptoSeleccionado(null);
    setBusquedaDepto("");
    setSupervisorSeleccionado("");
    setMostrarDropdownEmpleado(false);
  };

  const limpiarFiltros = () => {
    setDeptoSeleccionado(null);
    setBusquedaDepto("");
    setSupervisorSeleccionado("");
    setEmpleadoSeleccionado(null);
    setBusquedaEmpleado("");
  };

  // --- FILTRADO FINAL DE LA TABLA DE INCIDENCIAS ---
  const incidenciasMostrar = incidencias.filter((item) => {
    const emp = item.empleados;
    if (!emp) return false;

    if (empleadoSeleccionado) {
      return String(emp.id) === String(empleadoSeleccionado.id);
    }

    if (supervisorSeleccionado) {
      return String(emp.supervisor_id) === String(supervisorSeleccionado);
    }

    if (deptoSeleccionado) {
      return String(emp.departamento_id) === String(deptoSeleccionado.id);
    }

    return true;
  });

  // --- CÁLCULO FINANCIERO / NÓMINA SEMANAL ---
  const calcularNominaIncidencia = (empleado, incidencia, diasPeriodo = 7) => {
    const salarioMensual = empleado?.salario_mensual || 0;
    const salarioDiario = salarioMensual / 30;
    const valorHora = salarioDiario / 8;

    const hrsReales = Number(incidencia.horas_extra_reales) || Number(incidencia.horas_extra) || 0;
    const pagoHorasExtra = hrsReales * (valorHora * 2);

    const descuentoFaltas = (Number(incidencia.faltas) || 0) * salarioDiario;
    const descuentoRetardos = (Number(incidencia.retardos) || 0) * (valorHora * 0.5);

    const sueldoBaseSemanal = salarioDiario * diasPeriodo;
    const montoFinalSemanal = sueldoBaseSemanal + pagoHorasExtra - descuentoFaltas - descuentoRetardos;

    return {
      salarioDiario,
      sueldoBaseSemanal,
      pagoHorasExtra,
      descuentoFaltas,
      descuentoRetardos,
      montoFinalSemanal: montoFinalSemanal < 0 ? 0 : montoFinalSemanal,
    };
  };

  // --- GUARDAR EDICIÓN DE INCIDENCIA ---
  const guardarEdicion = async (e) => {
    e.preventDefault();
    if (!modalEdicion.datos) return;

    setGuardando(true);
    const { id, horas_extra, horas_extra_reales, retardos, faltas } = modalEdicion.datos;

    const { error } = await supabase
      .from("incidencias")
      .update({
        horas_extra: Number(horas_extra) || 0,
        horas_extra_reales: Number(horas_extra_reales) || 0,
        retardos: Number(retardos) || 0,
        faltas: Number(faltas) || 0,
      })
      .eq("id", id);

    setGuardando(false);

    if (error) {
      alert("Error al actualizar la incidencia: " + error.message);
    } else {
      setModalEdicion({ abierto: false, datos: null });
      cargarIncidencias();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">
        📋 Control de Incidencias y Nómina Semanal
      </h1>

      {/* ================= CONTENEDOR DE BÚSQUEDAS ================= */}
      <div className="space-y-6">
        {/* Bloque 1: Búsqueda por Departamento y Supervisor */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 grid md:grid-cols-2 gap-6">
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              1. Buscar Departamento
            </label>
            <input
              type="text"
              placeholder="Escribe el nombre del departamento..."
              value={busquedaDepto}
              onFocus={() => setMostrarDropdownDepto(true)}
              onChange={(e) => {
                setBusquedaDepto(e.target.value);
                setMostrarDropdownDepto(true);
                if (!e.target.value) {
                  setDeptoSeleccionado(null);
                  setSupervisorSeleccionado("");
                }
              }}
              className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />

            {mostrarDropdownDepto && deptosFiltrados.length > 0 && (
              <ul className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                {deptosFiltrados.map((d) => (
                  <li
                    key={d.id}
                    onMouseDown={() => handleSeleccionarDepto(d)}
                    className="p-2.5 hover:bg-blue-50 cursor-pointer border-b text-sm"
                  >
                    {d.nombre}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              2. Seleccionar Supervisor
            </label>
            <select
              disabled={!deptoSeleccionado}
              value={supervisorSeleccionado}
              onChange={(e) => setSupervisorSeleccionado(e.target.value)}
              className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
            >
              <option value="">
                {!deptoSeleccionado
                  ? "Selecciona primero un departamento"
                  : "Todos los supervisores"}
              </option>
              {supervisoresDisponibles.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.nombre_completo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bloque 2: Búsqueda Directa por Empleado */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              🔍 O Buscar Directamente por Nombre de Empleado ({empleadosCatalogo.length} registrados)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Escribe el nombre del empleado..."
                  value={busquedaEmpleado}
                  onFocus={() => setMostrarDropdownEmpleado(true)}
                  onChange={(e) => {
                    setBusquedaEmpleado(e.target.value);
                    setMostrarDropdownEmpleado(true);
                    if (!e.target.value) setEmpleadoSeleccionado(null);
                  }}
                  className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />

                {mostrarDropdownEmpleado && empleadosBusquedaFiltrados.length > 0 && (
                  <ul className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                    {empleadosBusquedaFiltrados.map((emp) => (
                      <li
                        key={emp.id}
                        onMouseDown={() => handleSeleccionarEmpleadoDirecto(emp)}
                        className="p-2.5 hover:bg-blue-50 cursor-pointer border-b text-sm flex justify-between items-center"
                      >
                        <span>{emp.nombre_completo || "Sin Nombre"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(busquedaEmpleado || deptoSeleccionado || supervisorSeleccionado) && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-gray-300"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DETALLE DEL TRABAJADOR SELECCIONADO */}
      {empleadoSeleccionado && (
        <div className="bg-blue-50 p-5 rounded-xl border border-blue-200 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-blue-900 text-base">
              👤 Detalle del Trabajador Seleccionado:
            </h3>
            <button
              onClick={limpiarFiltros}
              className="text-xs text-red-600 hover:underline font-bold"
            >
              Quitar Filtro
            </button>
          </div>

          <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4 text-xs md:text-sm">
            <div>
              <span className="text-gray-500 block">Nombre del Trabajador:</span>
              <span className="font-bold text-gray-800">{empleadoSeleccionado.nombre_completo}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Salario Mensual:</span>
              <span className="font-semibold text-green-700">
                {empleadoSeleccionado.salario_mensual ? `$${Number(empleadoSeleccionado.salario_mensual).toFixed(2)}` : "No asignado"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Salario Diario (Base):</span>
              <span className="font-semibold text-gray-700">
                {empleadoSeleccionado.salario_mensual ? `$${(Number(empleadoSeleccionado.salario_mensual) / 30).toFixed(2)}` : "N/A"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================= TABLA PRINCIPAL DE INCIDENCIAS ================= */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 overflow-x-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-800">
          Historial y Resumen de Ajustes ({incidenciasMostrar.length} registros)
        </h2>

        <table className="w-full text-left border-collapse text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-100 border-b text-gray-700 font-bold">
              <th className="p-3 border">Empleado</th>
              <th className="p-3 border">Periodo</th>
              <th className="p-3 border text-center">Hrs Extra Rep.</th>
              <th className="p-3 border text-center">Hrs Extra Real</th>
              <th className="p-3 border text-center">Retardos</th>
              <th className="p-3 border text-center">Faltas</th>
              <th className="p-3 border text-right">Monto Hrs Extra</th>
              <th className="p-3 border text-right">Desc. Faltas</th>
              <th className="p-3 border text-center">Permisos</th>
              <th className="p-3 border text-center">Vacaciones</th>
              <th className="p-3 border text-right bg-green-50">Monto Final Semanal</th>
              <th className="p-3 border text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {incidenciasMostrar.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center p-6 text-gray-500">
                  No hay datos de incidencias registrados para el filtro seleccionado.
                </td>
              </tr>
            ) : (
              incidenciasMostrar.map((item) => {
                const tienePermisos = Boolean(item.permisos_detalle || item.permisos > 0);
                const tieneVacaciones = Boolean(item.vacaciones_detalle || item.vacaciones > 0);
                const calculo = calcularNominaIncidencia(item.empleados, item, 7);

                return (
                  <tr key={item.id} className="hover:bg-gray-50 border-b">
                    <td className="p-3 border font-medium">
                      {item.empleados?.nombre_completo || "N/A"}
                    </td>
                    <td className="p-3 border">
                      {item.periodos_nomina?.descripcion || "N/A"}
                    </td>
                    <td className="p-3 border text-center">{item.horas_extra || 0}h</td>
                    <td className="p-3 border text-center font-semibold text-blue-600">
                      {item.horas_extra_reales || item.horas_extra || 0}h
                    </td>
                    <td className="p-3 border text-center">{item.retardos || 0}</td>
                    <td className="p-3 border text-center text-red-600 font-semibold">
                      {item.faltas || 0}d
                    </td>
                    <td className="p-3 border text-right text-green-600 font-medium">
                      +${calculo.pagoHorasExtra.toFixed(2)}
                    </td>
                    <td className="p-3 border text-right text-red-600 font-medium">
                      -${calculo.descuentoFaltas.toFixed(2)}
                    </td>

                    <td className="p-3 border text-center">
                      {tienePermisos ? (
                        <button
                          onClick={() => setModalPermisos({ abierto: true, datos: item })}
                          className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded font-bold text-xs hover:bg-amber-200"
                        >
                          SÍ 👁️
                        </button>
                      ) : (
                        <span className="text-gray-400">NO</span>
                      )}
                    </td>

                    <td className="p-3 border text-center">
                      {tieneVacaciones ? (
                        <button
                          onClick={() => setModalVacaciones({ abierto: true, datos: item })}
                          className="bg-purple-100 text-purple-800 px-2.5 py-1 rounded font-bold text-xs hover:bg-purple-200"
                        >
                          SÍ 🏖️
                        </button>
                      ) : (
                        <span className="text-gray-400">NO</span>
                      )}
                    </td>

                    <td className="p-3 border text-right font-bold bg-green-50 text-green-800 text-base">
                      ${calculo.montoFinalSemanal.toFixed(2)}
                    </td>

                    <td className="p-3 border text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => setModalEdicion({ abierto: true, datos: { ...item } })}
                          className="bg-amber-500 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-amber-600"
                          title="Editar Incidencia"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() =>
                            setModalRecibo({
                              abierto: true,
                              datos: { ...item, calculo },
                            })
                          }
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-blue-700"
                          title="Ver Recibo"
                        >
                          📄
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL EDICIÓN */}
      {modalEdicion.abierto && modalEdicion.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={guardarEdicion}
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2">
              ✏️ Modificar Incidencia
            </h3>
            <p className="text-xs text-gray-500">
              Empleado: <strong>{modalEdicion.datos.empleados?.nombre_completo}</strong>
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Hrs Extra Rep.
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={modalEdicion.datos.horas_extra || 0}
                  onChange={(e) =>
                    setModalEdicion({
                      ...modalEdicion,
                      datos: { ...modalEdicion.datos, horas_extra: e.target.value },
                    })
                  }
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Hrs Extra Real
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={modalEdicion.datos.horas_extra_reales || 0}
                  onChange={(e) =>
                    setModalEdicion({
                      ...modalEdicion,
                      datos: { ...modalEdicion.datos, horas_extra_reales: e.target.value },
                    })
                  }
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Retardos
                </label>
                <input
                  type="number"
                  min="0"
                  value={modalEdicion.datos.retardos || 0}
                  onChange={(e) =>
                    setModalEdicion({
                      ...modalEdicion,
                      datos: { ...modalEdicion.datos, retardos: e.target.value },
                    })
                  }
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Faltas (Días)
                </label>
                <input
                  type="number"
                  min="0"
                  value={modalEdicion.datos.faltas || 0}
                  onChange={(e) =>
                    setModalEdicion({
                      ...modalEdicion,
                      datos: { ...modalEdicion.datos, faltas: e.target.value },
                    })
                  }
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setModalEdicion({ abierto: false, datos: null })}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-xs font-semibold hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="bg-blue-600 text-white px-4 py-2 rounded text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300"
              >
                {guardando ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL PERMISOS */}
      {modalPermisos.abierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2">
              📋 Detalle de Permiso - {modalPermisos.datos?.empleados?.nombre_completo}
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>Periodo:</strong> {modalPermisos.datos?.periodos_nomina?.descripcion}</p>
              <p><strong>Días Totales:</strong> {modalPermisos.datos?.permisos || 1} día(s)</p>
            </div>
            <div className="flex justify-between items-center pt-4 border-t">
              <button
                onClick={() => {
                  setModalPermisos({ abierto: false, datos: null });
                  navigate("/solicitudes");
                }}
                className="bg-gray-800 text-white text-xs px-4 py-2 rounded hover:bg-black font-semibold"
              >
                📜 Ver Historial Completo
              </button>
              <button
                onClick={() => setModalPermisos({ abierto: false, datos: null })}
                className="bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded hover:bg-gray-300 font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VACACIONES */}
      {modalVacaciones.abierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <h3 className="text-lg font-bold text-purple-900 border-b pb-2">
              🏖️ Registro Integrado de Vacaciones
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>Empleado:</strong> {modalVacaciones.datos?.empleados?.nombre_completo}</p>
              <p><strong>Días Solicitados:</strong> {modalVacaciones.datos?.vacaciones} día(s)</p>
            </div>
            <div className="flex justify-between items-center pt-4 border-t">
              <button
                onClick={() => {
                  const empId = modalVacaciones.datos?.empleados?.id;
                  setModalVacaciones({ abierto: false, datos: null });
                  navigate(`/vacaciones?empleado_id=${empId}`);
                }}
                className="bg-purple-700 text-white text-xs px-4 py-2 rounded hover:bg-purple-800 font-semibold"
              >
                ➡️ Ir a Pantalla Vacaciones
              </button>
              <button
                onClick={() => setModalVacaciones({ abierto: false, datos: null })}
                className="bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded hover:bg-gray-300 font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECIBO */}
      {modalRecibo.abierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl relative space-y-4 border-2 border-dashed border-gray-400">
            <div className="bg-amber-100 text-amber-900 text-center text-xs font-bold py-1 rounded">
              ⚠️ VISTA PREVIA / EJEMPLO SIN VALOR OFICIAL
            </div>
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h2 className="font-bold text-lg text-gray-800">RECIBO DE NÓMINA (SEMANAL)</h2>
                <p className="text-xs text-gray-500">Periodo: {modalRecibo.datos?.periodos_nomina?.descripcion}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-bold text-gray-700">EMPRESA S.A. DE C.V.</p>
              </div>
            </div>
            <div className="flex justify-between items-center font-bold text-base pt-2">
              <span>NETO ESTIMADO A PAGAR:</span>
              <span className="text-green-800">${modalRecibo.datos?.calculo?.montoFinalSemanal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setModalRecibo({ abierto: false, datos: null })}
                className="bg-gray-800 text-white text-xs px-5 py-2 rounded hover:bg-black font-semibold"
              >
                Cerrar Vista Previa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}