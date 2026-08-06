import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function HistorialRecibosEmpleado({ empleadoId }) {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empleadoId) cargarHistorial();
  }, [empleadoId]);

  const cargarHistorial = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nomina")
      .select(`
        *,
        periodos_nomina (*)
      `)
      .eq("empleado_id", empleadoId)
      .order("created_at", { ascending: false });

    if (!error) {
      setHistorial(data || []);
    }
    setLoading(false);
  };

  const abrirReciboImpresion = (periodoId) => {
    // Abre el recibo en una pestaña nueva listo para imprimir
    window.open(`/nomina/recibo/${empleadoId}/${periodoId}`, "_blank");
  };

  if (loading) return <p className="text-gray-500 py-4">Cargando recibos...</p>;

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-4">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        📄 Historial de Recibos y Desglose de Nómina
      </h3>

      {historial.length === 0 ? (
        <p className="text-gray-500">No se registran recibos calculados para este empleado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-gray-200 text-gray-700">
                <th className="p-3">Período / Semana</th>
                <th className="p-3">Sueldo Base</th>
                <th className="p-3">Bonos / Complementos</th>
                <th className="p-3">Deducciones</th>
                <th className="p-3">Neto Pagado</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((reg) => (
                <tr key={reg.id} className="border-b border-gray-100 hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">
                    {reg.periodos_nomina?.nombre_periodo || `Período ${reg.periodo_id}`}
                    <span className="block text-xs text-gray-500">
                      {reg.periodos_nomina?.fecha_inicio} al {reg.periodos_nomina?.fecha_fin}
                    </span>
                  </td>
                  <td className="p-3 text-emerald-700 font-semibold">
                    ${Number(reg.sueldo_base || 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-blue-700 font-semibold">
                    ${(
                      Number(reg.bono_puesto || 0) +
                      Number(reg.bono_puntualidad || 0) +
                      Number(reg.bono_asistencia || 0) +
                      Number(reg.horas_extras || 0) +
                      Number(reg.gratificacion_especial || 0)
                    ).toFixed(2)}
                  </td>
                  <td className="p-3 text-rose-700 font-semibold">
                    ${(
                      Number(reg.bajo_desempeno || 0) +
                      Number(reg.epp || 0) +
                      Number(reg.prestamo || 0) +
                      Number(reg.descuento_ausencias || 0)
                    ).toFixed(2)}
                  </td>
                  <td className="p-3 text-slate-900 font-bold">
                    ${Number(reg.neto_pagar || 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => abrirReciboImpresion(reg.periodo_id)}
                      className="bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded text-xs transition"
                    >
                      🖨️ Ver / Imprimir Recibos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}