import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [puestosLista, setPuestosLista] = useState([]);
  const [departamentosLista, setDepartamentosLista] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estatus, setEstatus] = useState("ACTIVOS");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("TODOS");
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE MODALES ---
  const [modalEdicionRapida, setModalEdicionRapida] = useState({ abierto: false, datos: null });
  const [modalRelacion, setModalRelacion] = useState(false);
  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarCatalogos();
    cargarEmpleados();
    cargarRelacionCamposConfiguracion();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepts] = await Promise.all([
        supabase.from("puestos").select("*").order("nombre"),
        supabase.from("departamentos").select("*").order("nombre")
      ]);

      const puestosCrudos = resPuestos.data || [];
      const puestosUnicosMap = new Map();
      
      puestosCrudos.forEach((p) => {
        const nombreLimpio = String(p.nombre || "").trim();
        if (nombreLimpio !== "" && !puestosUnicosMap.has(nombreLimpio.toLowerCase())) {
          puestosUnicosMap.set(nombreLimpio.toLowerCase(), { ...p, nombre: nombreLimpio });
        }
      });

      setPuestosLista(Array.from(puestosUnicosMap.values()));
      setDepartamentosLista(resDepts.data || []);
    } catch (e) {
      console.error("Error cargando catálogos:", e);
    }
  };

  const cargarEmpleados = async () => {
    setLoading(true);

    try {
      const { data: emps, error: errorEmps } = await supabase
        .from("empleados")
        .select("*")
        .order("nombre_completo");

      if (errorEmps) throw errorEmps;

      const [resDepts, resPuestos] = await Promise.all([
        supabase.from("departamentos").select("*"),
        supabase.from("puestos").select("*")
      ]);

      const departamentosMap = new Map((resDepts.data || []).map(d => [d.id, d]));
      const puestosMap = new Map((resPuestos.data || []).map(p => [p.id, p]));

      const empleadosMapeados = (emps || []).map(emp => {
        return {
          ...emp,
          departamentos: departamentosMap.get(emp.departamento_id) || null,
          puestos: puestosMap.get(emp.puesto_id) || null,
        };
      });

      setEmpleados(empleadosMapeados);
    } catch (err) {
      console.error("❌ Error al cargar empleados:", err?.message || err);
      setEmpleados([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar la relación de campos guardada desde ConfiguracionTablas
  const cargarRelacionCamposConfiguracion = async () => {
    try {
      // Intentar leer de Supabase primero
      const { data } = await supabase
        .from("configuracion_tablas")
        .select("configuracion")
        .eq("clave", "config_mapeo_columnas_dinamico")
        .maybeSingle();

      if (data && data.configuracion) {
        setConfiguracionMapeo(data.configuracion);
      } else {
        // Fallback a localStorage si no está en Supabase
        const local = localStorage.getItem("config_mapeo_columnas_dinamico");
        if (local) {
          setConfiguracionMapeo(JSON.parse(local));
        }
      }
    } catch (err) {
      console.error("Error cargando configuración de mapeo:", err);
    }
  };

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

    const salarioBaseSemanal = Number(emp?.sueldo_base ?? 0);
    const salarioDiario = salarioBaseSemanal > 0 ? salarioBaseSemanal / 7 : 0;

    const bonoPuesto = Number(emp?.bono_puesto ?? 0);
    const bonoPuntualidad = Number(emp?.bono_puntualidad ?? 0);
    const bonoAsistencia = Number(emp?.bono_asistencia ?? 0);
    const bonoMultiplicador = Number(emp?.bono_multiplicador ?? 0);
    const bonoDesempeno = Number(emp?.bono_desempeno ?? 0);
    const bonoExtra = Number(emp?.bono_extra ?? 0);
    const apoyoMedico = Number(emp?.apoyo_medico ?? 0);
    const gratificacionEspecial = Number(emp?.gratificacion_especial ?? 0);

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

  const guardarEdicionRapida = async (e) => {
    e.preventDefault();
    if (!modalEdicionRapida.datos) return;

    setGuardando(true);
    const d = modalEdicionRapida.datos;

    const { error } = await supabase
      .from("empleados")
      .update({
        departamento_id: d.departamento_id || null,
        puesto_id: d.puesto_id || null,
        activo: Boolean(d.activo),
        sueldo_base: Number(d.sueldo_base) || 0,
        supervisor_id: d.supervisor_id || null,
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

  const esPuestoSupervisor = (puestoId) => {
    const puestoObj = puestosLista.find(p => p.id === puestoId);
    if (!puestoObj) return false;
    const nombrePuesto = puestoObj.nombre.toLowerCase();
    return nombrePuesto.includes("supervisor") || nombrePuesto.includes("jefe") || nombrePuesto.includes("líder") || nombrePuesto.includes("lider") || nombrePuesto.includes("encargado");
  };

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
    if (estatus === "ACTIVOS") coincideEstatus = Boolean(empleado.activo ?? true);
    if (estatus === "BAJAS") coincideEstatus = !Boolean(empleado.activo ?? true);

    const coincideDepartamento =
      departamentoFiltro === "TODOS" || empleado.departamentos?.nombre === departamentoFiltro;

    return coincideBusqueda && coincideEstatus && coincideDepartamento;
  });

  const total = empleados.length;
  const activos = empleados.filter((e) => e?.activo ?? true).length;
  const bajas = empleados.filter((e) => !(e?.activo ?? true)).length;

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

          {/* NUEVOS BOTONES SOLICITADOS */}
          <div className="flex gap-3 mt-4 md:mt-0">
            <button
              onClick={() => setModalRelacion(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm"
            >
              🔗 Relación campos
            </button>

            <Link
              to="/empleados/importar"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm"
            >
              📝 Editar Empleados
            </Link>

            <Link
              to="/empleados/nuevo"
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm shadow-sm"
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

                  const estaActivo = empleado.activo ?? true;

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
                        {estaActivo ? (
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
                                  departamento_id: empleado.departamento_id || "",
                                  puesto_id: empleado.puesto_id || "",
                                  activo: estaActivo,
                                  sueldo_base: salarioBaseSemanal,
                                  supervisor_id: empleado.supervisor_id || "",
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

      {/* 🌟 MODAL: RELACIÓN DE CAMPOS SEGÚN CONFIGURACIÓN DE TABLAS */}
      {modalRelacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 border-b mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">🔗 Relación de Campos Configurados</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mapeo actual heredado desde la sección de <strong>Configuración de Tablas</strong>.
                </p>
              </div>
              <button 
                onClick={() => setModalRelacion(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm transition-all"
              >
                ✕ Cerrar
              </button>
            </div>

            {configuracionMapeo && configuracionMapeo.asignacion ? (
              <div className="space-y-4">
                <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-medium">
                  ✅ Sincronizado correctamente. Total de columnas mapeadas: <strong>{Object.keys(configuracionMapeo.asignacion).length}</strong>
                </div>

                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                      <tr>
                        <th className="p-3 border-b">Columna Excel Original</th>
                        <th className="p-3 border-b">Tabla Destino Supabase</th>
                        <th className="p-3 border-b">Campo / Depto Destino</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(configuracionMapeo.asignacion).map(([columnaOriginal, info], idx) => {
                        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-800">{columnaOriginal}</td>
                            <td className="p-3">
                              {info.tablaDestino ? (
                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">
                                  {info.tablaDestino}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">Ignorada / No usada</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {info.esManual ? (
                                <span className="text-blue-700 font-bold">✏️ Manual: {info.campoManual}</span>
                              ) : (
                                campoFinal || <span className="text-gray-400 italic">Sin definir</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500">
                <p className="text-sm">⚠️ No se encontró una configuración previa.</p>
                <p className="text-xs mt-1">Ve primero a <strong>Configuración de Tablas</strong> para analizar y guardar tu archivo Excel.</p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t flex justify-end">
              <button
                onClick={() => setModalRelacion(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Cerrar Ventana
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL EDICIÓN RÁPIDA (CON DEPARTAMENTO, PUESTO Y ORGANIGRAMA) */}
      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={guardarEdicionRapida}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="border-b pb-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                ✏️ Editar Empleado, Departamento, Puesto y Organigrama
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
              Colaborador:{" "}
              <strong className="text-gray-800">
                {modalEdicionRapida.datos?.nombre_completo || "S/D"}
              </strong>
            </p>

            <div className="space-y-4 text-xs md:text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Departamento</label>
                <select
                  value={modalEdicionRapida.datos?.departamento_id || ""}
                  onChange={(e) =>
                    setModalEdicionRapida({
                      ...modalEdicionRapida,
                      datos: { ...modalEdicionRapida.datos, departamento_id: e.target.value },
                    })
                  }
                  className="w-full border p-2.5 rounded-lg outline-none bg-white"
                >
                  <option value="">-- Seleccionar Departamento --</option>
                  {departamentosLista.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>

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
                  className="w-full border p-2.5 rounded-lg outline-none bg-white"
                >
                  <option value="">-- Seleccionar Puesto --</option>
                  {puestosLista.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {esPuestoSupervisor(modalEdicionRapida.datos?.puesto_id) && (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <label className="block font-bold text-blue-900 mb-1">
                    👥 Organigrama / Empleados a su cargo:
                  </label>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Selecciona al subordinado directo que reporta con este supervisor.
                  </p>
                  <select
                    value={modalEdicionRapida.datos?.supervisor_id || ""}
                    onChange={(e) =>
                      setModalEdicionRapida({
                        ...modalEdicionRapida,
                        datos: { ...modalEdicionRapida.datos, supervisor_id: e.target.value },
                      })
                    }
                    className="w-full border p-2 rounded-lg bg-white text-xs"
                  >
                    <option value="">-- Sin subordinado directo asociado --</option>
                    {empleados
                      .filter((emp) => emp.id !== modalEdicionRapida.datos?.id)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre_completo} ({emp.puestos?.nombre || "Sin puesto"})
                        </option>
                      ))}
                  </select>
                </div>
              )}

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
                  className="w-full border p-2.5 rounded-lg outline-none bg-white"
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
                  value={modalEdicionRapida.datos?.sueldo_base ?? 0}
                  onChange={(e) =>
                    setModalEdicionRapida({
                      ...modalEdicionRapida,
                      datos: { ...modalEdicionRapida.datos, sueldo_base: e.target.value },
                    })
                  }
                  className="w-full border p-2.5 rounded-lg font-bold text-green-700 outline-none"
                />
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