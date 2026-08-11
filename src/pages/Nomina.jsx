import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";

export default function Nomina() {
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState("");
  const [nomina, setNomina] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mostrarConfigPanel, setMostrarConfigPanel] = useState(false);

  // Mapeo estructurado: Columna de Nómina -> { modulo, tabla, columnaOrigen, activo }
  const [mapeoColumnas, setMapeoColumnas] = useState({
    sueldo_base: { label: "Sueldo Base", modulo: "Empleados", tabla: "empleados", columna: "sueldo_base", activo: true },
    sueldo_vacaciones: { label: "Sueldo Vacaciones", modulo: "Vacaciones", tabla: "vacaciones", columna: "monto_sueldo", activo: true },
    prima_vacacional: { label: "Prima Vacacional", modulo: "Vacaciones", tabla: "vacaciones", columna: "prima_vacacional", activo: true },
    bonos: { label: "Bonos", modulo: "Bonos", tabla: "bonos_empleado", columna: "importe", activo: true },
    horas_extra: { label: "Hrs Extra", modulo: "Incidencias", tabla: "incidencias", columna: "horas_extra", activo: true },
    descuentos: { label: "Descuentos/Préstamos", modulo: "Préstamos", tabla: "prestamos", columna: "monto_cuota", activo: true },
  });

  useEffect(() => {
    cargarPeriodos();
    cargarMapeoGuardado();
  }, []);

  useEffect(() => {
    if (periodoId) cargarNomina(periodoId);
  }, [periodoId]);

  const cargarPeriodos = async () => {
    const { data } = await supabase.from("periodos_nomina").select("*").order("fecha_inicio", { ascending: false });
    setPeriodos(data || []);
  };

  const cargarMapeoGuardado = async () => {
    try {
      const { data } = await supabase
        .from("configuracion_tablas")
        .select("*")
        .eq("tabla", "mapeo_columnas_nomina_dinamico")
        .maybeSingle();

      if (data && data.configuracion) {
        let cfg = typeof data.configuracion === "string" ? JSON.parse(data.configuracion) : data.configuracion;
        setMapeoColumnas(prev => ({ ...prev, ...cfg }));
      }
    } catch (e) {
      console.error("Usando mapeo por defecto", e);
    }
  };

  const guardarMapeo = async () => {
    try {
      await supabase.from("configuracion_tablas").upsert([
        {
          tabla: "mapeo_columnas_nomina_dinamico",
          configuracion: JSON.stringify(mapeoColumnas),
        }
      ], { onConflict: "tabla" });

      alert("¡Relación de módulos y columnas guardada correctamente!");
      setMostrarConfigPanel(false);
      if (periodoId) cargarNomina(periodoId);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
  };

  const actualizarCampoMapeo = (key, propiedad, valor) => {
    setMapeoColumnas(prev => ({
      ...prev,
      [key]: { ...prev[key], [propiedad]: valor }
    }));
  };

  const cargarNomina = async (pId) => {
    setLoading(true);
    const { data } = await supabase
      .from("nomina")
      .select(`*, empleados (numero_empleado, nombre_completo, puesto)`)
      .eq("periodo_id", pId);

    if (data) {
      setNomina(data.map(item => ({
        id: item.id,
        empleado_id: item.empleado_id,
        numero_empleado: item.empleados?.numero_empleado,
        nombre_completo: item.empleados?.nombre_completo,
        sueldo_base: Number(item.sueldo_base || 0),
        sueldo_vacaciones: Number(item.sueldo_vacaciones || 0),
        prima_vacacional: Number(item.prima_vacacional || 0),
        bonos: Number(item.total_bonos || 0),
        horas_extra: Number(item.total_horas_extra || 0),
        descuentos: Number(item.total_descuentos || 0),
        percepciones: Number(item.total_percepciones || 0),
        neto: Number(item.neto_pagar || 0),
      })));
    }
    setLoading(false);
  };

  const calcularNominaDinamica = async () => {
    if (!periodoId) {
      alert("Selecciona un período primero.");
      return;
    }

    setLoading(true);
    const { data: empleados } = await supabase.from("empleados").select("*").eq("activo", true);
    const resultado = [];

    for (const emp of empleados || []) {
      // Extracción basada en los módulos configurados
      const { data: vac } = await supabase.from("vacaciones").select(mapeoColumnas.sueldo_vacaciones.columna).eq("empleado_id", emp.id).eq("periodo_id", periodoId);
      const { data: bon } = await supabase.from("bonos_empleado").select(mapeoColumnas.bonos.columna).eq("empleado_id", emp.id).eq("periodo_id", periodoId);
      const { data: inc } = await supabase.from("incidencias").select(mapeoColumnas.horas_extra.columna).eq("empleado_id", emp.id).eq("periodo_id", periodoId);
      const { data: pres } = await supabase.from("prestamos").select(mapeoColumnas.descuentos.columna).eq("empleado_id", emp.id).eq("estatus", "ACTIVO");

      const sBase = mapeoColumnas.sueldo_base.activo ? Number(emp[mapeoColumnas.sueldo_base.columna] || 0) : 0;
      const sVac = mapeoColumnas.sueldo_vacaciones.activo ? (vac || []).reduce((a, b) => a + Number(b[mapeoColumnas.sueldo_vacaciones.columna] || 0), 0) : 0;
      const pVac = mapeoColumnas.prima_vacacional.activo ? (vac || []).reduce((a, b) => a + Number(b.prima_vacacional || 0), 0) : 0;
      const tBonos = mapeoColumnas.bonos.activo ? (bon || []).reduce((a, b) => a + Number(b[mapeoColumnas.bonos.columna] || 0), 0) : 0;
      const tHE = mapeoColumnas.horas_extra.activo ? (inc || []).reduce((a, b) => a + Number(b[mapeoColumnas.horas_extra.columna] || 0), 0) * 120 : 0;
      const tDesc = mapeoColumnas.descuentos.activo ? (pres || []).reduce((a, b) => a + Number(b[mapeoColumnas.descuentos.columna] || 0), 0) : 0;

      const percepciones = sBase + sVac + pVac + tBonos + tHE;
      const neto = percepciones - tDesc;

      await supabase.from("nomina").upsert([
        {
          empleado_id: emp.id,
          periodo_id: Number(periodoId),
          sueldo_base: sBase,
          sueldo_vacaciones: sVac,
          prima_vacacional: pVac,
          total_bonos: tBonos,
          total_horas_extra: tHE,
          total_descuentos: tDesc,
          total_percepciones: percepciones,
          neto_pagar: neto,
          estatus: "GENERADA"
        }
      ], { onConflict: "empleado_id, periodo_id" });

      resultado.push({
        id: emp.id,
        empleado_id: emp.id,
        numero_empleado: emp.numero_empleado,
        nombre_completo: emp.nombre_completo,
        sueldo_base: sBase,
        sueldo_vacaciones: sVac,
        prima_vacacional: pVac,
        bonos: tBonos,
        horas_extra: tHE,
        descuentos: tDesc,
        percepciones,
        neto
      });
    }

    setNomina(resultado);
    setLoading(false);
  };

  return (
    <Layout>
      <div>
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">🧮 Nómina Dinámica por Módulos</h1>
            <p className="text-gray-500 mt-1">Configura el origen exacto (Módulo, Tabla y Columna) para cada campo</p>
          </div>
          <button
            onClick={() => setMostrarConfigPanel(!mostrarConfigPanel)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm"
          >
            ⚙️ {mostrarConfigPanel ? "Ocultar Mapeo de Columnas" : "Configurar Módulos y Columnas"}
          </button>
        </div>

        {/* PANEL DE CONFIGURACIÓN Y MAPEO DIRECTO DE COLUMNAS */}
        {mostrarConfigPanel && (
          <div className="bg-white p-6 rounded-2xl shadow-md mb-6 border border-indigo-100">
            <h3 className="font-bold text-slate-800 text-sm mb-1">Asignador Directo de Origen de Datos</h3>
            <p className="text-xs text-gray-500 mb-4">Indica de qué módulo, tabla de Supabase y columna proviene la información de cada campo.</p>
            
            <div className="space-y-3 mb-4">
              {Object.keys(mapeoColumnas).map((key) => {
                const item = mapeoColumnas[key];
                return (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-xl border items-center text-xs">
                    <label className="flex items-center gap-2 font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.activo}
                        onChange={(e) => actualizarCampoMapeo(key, "activo", e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      {item.label}
                    </label>

                    <div>
                      <span className="text-[10px] text-gray-400 block">Módulo Operativo</span>
                      <input
                        type="text"
                        value={item.modulo}
                        onChange={(e) => actualizarCampoMapeo(key, "modulo", e.target.value)}
                        className="border rounded p-1.5 w-full bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-400 block">Tabla Supabase</span>
                      <input
                        type="text"
                        value={item.tabla}
                        onChange={(e) => actualizarCampoMapeo(key, "tabla", e.target.value)}
                        className="border rounded p-1.5 w-full bg-white font-mono"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-400 block">Columna Origen</span>
                      <input
                        type="text"
                        value={item.columna}
                        onChange={(e) => actualizarCampoMapeo(key, "columna", e.target.value)}
                        className="border rounded p-1.5 w-full bg-white font-mono text-indigo-600 font-bold"
                      />
                    </div>

                    <div className="text-right">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {item.activo ? "Activo" : "Oculto"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={guardarMapeo}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                💾 Guardar Asignación de Módulos
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="border rounded-xl p-3 flex-1 text-sm outline-none"
            >
              <option value="">Seleccionar período</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>{p.descripcion}</option>
              ))}
            </select>
            <button
              onClick={calcularNominaDinamica}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl transition font-semibold text-sm shadow-sm"
            >
              {loading ? "Calculando..." : "⚡ Calcular Nómina Dinámica"}
            </button>
          </div>
        </div>

        {/* TABLA DINÁMICA */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-4 text-left">No.</th>
                <th className="p-4 text-left">Empleado</th>
                {mapeoColumnas.sueldo_base.activo && <th className="p-4 text-right">Sueldo Base</th>}
                {mapeoColumnas.sueldo_vacaciones.activo && <th className="p-4 text-right">Vacaciones</th>}
                {mapeoColumnas.bonos.activo && <th className="p-4 text-right">Bonos</th>}
                {mapeoColumnas.horas_extra.activo && <th className="p-4 text-right">Hrs Extra</th>}
                {mapeoColumnas.descuentos.activo && <th className="p-4 text-right">Descuentos</th>}
                <th className="p-4 text-right">Percepciones</th>
                <th className="p-4 text-right">Neto</th>
                <th className="p-4 text-center">Recibo</th>
              </tr>
            </thead>
            <tbody>
              {nomina.length === 0 ? (
                <tr><td colSpan="10" className="text-center p-6 text-gray-500">No hay datos calculados.</td></tr>
              ) : (
                nomina.map((reg) => (
                  <tr key={reg.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-4 font-mono">{reg.numero_empleado}</td>
                    <td className="p-4 font-medium">{reg.nombre_completo}</td>
                    {mapeoColumnas.sueldo_base.activo && <td className="p-4 text-right">${reg.sueldo_base.toFixed(2)}</td>}
                    {mapeoColumnas.sueldo_vacaciones.activo && <td className="p-4 text-right">${reg.sueldo_vacaciones.toFixed(2)}</td>}
                    {mapeoColumnas.bonos.activo && <td className="p-4 text-right text-green-600">${reg.bonos.toFixed(2)}</td>}
                    {mapeoColumnas.horas_extra.activo && <td className="p-4 text-right">${reg.horas_extra.toFixed(2)}</td>}
                    {mapeoColumnas.descuentos.activo && <td className="p-4 text-right text-red-600">-${reg.descuentos.toFixed(2)}</td>}
                    <td className="p-4 text-right font-bold">${reg.percepciones.toFixed(2)}</td>
                    <td className="p-4 text-right font-extrabold text-blue-700">${reg.neto.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <Link
                        to={`/nomina/recibo/${reg.empleado_id}/${periodoId}`}
                        target="_blank"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Ver Recibo ↗
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}