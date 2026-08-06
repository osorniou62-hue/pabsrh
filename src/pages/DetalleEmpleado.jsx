import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";

export default function DetalleEmpleado() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [empleado, setEmpleado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [nominas, setNominas] = useState([]);
  const [tabActiva, setTabActiva] = useState("general"); // 'general', 'nominas', 'historial'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, [id]);

  const cargarDatos = async () => {
    setLoading(true);
    await Promise.all([
      cargarEmpleado(),
      cargarHistorial(),
      cargarHistorialNominas(),
    ]);
    setLoading(false);
  };

  const cargarEmpleado = async () => {
    const { data, error } = await supabase
      .from("empleados")
      .select(`
        *,
        departamentos ( nombre ),
        puestos ( nombre )
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error al cargar empleado:", error);
      return;
    }

    setEmpleado(data);
  };

  const cargarHistorial = async () => {
    const { data, error } = await supabase
      .from("historial_empleado")
      .select("*")
      .eq("empleado_id", id)
      .order("fecha", { ascending: false });

    if (error) {
      console.error("Error al cargar historial:", error);
      return;
    }

    setHistorial(data || []);
  };

  const cargarHistorialNominas = async () => {
    const { data, error } = await supabase
      .from("nomina")
      .select(`
        *,
        periodos_nomina ( nombre_periodo, fecha_inicio, fecha_fin )
      `)
      .eq("empleado_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al cargar nóminas:", error);
      return;
    }

    setNominas(data || []);
  };

  const calcularAntiguedad = (fechaIngreso) => {
    if (!fechaIngreso) return "-";

    const ingreso = new Date(fechaIngreso);
    const hoy = new Date();

    let años = hoy.getFullYear() - ingreso.getFullYear();
    let meses = hoy.getMonth() - ingreso.getMonth();

    if (meses < 0) {
      años--;
      meses += 12;
    }

    return `${años} años ${meses} meses`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8 text-slate-600 font-medium">
          ⌛ Cargando información del expediente...
        </div>
      </Layout>
    );
  }

  if (!empleado) {
    return (
      <Layout>
        <div className="p-8 text-rose-600 font-medium">
          ⚠️ No se encontró el expediente del empleado.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        {/* Encabezado Principal */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              👤 Expediente del Empleado
            </h1>
            <p className="text-gray-500 mt-1">
              Desglose general, historial de nómina e incidencias
            </p>
          </div>

          <div className="flex gap-3 mt-4 md:mt-0">
            <button
              onClick={() => navigate(`/empleados/editar/${id}`)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
            >
              ✏️ Editar
            </button>

            <button
              onClick={() => navigate("/empleados")}
              className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
            >
              ⬅️ Regresar
            </button>
          </div>
        </div>

        {/* Tarjeta de Resumen del Empleado */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {empleado.nombre_completo}
              </h2>
              <p className="text-slate-500 mt-1">
                Empleado #{empleado.numero_empleado || id}
              </p>
            </div>

            <div className="mt-4 md:mt-0">
              {empleado.activo ? (
                <span className="bg-emerald-100 text-emerald-800 px-4 py-1.5 rounded-full text-xs font-bold border border-emerald-200">
                  ✅ Activo
                </span>
              ) : (
                <span className="bg-rose-100 text-rose-800 px-4 py-1.5 rounded-full text-xs font-bold border border-rose-200">
                  🚫 Baja
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Módulos en Tarjetas Rápidas */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Antigüedad
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {calcularAntiguedad(empleado.fecha_ingreso)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Departamento
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {empleado.departamentos?.nombre || "-"}
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Puesto
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {empleado.puestos?.nombre || "-"}
            </div>
          </div>
        </div>

        {/* Pestañas de Navegación del Expediente */}
        <div className="flex border-b border-slate-200 mb-6 bg-white rounded-t-xl px-4 pt-2 shadow-sm">
          <button
            onClick={() => setTabActiva("general")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              tabActiva === "general"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            📋 Información General
          </button>

          <button
            onClick={() => setTabActiva("nominas")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              tabActiva === "nominas"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            💰 Nóminas y Desglose ({nominas.length})
          </button>

          <button
            onClick={() => setTabActiva("historial")}
            className={`px-5 py-3 font-semibold text-sm transition border-b-2 ${
              tabActiva === "historial"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            📜 Historial Laboral ({historial.length})
          </button>
        </div>

        {/* Tab 1: Datos Generales */}
        {tabActiva === "general" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
                Identificación Oficial
              </h3>
              <div className="space-y-3 text-slate-700">
                <p>
                  <strong className="text-slate-500">CURP:</strong>{" "}
                  <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{empleado.curp || "-"}</span>
                </p>
                <p>
                  <strong className="text-slate-500">RFC:</strong>{" "}
                  <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{empleado.rfc || "-"}</span>
                </p>
                <p>
                  <strong className="text-slate-500">NSS:</strong>{" "}
                  <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{empleado.nss || "-"}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
                Información Contractual
              </h3>
              <div className="space-y-3 text-slate-700">
                <p>
                  <strong className="text-slate-500">Fecha de Ingreso:</strong>{" "}
                  {empleado.fecha_ingreso || "-"}
                </p>
                <p>
                  <strong className="text-slate-500">Fecha de Baja:</strong>{" "}
                  {empleado.fecha_baja || "-"}
                </p>
                <p>
                  <strong className="text-slate-500">Antigüedad Acreditada:</strong>{" "}
                  {calcularAntiguedad(empleado.fecha_ingreso)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Desglose de Nóminas y Recibos */}
        {tabActiva === "nominas" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              💵 Historial de Pagos y Desglose por Período
            </h3>

            {nominas.length === 0 ? (
              <p className="text-slate-500 py-4">
                No hay registros de nóminas para este empleado aún.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-3">Período / Semana</th>
                      <th className="p-3 text-right">Sueldo Base</th>
                      <th className="p-3 text-right">Percepciones / Bonos</th>
                      <th className="p-3 text-right">Deducciones</th>
                      <th className="p-3 text-right">Total Neto</th>
                      <th className="p-3 text-center">Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nominas.map((item) => {
                      const totalPercepciones =
                        Number(item.sueldo_base || 0) +
                        Number(item.complemento || 0) +
                        Number(item.horas_extras || 0) +
                        Number(item.bono_puesto || 0) +
                        Number(item.bono_puntualidad || 0) +
                        Number(item.bono_asistencia || 0) +
                        Number(item.bono_desempeno || 0) +
                        Number(item.gratificacion_especial || 0);

                      const totalDeducciones =
                        Number(item.bajo_desempeno || 0) +
                        Number(item.epp || 0) +
                        Number(item.prestamo || 0) +
                        Number(item.descuento_ausencias || 0);

                      const netoPagar = totalPercepciones - totalDeducciones;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 hover:bg-slate-50 transition"
                        >
                          <td className="p-3 font-semibold text-slate-800">
                            {item.periodos_nomina?.nombre_periodo || `Nómina #${item.id}`}
                            {item.periodos_nomina?.fecha_inicio && (
                              <span className="block text-xs font-normal text-slate-500">
                                {item.periodos_nomina.fecha_inicio} al {item.periodos_nomina.fecha_fin}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono">
                            ${Number(item.sueldo_base || 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono text-emerald-700 font-semibold">
                            +${totalPercepciones.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono text-rose-700 font-semibold">
                            -${totalDeducciones.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            ${netoPagar.toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => window.open(`/recibo/${item.id}`, "_blank")}
                              className="bg-slate-800 hover:bg-black text-white text-xs px-3 py-1.5 rounded-lg transition"
                            >
                              🖨️ Ver Recibo
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Historial Laboral */}
        {tabActiva === "historial" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              📜 Movimientos e Historial
            </h3>

            {historial.length === 0 ? (
              <p className="text-slate-500">Sin movimientos registrados</p>
            ) : (
              <div className="space-y-4">
                {historial.map((item) => (
                  <div
                    key={item.id}
                    className="border-l-4 border-blue-500 pl-4 py-2 bg-slate-50 rounded-r-xl"
                  >
                    <div className="font-semibold text-slate-800">
                      {item.movimiento}
                    </div>
                    <div className="text-sm text-slate-500">
                      {new Date(item.fecha).toLocaleString("es-MX")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Módulos Complementarios */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            🚀 Próximos Módulos del Expediente
          </h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center font-medium text-slate-700">
              💰 Nómina
            </div>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center font-medium text-slate-700">
              🏖️ Vacaciones
            </div>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center font-medium text-slate-700">
              💳 Préstamos
            </div>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center font-medium text-slate-700">
              📁 Expediente Digital
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}