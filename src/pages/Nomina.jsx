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

  useEffect(() => {
    cargarPeriodos();
  }, []);

  // Al cambiar de período, cargamos automáticamente la nómina ya generada (si existe)
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

  // Carga registros previos de la tabla 'nomina' uniendo los datos del empleado
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
          nombre_completo
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

      // 1. Suma de Bonos y Descuentos
      const totalBonos = (bonos || []).reduce(
        (acum, item) => acum + Number(item.importe || 0),
        0
      );

      const totalDescuentos = (descuentos || []).reduce(
        (acum, item) => acum + Number(item.importe || 0),
        0
      );

      // 2. Extracción de Incidencias (Horas extra, Faltas y Vacaciones)
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

      // 3. Cálculos Finales
      const pagoHorasExtra = horasExtra * 100; // Multiplicador base (ajustar si manejas tarifa por hora en empleado)
      const sueldoBase = Number(empleado.sueldo_base || 0);

      const percepciones = sueldoBase + totalBonos + pagoHorasExtra;
      const deduccionesTotales = totalDescuentos + descuentoAusencias;
      const neto = percepciones - deduccionesTotales;

      // 4. Upsert y retorno de la fila guardada
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

  // Totales para KPIs
  const totalEmpleados = nomina.length;
  const totalPercepciones = nomina.reduce(
    (a, b) => a + Number(b.percepciones || 0),
    0
  );
  const totalDescuentos = nomina.reduce(
    (a, b) => a + Number(b.descuentos || 0),
    0
  );
  const totalNeto = nomina.reduce((a, b) => a + Number(b.neto || 0), 0);

  return (
    <Layout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold">🧮 Nómina</h1>
          <p className="text-gray-500 mt-2">
            Generación y consulta de nómina
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <KpiCard
            titulo="Empleados"
            valor={totalEmpleados}
            icono="👥"
            color="text-blue-600"
          />
          <KpiCard
            titulo="Percepciones"
            valor={`$${totalPercepciones.toLocaleString("es-MX")}`}
            icono="💵"
            color="text-green-600"
          />
          <KpiCard
            titulo="Descuentos"
            valor={`$${totalDescuentos.toLocaleString("es-MX")}`}
            icono="💳"
            color="text-red-600"
          />
          <KpiCard
            titulo="Neto"
            valor={`$${totalNeto.toLocaleString("es-MX")}`}
            icono="💰"
            color="text-emerald-600"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="border rounded-xl p-3 flex-1"
            >
              <option value="">Seleccionar período</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.descripcion}
                </option>
              ))}
            </select>

            <button
              onClick={generarNomina}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl transition"
            >
              {loading ? "Procesando..." : "Calcular y Guardar Nómina"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-4 text-left">No.</th>
                <th className="p-4 text-left">Empleado</th>
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
              {nomina.map((registro) => (
                <tr
                  key={registro.id}
                  className="border-t hover:bg-slate-50 transition"
                >
                  <td className="p-4">{registro.numero_empleado}</td>
                  <td className="p-4 font-medium">{registro.nombre_completo}</td>
                  <td className="p-4 text-right">
                    ${registro.sueldo_base.toFixed(2)}
                  </td>
                  <td className="p-4 text-right text-green-600">
                    ${registro.bonos.toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    ${registro.horas_extra.toFixed(2)}
                  </td>
                  <td className="p-4 text-right text-red-600">
                    ${registro.descuentos.toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    ${registro.percepciones.toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-bold text-blue-700">
                    ${registro.neto.toFixed(2)}
                  </td>
                  <td className="p-4 text-center">
                    <Link
                      to={`/nomina/recibo/${registro.empleado_id}/${periodoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl inline-block"
                    >
                      Ver Recibo ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}