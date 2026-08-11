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
  const [mapeoConfigurado, setMapeoConfigurado] = useState({});

  useEffect(() => {
    cargarPeriodos();
    cargarConfiguracionTablas();
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

    if (error) {
      console.error("Error al cargar períodos:", error);
      return;
    }
    setPeriodos(data || []);
  };

  // --- LECTURA DE CONFIGURACIÓN DE TABLAS PARA MAPEO DINÁMICO ---
  const cargarConfiguracionTablas = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_tablas")
        .select("*");

      if (!error && data) {
        let configsUnificadas = {};
        data.forEach((fila) => {
          Object.entries(fila).forEach(([key, value]) => {
            let objAnalizar = value;
            if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
              try { objAnalizar = JSON.parse(value); } catch (e) {}
            }
            if (typeof objAnalizar === "object" && objAnalizar !== null) {
              configsUnificadas = { ...configsUnificadas, ...objAnalizar };
            }
          });
        });
        setMapeoConfigurado(configsUnificadas);
      }
    } catch (e) {
      console.error("Error al leer configuración de tablas:", e);
    }
  };

  const cargarNominaExistente = async (pId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nomina")
      .select(`
        id,
        empleado_id,
        sueldo_base,
        total_bonos,
        total_descuentos,
        total_horas_extra,
        total_percepciones,
        descuento_ausencias,
        neto_pagar,
        empleados (
          numero_empleado,
          nombre_completo,
          puesto,
          departamento
        )
      `)
      .eq("periodo_id", pId);

    if (error) {
      console.error("Error al consultar nómina guardada:", error);
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
          departamento: item.empleados?.departamento,
          sueldo_base: Number(item.sueldo_base || 0),
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

    const { data: empleados, error: errEmp } = await supabase
      .from("empleados")
      .select("*")
      .eq("activo", true);

    if (errEmp) {
      console.error("Error al obtener empleados:", errEmp);
      setLoading(false);
      return;
    }

    const resultado = [];

    for (const empleado of empleados || []) {
      const { data: bonos } = await supabase
        .from("bonos_empleado")
        .select("*")
        .eq("empleado_id", empleado.id)
        .eq("periodo_id", periodoId);

      const { data: descuentos } = await supabase
        .from("descuentos_empleado")
        .select("*")
        .eq("empleado_id", empleado.id)
        .eq("periodo_id", periodoId);

      const { data: incidencias } = await supabase
        .from("incidencias")
        .select("*")
        .eq("empleado_id", empleado.id)
        .eq("periodo_id", periodoId);

      const totalBonos = (bonos || []).reduce(
        (acum, item) => acum + Number(item.importe || 0),
        0
      );

      const totalDescuentos = (descuentos || []).reduce(
        (acum, item) => acum + Number(item.importe || 0),
        0
      );

      const horasExtra = (incidencias || []).reduce(
        (acum, item) => acum + Number(item.horas_extra || 0),
        0
      );

      const faltasJustificadas = (incidencias || []).reduce(
        (acum, item) => acum + Number(item.faltas_justificadas || 0),
        0
      );

      const faltasInjustificadas = (incidencias || []).reduce(
        (acum, item) => acum + Number(item.faltas_injustificadas || 0),
        0
      );

      const diasVacaciones = (incidencias || []).reduce(
        (acum, item) => acum + Number(item.dias_vacaciones || 0),
        0
      );

      const descuentoAusencias = (incidencias || []).reduce(
        (acum, item) => acum + Number(item.descuento_ausencias || 0),
        0
      );

      // Tarifa por hora dinámica o estándar
      const pagoHorasExtra = horasExtra * 100; 
      const sueldoBase = Number(empleado.sueldo_base || 0);

      const percepciones = sueldoBase + totalBonos + pagoHorasExtra;
      const deduccionesTotales = totalDescuentos + descuentoAusencias;
      const neto = percepciones - deduccionesTotales;

      const { data: nominaGuardada, error: errUpsert } = await supabase
        .from("nomina")
        .upsert(
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
              faltas_justificadas: faltasJustificadas,
              faltas_injustificadas: faltasInjustificadas,
              dias_vacaciones: diasVacaciones,
              neto_pagar: neto,
              estatus: "GENERADA",
            },
          ],
          { onConflict: "empleado_id, periodo_id" }
        )
        .select();

      if (errUpsert) {
        console.error("Error guardando nómina:", errUpsert);
      }

      const registroId = nominaGuardada?.[0]?.id || empleado.id;

      resultado.push({
        id: registroId,
        empleado_id: empleado.id,
        numero_empleado: empleado.numero_empleado,
        nombre_completo: empleado.nombre_completo,
        puesto: empleado.puesto,
        departamento: empleado.departamento,
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

  const totalEmpleados = nomina.length;
  const totalPercepciones = nomina.reduce((a, b) => a + Number(b.percepciones || 0), 0);
  const totalDescuentos = nomina.reduce((a, b) => a + Number(b.descuentos || 0), 0);
  const totalNeto = nomina.reduce((a, b) => a + Number(b.neto || 0), 0);

  return (
    <Layout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold">🧮 Nómina</h1>
          <p className="text-gray-500 mt-2">Generación y cálculo sincronizado con la relación de campos</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard titulo="Empleados" valor={totalEmpleados} icono="👥" color="text-blue-600" />
          <KpiCard titulo="Percepciones" valor={`$${totalPercepciones.toLocaleString("es-MX")}`} icono="💵" color="text-green-600" />
          <KpiCard titulo="Descuentos" valor={`$${totalDescuentos.toLocaleString("es-MX")}`} icono="💳" color="text-red-600" />
          <KpiCard titulo="Neto" valor={`$${totalNeto.toLocaleString("es-MX")}`} icono="💰" color="text-emerald-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="border rounded-xl p-3 flex-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar período de nómina</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.descripcion} ({periodo.fecha_inicio} al {periodo.fecha_fin})
                </option>
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

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-4 text-left">No.</th>
                <th className="p-4 text-left">Empleado</th>
                <th className="p-4 text-left">Puesto</th>
                <th className="p-4 text-right">Sueldo</th>
                <th className="p-4 text-right">Bonos</th>
                <th className="p-4 text-right">Horas Extra</th>
                <th className="p-4 text-right">Descuentos</th>
                <th className="p-4 text-right">Percepciones</th>
                <th className="p-4 text-right">Neto</th>
                <th className="p-4 text-center">Recibo</th>
              </tr>
            </thead>
            <tbody>
              {nomina.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center p-6 text-gray-500">
                    No hay registros de nómina para este período. Selecciona uno y haz clic en calcular.
                  </td>
                </tr>
              ) : (
                nomina.map((registro) => (
                  <tr key={registro.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-4 font-mono">{registro.numero_empleado}</td>
                    <td className="p-4 font-medium text-slate-900">{registro.nombre_completo}</td>
                    <td className="p-4 text-slate-600 text-xs font-semibold">{registro.puesto || "N/D"}</td>
                    <td className="p-4 text-right">${registro.sueldo_base.toFixed(2)}</td>
                    <td className="p-4 text-right text-green-600 font-semibold">${registro.bonos.toFixed(2)}</td>
                    <td className="p-4 text-right">${registro.horas_extra.toFixed(2)}</td>
                    <td className="p-4 text-right text-red-600 font-semibold">${registro.descuentos.toFixed(2)}</td>
                    <td className="p-4 text-right font-bold">${registro.percepciones.toFixed(2)}</td>
                    <td className="p-4 text-right font-extrabold text-blue-700">${registro.neto.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <Link
                        to={`/nomina/recibo/${registro.empleado_id}/${periodoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg inline-block text-xs font-semibold shadow-sm"
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