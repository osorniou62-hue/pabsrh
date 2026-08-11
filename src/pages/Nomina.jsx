import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

export default function Nomina() {
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState("");
  const [nomina, setNomina] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mostrarConfigPanel, setMostrarConfigPanel] = useState(false);

  // Relación de campos maestra para la tabla y recibos
  const [camposConfig, setCamposConfig] = useState({
    sueldoBase: true,
    sueldoVacaciones: true,
    primaVacacional: true,
    aguinaldo: true,
    ptu: true,
    bonos: true,
    horasExtra: true,
    descuentos: true,
    ausencias: true,
  });

  useEffect(() => {
    cargarPeriodos();
    cargarConfiguracionCampos();
  }, []);

  useEffect(() => {
    if (periodoId) {
      cargarNominaExistente(periodoId);
    } else {
      setNomina([]);
    }
  }, [periodoId]);

  const cargarPeriodos = async () => {
    const { data, error } = await supabase
      .from("periodos_nomina")
      .select("*")
      .order("fecha_inicio", { ascending: false });

    if (!error) setPeriodos(data || []);
  };

  const cargarConfiguracionCampos = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_tablas")
        .select("*")
        .eq("tabla", "relacion_campos_nomina")
        .maybeSingle();

      if (!error && data && data.configuracion) {
        let cfg = data.configuracion;
        if (typeof cfg === "string") cfg = JSON.parse(cfg);
        if (cfg) setCamposConfig((prev) => ({ ...prev, ...cfg }));
      }
    } catch (e) {
      console.error("Usando configuración de campos por defecto.", e);
    }
  };

  const guardarConfiguracionCampos = async () => {
    try {
      await supabase.from("configuracion_tablas").upsert(
        [
          {
            tabla: "relacion_campos_nomina",
            configuracion: JSON.stringify(camposConfig),
          },
        ],
        { onConflict: "tabla" }
      );
      alert("¡Relación de campos guardada y sincronizada con éxito!");
      setMostrarConfigPanel(false);
      if (periodoId) cargarNominaExistente(periodoId);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
  };

  const cargarNominaExistente = async (pId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nomina")
      .select(`
        *,
        empleados (
          numero_empleado,
          nombre_completo,
          puesto,
          departamento
        )
      `)
      .eq("periodo_id", pId);

    if (error) {
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const formateado = data.map((item) => {
        const descGen = Number(item.total_descuentos || 0);
        const descAus = Number(item.descuento_ausencias || 0);
        
        return {
          id: item.id,
          empleado_id: item.empleado_id,
          numero_empleado: item.empleados?.numero_empleado,
          nombre_completo: item.empleados?.nombre_completo,
          puesto: item.empleados?.puesto,
          sueldo_base: Number(item.sueldo_base || 0),
          sueldo_vacaciones: Number(item.sueldo_vacaciones || 0),
          bonos: Number(item.total_bonos || 0),
          horas_extra: Number(item.total_horas_extra || 0),
          descuentos: descGen + descAus,
          percepciones: Number(item.total_percepciones || 0),
          neto: Number(item.neto_pagar || 0),
        };
      });
      setNomina(formateado);
    } else {
      setNomina([]);
    }
    setLoading(false);
  };

  const generarNomina = async () => {
    if (!periodoId) {
      alert("Selecciona un período");
      return;
    }

    setLoading(true);
    const { data: empleados } = await supabase.from("empleados").select("*").eq("activo", true);
    const resultado = [];

    for (const empleado of empleados || []) {
      const { data: bonos } = await supabase.from("bonos_empleado").select("*").eq("empleado_id", empleado.id).eq("periodo_id", periodoId);
      const { data: descuentos } = await supabase.from("descuentos_empleado").select("*").eq("empleado_id", empleado.id).eq("periodo_id", periodoId);
      const { data: incidencias } = await supabase.from("incidencias").select("*").eq("empleado_id", empleado.id).eq("periodo_id", periodoId);

      const totalBonos = (bonos || []).reduce((a, b) => a + Number(b.importe || 0), 0);
      const totalDescuentos = (descuentos || []).reduce((a, b) => a + Number(b.importe || 0), 0);
      const horasExtra = (incidencias || []).reduce((a, b) => a + Number(b.horas_extra || 0), 0);
      const descuentoAusencias = (incidencias || []).reduce((a, b) => a + Number(b.descuento_ausencias || 0), 0);

      const pagoHorasExtra = horasExtra * 100;
      const sueldoBase = Number(empleado.sueldo_base || 0);

      const percepciones = sueldoBase + totalBonos + pagoHorasExtra;
      const deduccionesTotales = totalDescuentos + descuentoAusencias;
      const neto = percepciones - deduccionesTotales;

      await supabase.from("nomina").upsert(
        [
          {
            empleado_id: empleado.id,
            periodo_id: Number(periodoId),
            sueldo_base: sueldoBase,
            total_bonos: totalBonos,
            total_descuentos: totalDescuentos,
            total_horas_extra: pagoHorasExtra,
            total_percepciones: percepciones,
            descuento_ausencias: descuentoAusencias,
            neto_pagar: neto,
            estatus: "GENERADA",
          },
        ],
        { onConflict: "empleado_id, periodo_id" }
      );

      resultado.push({
        id: empleado.id,
        empleado_id: empleado.id,
        numero_empleado: empleado.numero_empleado,
        nombre_completo: empleado.nombre_completo,
        puesto: empleado.puesto,
        sueldo_base: sueldoBase,
        bonos: totalBonos,
        horas_extra: pagoHorasExtra,
        descuentos: deduccionesTotales,
        percepciones,
        neto,
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
            <h1 className="text-4xl font-bold">🧮 Nómina</h1>
            <p className="text-gray-500 mt-1">Gestión y cálculo sincronizado con la relación de campos</p>
          </div>
          <button
            onClick={() => setMostrarConfigPanel(!mostrarConfigPanel)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
          >
            ⚙️ {mostrarConfigPanel ? "Ocultar Relación de Campos" : "Configurar Relación de Campos"}
          </button>
        </div>

        {/* PANEL FLOTANTE DE RELACIÓN DE CAMPOS */}
        {mostrarConfigPanel && (
          <div className="bg-white p-6 rounded-2xl shadow-md mb-6 border border-indigo-100">
            <h3 className="font-bold text-slate-800 text-sm mb-1">Relación de Campos (Tabla General y Recibos)</h3>
            <p className="text-xs text-gray-500 mb-4">Selecciona qué columnas y conceptos intervienen y se muestran en la tabla y en los recibos.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
              {Object.keys(camposConfig).map((campo) => (
                <label key={campo} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={camposConfig[campo]}
                    onChange={(e) => setCamposConfig({ ...camposConfig, [campo]: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700 capitalize">{campo.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={guardarConfiguracionCampos}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                💾 Guardar y Sincronizar Relación
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
              onClick={generarNomina}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl transition font-semibold text-sm shadow-sm"
            >
              {loading ? "Procesando..." : "⚡ Calcular y Guardar Nómina"}
            </button>
          </div>
        </div>

        {/* TABLA DINÁMICA SEGÚN RELACIÓN DE CAMPOS */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-4 text-left">No.</th>
                <th className="p-4 text-left">Empleado</th>
                {camposConfig.sueldoBase && <th className="p-4 text-right">Sueldo Base</th>}
                {camposConfig.bonos && <th className="p-4 text-right">Bonos</th>}
                {camposConfig.horasExtra && <th className="p-4 text-right">Hrs Extra</th>}
                {camposConfig.descuentos && <th className="p-4 text-right">Descuentos</th>}
                <th className="p-4 text-right">Percepciones</th>
                <th className="p-4 text-right">Neto</th>
                <th className="p-4 text-center">Recibo</th>
              </tr>
            </thead>
            <tbody>
              {nomina.length === 0 ? (
                <tr><td colSpan="9" className="text-center p-6 text-gray-500">No hay datos en este período.</td></tr>
              ) : (
                nomina.map((reg) => (
                  <tr key={reg.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-4 font-mono">{reg.numero_empleado}</td>
                    <td className="p-4 font-medium">{reg.nombre_completo}</td>
                    {camposConfig.sueldoBase && <td className="p-4 text-right">${reg.sueldo_base.toFixed(2)}</td>}
                    {camposConfig.bonos && <td className="p-4 text-right text-green-600">${reg.bonos.toFixed(2)}</td>}
                    {camposConfig.horasExtra && <td className="p-4 text-right">${reg.horas_extra.toFixed(2)}</td>}
                    {camposConfig.descuentos && <td className="p-4 text-right text-red-600">${reg.descuentos.toFixed(2)}</td>}
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