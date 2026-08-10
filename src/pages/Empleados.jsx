import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [puestosLista, setPuestosLista] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estatus, setEstatus] = useState("ACTIVOS");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("TODOS");
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE MODALES ---
  const [modalEdicionRapida, setModalEdicionRapida] = useState({ abierto: false, datos: null });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarPuestos();
    cargarEmpleados();
  }, []);

  const cargarPuestos = async () => {
    try {
      const { data } = await supabase.from("puestos").select("*").order("nombre");
      setPuestosLista(data || []);
    } catch (e) {
      console.error("Error cargando puestos:", e);
    }
  };

  const cargarEmpleados = async () => {
    setLoading(true);

    try {
      // 1. Cargar empleados con departamentos y puestos
      const { data: emps, error } = await supabase
        .from("empleados")
        .select(`
          *,
          departamentos (id, nombre),
          puestos (id, nombre)
        `)
        .order("nombre_completo");

      if (error) throw error;

      // 2. Cargar todos los registros de la tabla relacional empleado_bonos
      const { data: relBonos, error: errorBonos } = await supabase
        .from("empleado_bonos")
        .select(`
          empleado_id,
          monto,
          bonos (id, nombre)
        `);

      if (errorBonos) {
        console.warn("⚠️ Advertencia al consultar empleado_bonos:", errorBonos);
      }

      console.log("🔍 [DEBUG] Empleados crudos:", emps);
      console.log("🔍 [DEBUG] Bonos relacionales crudos:", relBonos);

      // 3. Vincular manualmente los bonos a cada empleado
      const empleadosConBonos = (emps || []).map((emp) => {
        const bonosDelEmp = (relBonos || []).filter((b) => b.empleado_id === emp.id);
        return {
          ...emp,
          empleado_bonos: bonosDelEmp,
        };
      });

      console.log("🔍 [DEBUG] Empleados finales con bonos cruzados:", empleadosConBonos);
      setEmpleados(empleadosConBonos);
    } catch (err) {
      console.error("❌ Error al cargar empleados:", err);
      const fallback = await supabase.from("empleados").select("*").order("nombre_completo");
      setEmpleados(fallback.data || []);
    } finally {
      setLoading(false);
    }
  };

  // --- EXTRACCIÓN DE VALORES DESDE LA TABLA RELACIONAL O COLUMNAS ---
  const obtenerValoresEmpleado = (emp) => {
    if (!emp) {
      return {
        salarioBaseSemanal: 0,
        salarioDiario: 0,
        bonoPuesto: 0,
        bonoPuntualidad: 0,
        bonoAsistencia: 0,
        bonoMultiplicador: 0,
        bonoDesempeno: 0,
        bonoExtra: 0,
        apoyoMedico: 0,
        gratificacionEspecial: 0,
        totalBonos: 0,
      };
    }

    const salarioBaseSemanal = Number(
      emp?.salario_base ?? emp?.sueldo_base ?? emp?.salario_semanal ?? emp?.sueldo_semanal
    ) || 0;

    const salarioDiario = salarioBaseSemanal > 0 ? salarioBaseSemanal / 7 : 0;

    let bonoPuesto = 0;
    let bonoPuntualidad = 0;
    let bonoAsistencia = 0;
    let bonoMultiplicador = 0;
    let bonoDesempeno = 0;
    let bonoExtra = 0;
    let apoyoMedico = 0;
    let gratificacionEspecial = 0;

    if (Array.isArray(emp.empleado_bonos) && emp.empleado_bonos.length > 0) {
      emp.empleado_bonos.forEach((item) => {
        const nombreBono = (item.bonos?.nombre || "").toLowerCase();
        const montoBono = Number(item.monto) || 0;

        if (nombreBono.includes("puesto")) bonoPuesto += montoBono;
        else if (nombreBono.includes("puntualidad")) bonoPuntualidad += montoBono;
        else if (nombreBono.includes("asistencia")) bonoAsistencia += montoBono;
        else if (nombreBono.includes("multiplicador")) bonoMultiplicador += montoBono;
        else if (nombreBono.includes("desempeño") || nombreBono.includes("desempeno")) bonoDesempeno += montoBono;
        else if (nombreBono.includes("extra")) bonoExtra += montoBono;
        else if (nombreBono.includes("medico") || nombreBono.includes("médico")) apoyoMedico += montoBono;
        else if (nombreBono.includes("gratificacion") || nombreBono.includes("gratificación")) gratificacionEspecial += montoBono;
      });
    } else {
      // Respaldo por si los datos están directamente en las columnas de la tabla empleados
      bonoPuesto = Number(emp?.bono_puesto) || 0;
      bonoPuntualidad = Number(emp?.bono_puntualidad) || 0;
      bonoAsistencia = Number(emp?.bono_asistencia) || 0;
      bonoMultiplicador = Number(emp?.bono_multiplicador) || 0;
      bonoDesempeno = Number(emp?.bono_desempeno || emp?.bono_desempeño) || 0;
      bonoExtra = Number(emp?.bono_extra) || 0;
      apoyoMedico = Number(emp?.apoyo_medico) || 0;
      gratificacionEspecial = Number(emp?.gratificacion_especial) || 0;
    }

    const totalBonos =
      bonoPuesto +
      bonoPuntualidad +
      bonoAsistencia +
      bonoMultiplicador +
      bonoDesempeno +
      bonoExtra +
      apoyoMedico +
      gratificacionEspecial;

    return {
      salarioBaseSemanal,
      salarioDiario,
      bonoPuesto,
      bonoPuntualidad,
      bonoAsistencia,
      bonoMultiplicador,
      bonoDesempeno,
      bonoExtra,
      apoyoMedico,
      gratificacionEspecial,
      totalBonos,
    };
  };

  // --- MÉTODOS DE EDICIÓN RÁPIDA ---
  const guardarEdicionRapida = async (e) => {
    e.preventDefault();
    if (!modalEdicionRapida.datos) return;

    setGuardando(true);
    const d = modalEdicionRapida.datos;

    const { error } = await supabase
      .from("empleados")
      .update({
        puesto_id: d.puesto_id || null,
        activo: Boolean(d.activo),
        salario_base: Number(d.salario_base) || 0,
        sueldo_base: Number(d.salario_base) || 0,
        fecha_baja: d.activo ? null : (d.fecha_baja || new Date().toISOString().split("T")[0]),
      })
      .eq("id", d.id);

    setGuardando(false);

    if (error) {
      alert("Error al actualizar empleado: " + error.message);
    } else {
      setModalEdicionRapida({ abierto: false, datos: null });
      cargarEmpleados();
    }
  };

  // --- FILTROS DE TABLA ---
  const departamentos = [
    "TODOS",
    ...new Set(empleados.map((e) => e?.departamentos?.nombre).filter(Boolean)),
  ].sort();

  const empleadosFiltrados = empleados.filter((empleado) => {
    if (!empleado) return false;
    const texto = busqueda.toLowerCase().trim();

    const coincideBusqueda =
      (empleado.nombre_completo || "").toLowerCase().includes(texto) ||
      (empleado.numero_empleado || "").toString().toLowerCase().includes(texto) ||
      (empleado.departamentos?.nombre || "").toLowerCase().includes(texto) ||
      (empleado.puestos?.nombre || "").toLowerCase().includes(texto);

    let coincideEstatus = true;
    if (estatus === "ACTIVOS") coincideEstatus = Boolean(empleado.activo);
    if (estatus === "BAJAS") coincideEstatus = !empleado.activo;

    const coincideDepartamento =
      departamentoFiltro === "TODOS" || empleado.departamentos?.nombre === departamentoFiltro;

    return coincideBusqueda && coincideEstatus && coincideDepartamento;
  });

  const total = empleados.length;
  const activos = empleados.filter((e) => e?.activo).length;
  const bajas = empleados.filter((e) => !e?.activo).length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">👥 Empleados</h1>
            <p className="text-gray-500 mt-2">
              Gestión de empleados, sueldo base semanal y desglose exacto de bonos de nómina
            </p>
          </div>

          <div className="flex gap-3 mt-4 md:mt-0">
            <Link
              to="/empleados/importar"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm"
            >
              📥 Importar Excel/CSV
            </Link>
            <Link
              to="/empleados/nuevo"
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm"
            >
              + Nuevo Empleado
            </Link>
          </div>
        </div>

        {/* METRICAS KPI */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Total" valor={total} icono="👥" color="text-blue-600" />
        </div>

        {/* FILTROS */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="🔍 Buscar nombre, número, departamento o puesto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />

            <select
              value={estatus}
              onChange={(e) => setEstatus(e.target.value)}
              className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ACTIVOS">Activos</option>
              <option value="BAJAS">Bajas</option>
              <option value="TODOS">Todos</option>
            </select>

            <select
              value={departamentoFiltro}
              onChange={(e) => setDepartamentoFiltro(e.target.value)}
              className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {departamentos.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 text-gray-600 font-medium">
          Mostrando <strong>{empleadosFiltrados.length}</strong> empleados
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 text-gray-700 font-bold border-b">
              <tr>
                <th className="p-3">No.</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Departamento</th>
                <th className="p-3">Puesto</th>
                <th className="p-3 text-right bg-blue-50 text-blue-900">Sueldo Base</th>
                <th className="p-3 text-right bg-indigo-50 text-indigo-900">Sueldo Diario</th>

                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Puesto</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Puntualidad</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Asistencia</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Multiplicador</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Desempeño</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Bono Extra</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Apoyo Médico</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-800">Gratificación Esp.</th>

                <th className="p-3 text-right bg-emerald-100 text-emerald-900 font-black">
                  Total Bonos
                </th>
                <th className="p-3 text-center">Estatus</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={17} className="p-6 text-center text-gray-500">
                    Cargando lista de empleados...
                  </td>
                </tr>
              )}

              {!loading &&
                empleadosFiltrados.map((empleado) => {
                  const {
                    salarioBaseSemanal,
                    salarioDiario,
                    bonoPuesto,
                    bonoPuntualidad,
                    bonoAsistencia,
                    bonoMultiplicador,
                    bonoDesempeno,
                    bonoExtra,
                    apoyoMedico,
                    gratificacionEspecial,
                    totalBonos,
                  } = obtenerValoresEmpleado(empleado);

                  return (
                    <tr key={empleado.id} className="border-t hover:bg-slate-50 transition">
                      <td className="p-3 font-mono">{empleado.numero_empleado || "S/N"}</td>
                      <td className="p-3 font-semibold text-gray-800">
                        {empleado.nombre_completo || "Sin nombre"}
                      </td>
                      <td className="p-3">{empleado.departamentos?.nombre || "N/A"}</td>
                      <td className="p-3">{empleado.puestos?.nombre || "Sin Asignar"}</td>

                      <td className="p-3 text-right font-bold text-gray-800 bg-blue-50/40">
                        {salarioBaseSemanal > 0 ? (
                          `$${salarioBaseSemanal.toFixed(2)}`
                        ) : (
                          <span className="text-amber-600 font-normal">$0.00</span>
                        )}
                      </td>

                      <td className="p-3 text-right font-bold text-indigo-900 bg-indigo-50/40">
                        {salarioDiario > 0 ? (
                          `$${salarioDiario.toFixed(2)}`
                        ) : (
                          <span className="text-amber-600 font-normal">$0.00</span>
                        )}
                      </td>

                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoPuesto.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoPuntualidad.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoAsistencia.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoMultiplicador.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoDesempeno.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${bonoExtra.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${apoyoMedico.toFixed(2)}</td>
                      <td className="p-3 text-right text-gray-700 bg-emerald-50/20">${gratificacionEspecial.toFixed(2)}</td>

                      <td className="p-3 text-right bg-emerald-100/50 font-black text-emerald-900">
                        ${totalBonos.toFixed(2)}
                      </td>

                      <td className="p-3 text-center">
                        {empleado.activo ? (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
                            Activo
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
                            Baja
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={() =>
                              setModalEdicionRapida({
                                abierto: true,
                                datos: {
                                  id: empleado.id,
                                  nombre_completo: empleado.nombre_completo,
                                  puesto_id: empleado.puesto_id || "",
                                  activo: empleado.activo,
                                  salario_base: salarioBaseSemanal,
                                },
                              })
                            }
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg font-semibold text-xs"
                          >
                            ✏️ Editar
                          </button>

                          <Link
                            to={`/empleados/detalle/${empleado.id}`}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg font-semibold text-xs"
                          >
                            Ver
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && empleadosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={17} className="p-6 text-center text-gray-500">
                    No se encontraron empleados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL EDICIÓN RÁPIDA DE SUELDO Y PUESTO */}
      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={guardarEdicionRapida}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
          >
            <div className="border-b pb-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                ✏️ Editar Puesto y Sueldo Base Semanal
              </h3>
              <button
                type="button"
                onClick={() => setModalEdicionRapida({ abierto: false, datos: null })}
                className="text-gray-400 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Empleado:{" "}
              <strong className="text-gray-800">
                {modalEdicionRapida.datos?.nombre_completo || "S/D"}
              </strong>
            </p>

            <div className="space-y-4 text-xs md:text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Puesto</label>
                <select
                  value={modalEdicionRapida.datos?.puesto_id || ""}
                  onChange={(e) =>
                    setModalEdicionRapida({
                      ...modalEdicionRapida,
                      datos: { ...modalEdicionRapida.datos, puesto_id: e.target.value },
                    })
                  }
                  className="w-full border p-2.5 rounded-lg outline-none"
                >
                  <option value="">-- Seleccionar Puesto --</option>
                  {puestosLista.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Estatus</label>
                <select
                  value={modalEdicionRapida.datos?.activo ? "ACTIVO" : "INACTIVO"}
                  onChange={(e) =>
                    setModalEdicionRapida({
                      ...modalEdicionRapida,
                      datos: {
                        ...modalEdicionRapida.datos,
                        activo: e.target.value === "ACTIVO",
                      },
                    })
                  }
                  className="w-full border p-2.5 rounded-lg outline-none"
                >
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Baja / Inactivo</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Sueldo Base Semanal ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={modalEdicionRapida.datos?.salario_base ?? 0}
                  onChange={(e) =>
                    setModalEdicionRapida({
                      ...modalEdicionRapida,
                      datos: { ...modalEdicionRapida.datos, salario_base: e.target.value },
                    })
                  }
                  className="w-full border p-2.5 rounded-lg font-bold text-green-700 outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  * Sueldo diario calculado (/7 días):{" "}
                  <strong>
                    ${((Number(modalEdicionRapida.datos?.salario_base) || 0) / 7).toFixed(2)}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setModalEdicionRapida({ abierto: false, datos: null })}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300"
              >
                {guardando ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}