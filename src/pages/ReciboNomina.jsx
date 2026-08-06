import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

export default function ReciboNomina() {
  const { empleadoId, periodoId } = useParams();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatosRecibo();
  }, [empleadoId, periodoId]);

  const cargarDatosRecibo = async () => {
    setLoading(true);

    // Consulta la nómina calculada del empleado en el período seleccionado
    const { data: nomina, error } = await supabase
      .from("nomina")
      .select(`
        *,
        empleados (*),
        periodos_nomina (*)
      `)
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId)
      .single();

    if (error || !nomina) {
      console.error("Error al obtener los datos del recibo:", error);
      setLoading(false);
      return;
    }

    setDatos(nomina);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 font-sans">
        Cargando recibo de nómina...
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500 font-sans">
        No se encontraron datos para generar este recibo.
      </div>
    );
  }

  const { empleados: emp, periodos_nomina: per } = datos;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      {/* Botón de impresión (Oculto al imprimir) */}
      <div className="no-print mb-6">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow-md transition"
        >
          🖨️ Imprimir Recibos / Guardar PDF
        </button>
      </div>

      {/* Contenedor Hoja Completa (Estilo Hoja de Excel) */}
      <div className="w-full max-w-3xl bg-white p-6 border border-gray-300 shadow-xl font-sans text-xs text-black print:shadow-none print:border-none print:p-0">
        
        {/* ==========================================
            PRIMER RECIBO (SUELDO BASE / OFICIAL)
           ========================================== */}
        <div className="border border-black p-4 mb-6">
          <div className="flex justify-between items-center font-bold border-b border-black pb-1 mb-2 text-sm">
            <span>RECIBO</span>
            <div>
              <span>FECHA DE PAGO: </span>
              <span className="font-normal">{per?.fecha_pago || "—"}</span>
            </div>
          </div>

          <div className="flex justify-between items-center font-bold mb-3 text-sm">
            <div>
              <span>NOMBRE: </span>
              <span className="font-normal uppercase">{emp?.nombre_completo}</span>
            </div>
            <div>
              <span className="font-normal">{emp?.numero_empleado || "203.0"}</span>
            </div>
          </div>

          {/* Tabla Desglose Recibo 1 */}
          <div className="grid grid-cols-12 border-t border-b border-black py-2 my-2 gap-2">
            {/* Percepciones Base */}
            <div className="col-span-7 pr-2 border-r border-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>SUELDO</span>
                <span>${Number(datos?.sueldo_base || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>SUELDO VACACIONES</span>
                <span>${Number(datos?.sueldo_vacaciones || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PRIMA VACACIONAL</span>
                <span>${Number(datos?.prima_vacacional || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>AGUINALDO</span>
                <span>${Number(datos?.aguinaldo || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PTU</span>
                <span>${Number(datos?.ptu || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Deducciones y Días/Faltas Base */}
            <div className="col-span-5 pl-2 space-y-1">
              <div className="flex justify-between">
                <span>V (Vacaciones)</span>
                <span>{datos?.dias_vacaciones || 0.0}</span>
              </div>
              <div className="flex justify-between">
                <span>J (Faltas Justificadas)</span>
                <span>{datos?.faltas_justificadas || 0.0}</span>
              </div>
              <div className="flex justify-between">
                <span>FI (Faltas Injustificadas)</span>
                <span>{datos?.faltas_injustificadas || 0.0}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span>AUSENCIAS</span>
                <span>${Number(datos?.descuento_ausencias || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Totales Recibo 1 */}
          <div className="grid grid-cols-12 font-bold py-1 my-1">
            <div className="col-span-7 flex justify-between pr-2">
              <span>PERCEPCIONES</span>
              <span>${Number(datos?.percepciones_oficial || datos?.sueldo_base || 0).toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>DEDUCCIONES</span>
              <span>${Number(datos?.deducciones_oficial || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>TOTAL PAGO</span>
            <span>${Number(datos?.total_pago_oficial || datos?.sueldo_base || 0).toFixed(2)}</span>
          </div>

          {/* Pie del Recibo 1 */}
          <div className="mt-3">
            <div className="font-bold">RECIBI DE CONFORMIDAD:</div>
            <div className="flex justify-between items-center mt-2">
              <div>
                <span className="font-bold">CORRESPONDIENTE: </span>
                <span>{per?.fecha_inicio}</span>
                <span className="font-bold mx-2">AL</span>
                <span>{per?.fecha_fin}</span>
              </div>
              <div className="border-t border-black w-48 text-center pt-1 font-bold">
                FIRMA
              </div>
            </div>
          </div>
        </div>

        {/* Separación visual estilo corte de hoja */}
        <div className="border-b-2 border-dashed border-gray-400 my-6"></div>

        {/* ==========================================
            SEGUNDO RECIBO (COMPLEMENTO Y BONOS)
           ========================================== */}
        <div className="border border-black p-4">
          <div className="flex justify-between items-center font-bold border-b border-black pb-1 mb-2 text-sm">
            <span>RECIBO</span>
            <div>
              <span>FECHA DE PAGO: </span>
              <span className="font-normal">{per?.fecha_pago || "—"}</span>
            </div>
          </div>

          <div className="flex justify-between items-center font-bold mb-3 text-sm">
            <div>
              <span>NOMBRE: </span>
              <span className="font-normal uppercase">{emp?.nombre_completo}</span>
            </div>
            <div>
              <span className="font-normal">{emp?.numero_empleado || "203.0"}</span>
            </div>
          </div>

          {/* Tabla Desglose Recibo 2 */}
          <div className="grid grid-cols-12 border-t border-b border-black py-2 my-2 gap-2">
            {/* Percepciones Complementarias */}
            <div className="col-span-7 pr-2 border-r border-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>SUELDO Y COMPLEMENTO</span>
                <span>${Number(datos?.sueldo_base || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>HRS. EXTRAS</span>
                <span>${Number(datos?.horas_extras || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO POR PUESTO</span>
                <span>${Number(datos?.bono_puesto || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO PUNTUALIDAD</span>
                <span>${Number(datos?.bono_puntualidad || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO ASISTENCIA</span>
                <span>${Number(datos?.bono_asistencia || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO MULTIPLICADOR</span>
                <span>${Number(datos?.bono_multiplicador || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO DESEMPEÑO</span>
                <span>${Number(datos?.bono_desempeno || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>APOYO MEDICO</span>
                <span>${Number(datos?.apoyo_medico || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>VACACIONES</span>
                <span>${Number(datos?.vacaciones_complemento || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PRIMA VACACIONAL</span>
                <span>${Number(datos?.prima_vacacional_comp || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO EXTRAS</span>
                <span>${Number(datos?.bono_extras || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>AGUINALDO</span>
                <span>${Number(datos?.aguinaldo_comp || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PTU</span>
                <span>${Number(datos?.ptu_comp || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GRATIFICACIÓN ESPECIAL</span>
                <span>${Number(datos?.gratificacion_especial || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Deducciones Complementarias */}
            <div className="col-span-5 pl-2 space-y-1">
              <div className="flex justify-between">
                <span>V</span>
                <span>{datos?.dias_vacaciones || 0.0}</span>
              </div>
              <div className="flex justify-between">
                <span>FJ</span>
                <span>{datos?.faltas_justificadas || 0.0}</span>
              </div>
              <div className="flex justify-between">
                <span>FI</span>
                <span>{datos?.faltas_injustificadas || 0.0}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span>BAJO DESEMPEÑO</span>
                <span>${Number(datos?.bajo_desempeno || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>EPP</span>
                <span>${Number(datos?.epp || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>DESCUENTOS GRAL</span>
                <span>${Number(datos?.descuentos_gral || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PRESTAMO</span>
                <span>${Number(datos?.prestamo || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>OTRAS DEDUCCIONES</span>
                <span>${Number(datos?.otras_deducciones || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>AUSENCIAS</span>
                <span>${Number(datos?.descuento_ausencias || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Totales Recibo 2 */}
          <div className="grid grid-cols-12 font-bold py-1 my-1">
            <div className="col-span-7 flex justify-between pr-2">
              <span>PERCEPCIONES</span>
              <span>${Number(datos?.total_percepciones_complemento || datos?.neto_pagar || 0).toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>DEDUCCIONES</span>
              <span>${Number(datos?.total_deducciones_complemento || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>TOTAL PAGO</span>
            <span>${Number(datos?.neto_pagar || 0).toFixed(2)}</span>
          </div>

          {/* Pie del Recibo 2 */}
          <div className="mt-3">
            <div className="font-bold">RECIBI DE CONFORMIDAD:</div>
            <div className="flex justify-between items-center mt-2">
              <div>
                <span className="font-bold">CORRESPONDIENTE: </span>
                <span>{per?.fecha_inicio}</span>
                <span className="font-bold mx-2">AL</span>
                <span>{per?.fecha_fin}</span>
              </div>
              <div className="border-t border-black w-48 text-center pt-1 font-bold">
                FIRMA
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Reglas CSS para impresión limpia */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: white !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}