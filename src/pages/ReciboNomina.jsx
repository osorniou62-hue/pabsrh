import { useEffect, useState } from "react";
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

    // 1. Obtener la nómina generada del empleado en este período
    const { data: nominaData, error: errNom } = await supabase
      .from("nomina")
      .select(`
        *,
        empleados (*),
        periodos_nomina (*)
      `)
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId)
      .single();

    if (errNom || !nominaData) {
      console.error("Error al cargar datos del recibo:", errNom);
      setLoading(false);
      return;
    }

    // 2. Obtener incidencias / detalles específicos si aplican
    const { data: incidencias } = await supabase
      .from("incidencias")
      .select("*")
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId);

    const faltasJustificadas = (incidencias || []).reduce((a, b) => a + Number(b.faltas_justificadas || 0), 0);
    const faltasInjustificadas = (incidencias || []).reduce((a, b) => a + Number(b.faltas_injustificadas || 0), 0);
    const ausencias = (incidencias || []).reduce((a, b) => a + Number(b.ausencias || 0), 0);

    setDatos({
      nomina: nominaData,
      empleado: nominaData.empleados,
      periodo: nominaData.periodos_nomina,
      incidencias: {
        faltasJustificadas,
        faltasInjustificadas,
        ausencias,
      }
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center font-sans text-gray-600">
        Cargando recibo de nómina...
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="flex h-screen items-center justify-center font-sans text-red-500">
        No se encontraron datos para generar este recibo.
      </div>
    );
  }

  const { empleado, periodo, nomina, incidencias } = datos;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      {/* Botón flotante para imprimir o guardar en PDF */}
      <div className="no-print mb-6 flex gap-4">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-md transition"
        >
          🖨️ Imprimir Recibo / Guardar PDF
        </button>
      </div>

      {/* Hoja del Recibo Estilo Excel */}
      <div className="w-full max-w-4xl bg-white p-8 border border-gray-300 shadow-xl rounded-lg print:shadow-none print:border-none print:p-0">
        {/* PARTE 1: RECIBO OFICIAL */}
        <div className="border-2 border-slate-800 p-4 mb-6">
          <div className="flex justify-between items-center border-b-2 border-slate-800 pb-2 mb-4">
            <h1 className="text-xl font-bold tracking-wider">RECIBO DE NÓMINA</h1>
            <div className="text-right">
              <span className="font-semibold block">FECHA DE PAGO:</span>
              <span>{periodo.fecha_pago || "—"}</span>
            </div>
          </div>

          {/* Datos del Empleado */}
          <div className="grid grid-cols-12 gap-2 mb-4 text-sm">
            <div className="col-span-8">
              <span className="font-bold">NOMBRE: </span>
              <span className="uppercase">{empleado.nombre_completo}</span>
            </div>
            <div className="col-span-4 text-right">
              <span className="font-bold">NO. EMPLEADO: </span>
              <span>{empleado.numero_empleado}</span>
            </div>
          </div>

          {/* Tabla Desglose */}
          <div className="grid grid-cols-12 gap-4 text-sm border-t border-b border-slate-300 py-3 mb-4">
            {/* Percepciones */}
            <div className="col-span-7 pr-4 border-r border-slate-200">
              <div className="flex justify-between py-1">
                <span>SUELDO BASE</span>
                <span className="font-medium">${Number(nomina.sueldo_base || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>SUELDO VACACIONES</span>
                <span className="font-medium">${Number(nomina.sueldo_vacaciones || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>PRIMA VACACIONAL</span>
                <span className="font-medium">${Number(nomina.prima_vacacional || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>AGUINALDO</span>
                <span className="font-medium">${Number(nomina.aguinaldo || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>BONOS / COMPLEMENTOS</span>
                <span className="font-medium">${Number(nomina.total_bonos || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Deducciones / Ausencias */}
            <div className="col-span-5 pl-2">
              <div className="flex justify-between py-1">
                <span>AUSENCIAS</span>
                <span className="font-medium">{incidencias.ausencias}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>FALTAS JUSTIFICADAS (FJ)</span>
                <span className="font-medium">{incidencias.faltasJustificadas}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>FALTAS INJUST. (FI)</span>
                <span className="font-medium">{incidencias.faltasInjustificadas}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>DEDUCCIONES / PRÉSTAMOS</span>
                <span className="font-medium">${Number(nomina.total_descuentos || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-12 gap-2 text-sm font-bold border-b border-slate-300 pb-3 mb-4">
            <div className="col-span-7 flex justify-between pr-4">
              <span>TOTAL PERCEPCIONES:</span>
              <span className="text-green-700">${Number(nomina.total_percepciones || 0).toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>TOTAL DEDUCCIONES:</span>
              <span className="text-red-700">${Number(nomina.total_descuentos || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-base font-extrabold bg-slate-50 p-2 border border-slate-200 mb-6">
            <span>TOTAL A RECIBIR (NETO):</span>
            <span className="text-blue-800 text-lg">${Number(nomina.neto_pagar || 0).toFixed(2)}</span>
          </div>

          {/* Pie de Recibo */}
          <div className="text-xs text-slate-600 mb-8">
            <p className="mb-1">
              <strong>CORRESPONDIENTE DEL:</strong> {periodo.fecha_inicio} <strong>AL</strong> {periodo.fecha_fin}
            </p>
            <p>RECIBÍ DE CONFORMIDAD LA CANTIDAD ESPECIFICADA EN ESTE RECIBO COMO PAGO DE MIS SERVICIOS.</p>
          </div>

          <div className="flex justify-center pt-8">
            <div className="border-t border-slate-800 w-64 text-center text-xs font-bold pt-1">
              FIRMA DEL EMPLEADO
            </div>
          </div>
        </div>
      </div>

      {/* Reglas CSS para impresión limpia en PDF */}
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