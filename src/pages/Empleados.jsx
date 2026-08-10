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
  const [modalBonos, setModalBonos] = useState({ abierto: false, empleado: null, bonos: [] });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarPuestos();
    cargarEmpleados();
  }, []);

  const cargarPuestos = async () => {
    try {
      const { data, error } = await supabase.from("puestos").select("*").order("nombre");
      if (!error) setPuestosLista(data || []);
    } catch (e) {
      console.error("Error cargando puestos:", e);
    }
  };

  const cargarEmpleados = async () => {
    setLoading(true);

    try {
      // Usamos la consulta más segura usando select("*") base
      const { data, error } = await supabase
        .from("empleados")
        .select(`
          *,
          departamentos (*),
          puestos (*),
          empleado_bonos (*)
        `)
        .order("nombre_completo");

      if (error) {
        console.error("❌ Error Supabase:", error.message);
        // Respaldo simple sin relaciones profundas si falla la FK
        const fallback = await supabase.from("empleados").select("*").order("nombre_completo");
        setEmpleados(fallback.data || []);
      } else {
        setEmpleados(data || []);
      }
    } catch (err) {
      console.error("❌ Error crítico al cargar empleados:", err);
      setEmpleados([]);
    } finally {
      setLoading(false);
    }
  };

  // --- CÁLCULOS SEGUROS (CON DEFAULT VALUES) ---
  const obtenerValoresEmpleado = (emp) => {
    if (!emp) return { salarioBaseSemanal: 0, salarioDiario: 0, totalBonos: 0 };

    const salarioBaseSemanal = Number(
      emp?.salario_base ?? 
      emp?.sueldo_base ?? 
      emp?.salario_semanal ?? 
      emp?.sueldo_semanal
    ) || 0;

    // Regla: 7 días de trabajo (6 laborados + 1 descanso)
    const salarioDiario = salarioBaseSemanal > 0 ? salarioBaseSemanal / 7 : 0;

    const listaBonos = Array.isArray(emp?.empleado_bonos) ? emp.empleado_bonos : [];
    const totalBonos = listaBonos.reduce(
      (acc, b) => acc + (Number(b?.monto) || 0),
      0
    );

    return { salarioBaseSemanal, salarioDiario, totalBonos };
  };

  // --- MÉTODOS DE ACCIÓN ---
  const darDeBaja = async (empleado) => {
    if (!empleado) return;
    const confirmar = window.confirm(`¿Deseas dar de baja a ${empleado.nombre_completo}?`);
    if (!confirmar) return;

    const { error } = await supabase
      .from("empleados")
      .update({
        activo: false,
        fecha_baja: new Date().toISOString().split("T")[0],
      })
      .eq("id", empleado.id);

    if (error) alert(error.message);
    else await cargarEmpleados();
  };

  const reactivarEmpleado = async (empleado) => {
    if (!empleado) return;
    const { error } = await supabase
      .from("empleados")
      .update({
        activo: true,
        fecha_baja: null,
      })
      .eq("id", empleado.id);

    if (error) alert(error.message);
    else await cargarEmpleados();
  };

  // --- GUARDAR EDICIÓN RÁPIDA ---
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
        fecha_baja: d.activo ? null : (d.fecha_baja || new Date().toISOString().split("T")[0])
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

  // --- GESTIÓN DE BONOS ---
  const handleCambioMontoBono = (bonoId, nuevoMonto) => {
    const bonosActualizados = (modalBonos.bonos || []).map((b) =>
      b.id === bonoId ? { ...b, monto: nuevoMonto } : b
    );
    setModalBonos({ ...modalBonos, bonos: bonosActualizados });
  };

  const guardarAjusteBonos = async () => {
    setGuardando(true);
    
    for (const bono of modalBonos.bonos || []) {
      await supabase
        .from("empleado_bonos")
        .update({ monto: Number(bono.monto) || 0 })
        .eq("id", bono.id);
    }

    setGuardando(false);
    setModalBonos({ abierto: false, empleado: null, bonos: [] });
    cargarEmpleados();
  };

  // --- FILTRADOS SEGUROS ---
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
      departamentoFiltro === "TODOS" ||
      empleado.departamentos?.nombre === departamentoFiltro;

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
            <h1 className="text-4xl font-bold">👥 Empleados</h1>
            <p className="text-gray-500 mt-2">
              Administración de empleados, salarios y bonos
            </p>
          </div>

          <Link
            to="/empleados/nuevo"
            className="mt-4 md:mt-0 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold"
          >
            + Nuevo Empleado
          </Link>
        </div>

        {/* METRICAS KPI */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Total" valor={total} icono="👥" color="text-blue-600" />
        </div>

        {/* PANEL DE FILTROS */}
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
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-100 text-gray-700 font-bold">
              <tr>
                <th className="p-4">No.</th>
                <th className="p-4">Nombre</th>
                <th className="p-4">Departamento</th>
                <th className="p-4">Puesto</th>
                <th className="p-4 text-right bg-blue-50">Salario Base Semanal</th>
                <th className="p-4 text-right bg-indigo-50">Salario Diario</th>
                <th className="p-4 text-right bg-emerald-50">Bonos</th>
                <th className="p-4 text-center">Estatus</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">
                    Cargando lista de empleados...
                  </td>
                </tr>
              )}

              {!loading &&
                empleadosFiltrados.map((empleado) => {
                  const { salarioBaseSemanal, salarioDiario, totalBonos } = obtenerValoresEmpleado(empleado);
                  const bonosLista = Array.isArray(empleado?.empleado_bonos) ? empleado.empleado_bonos : [];

                  return (
                    <tr key={empleado.id} className="border-t hover:bg-slate-50 transition">
                      <td className="p-4 font-mono">{empleado.numero_empleado || "S/N"}</td>
                      <td className="p-4 font-semibold text-gray-800">{empleado.nombre_completo || "Sin nombre"}</td>
                      <td className="p-4">{empleado.departamentos?.nombre || "N/A"}</td>
                      <td className="p-4">{empleado.puestos?.nombre || "Sin Asignar"}</td>
                      
                      <td className="p-4 text-right font-bold text-gray-800 bg-blue-50/40">
                        {salarioBaseSemanal > 0 ? (
                          `$${salarioBaseSemanal.toFixed(2)}`
                        ) : (
                          <span className="text-amber-600 font-normal">Sin Asignar</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-bold text-indigo-900 bg-indigo-50/40">
                        {salarioDiario > 0 ? (
                          `$${salarioDiario.toFixed(2)}`
                        ) : (
                          <span className="text-amber-600 font-normal">$0.00</span>
                        )}
                      </td>

                      <td className="p-4 text-right bg-emerald-50/40">
                        <button
                          onClick={() =>
                            setModalBonos({
                              abierto: true,
                              empleado: empleado,
                              bonos: bonosLista,
                            })
                          }
                          className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 ml-auto shadow-sm"
                        >
                          <span>🎁</span>
                          <span>
                            {totalBonos > 0 ? `$${totalBonos.toFixed(2)}` : "Ver Bonos"}
                          </span>
                        </button>
                      </td>

                      <td className="p-4 text-center">
                        {empleado.activo ? (
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                            Activo
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
                            Baja
                          </span>
                        )}
                      </td>

                      <td className="p-4">
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
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg font-semibold text-xs"
                          >
                            ✏️ Editar
                          </button>

                          <Link
                            to={`/empleados/detalle/${empleado.id}`}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg font-semibold text-xs"
                          >
                            Ver
                          </Link>

                          {empleado.activo ? (
                            <button
                              onClick={() => darDeBaja(empleado)}
                              className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg font-semibold text-xs"
                            >
                              Baja
                            </button>
                          ) : (
                            <button
                              onClick={() => reactivarEmpleado(empleado)}
                              className="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg font-semibold text-xs"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && empleadosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">
                    No se encontraron empleados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL EDICIÓN RÁPIDA */}
      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={guardarEdicionRapida}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
          >
            <div className="border-b pb-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                ✏️ Editar Puesto, Estatus y Salario Base
              </h3>
              <button
                type="button"
                onClick={() => setModalEdicionRapida({ abierto: false, datos: null })}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Empleado: <strong className="text-gray-800">{modalEdicionRapida.datos?.nombre_completo || "S/D"}</strong>
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
                <label className="block font-semibold text-gray-700 mb-1">Salario Base Semanal ($)</label>
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
                  * Sueldo diario calculado:{" "}
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

      {/* MODAL DE BONOS */}
      {modalBonos.abierto && modalBonos.empleado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="border-b pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                  <span>🎁</span> Bonos Asignados
                </h3>
                <p className="text-xs text-gray-500">
                  Empleado: <strong className="text-gray-800">{modalBonos.empleado?.nombre_completo}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalBonos({ abierto: false, empleado: null, bonos: [] })}
                className="text-gray-400 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto p-1">
              {(!modalBonos.bonos || modalBonos.bonos.length === 0) ? (
                <div className="text-center py-6 text-gray-500 text-xs">
                  No hay bonos asignados a este empleado.
                </div>
              ) : (
                modalBonos.bonos.map((bono) => (
                  <div
                    key={bono.id}
                    className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border text-xs"
                  >
                    <span className="font-semibold text-gray-700">{bono.tipo_bono || "Bono General"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bono.monto ?? 0}
                        onChange={(e) => handleCambioMontoBono(bono.id, e.target.value)}
                        className="w-28 border p-1.5 rounded-lg text-right font-bold text-emerald-700 outline-none"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl flex justify-between items-center border border-emerald-200">
              <span className="text-xs font-bold text-emerald-900">Total de Bonos:</span>
              <span className="text-base font-black text-emerald-700">
                $
                {(modalBonos.bonos || [])
                  .reduce((acc, b) => acc + (Number(b.monto) || 0), 0)
                  .toFixed(2)}
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setModalBonos({ abierto: false, empleado: null, bonos: [] })}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Cerrar
              </button>
              {modalBonos.bonos && modalBonos.bonos.length > 0 && (
                <button
                  type="button"
                  onClick={guardarAjusteBonos}
                  disabled={guardando}
                  className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:bg-emerald-300"
                >
                  {guardando ? "Guardando..." : "Guardar Ajuste de Bonos"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}