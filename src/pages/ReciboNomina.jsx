import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

export default function ReciboNomina() {
  const { empleadoId, periodoId } = useParams();
  const [datos, setDatos] = useState(null);
  const [bonosList, setBonosList] = useState([]);
  const [descuentosList, setDescuentosList] = useState([]);
  const [incidenciasList, setIncidenciasList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatosRecibo();
  }, [empleadoId, periodoId]);

  const cargarDatosRecibo = async () => {
    setLoading(true);

    // 1. Datos maestro de la nómina
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

    // 2. Tablas relacionales con el desglose exacto
    const { data: bonos } = await supabase
      .from("bonos_empleado")
      .select("*")
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId);

    const { data: descuentos } = await supabase
      .from("descuentos_empleado")
      .select("*")
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId);

    const { data: incidencias } = await supabase
      .from("incidencias")
      .select("*")
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId);

    setDatos(nomina);
    setBonosList(bonos || []);
    setDescuentosList(descuentos || []);
    setIncidenciasList(incidencias || []);
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

  // Cálculo total de horas extra
  const totalHorasExtraCant = incidenciasList.reduce(
    (acc, curr) => acc + Number(curr.horas_extra || 0),
    0
  );
  const totalPagoHorasExtra = Number(datos?.total_horas_extra || 0);

  // Totales calculados dinámicamente a partir de los arreglos
  const totalBonosCalculado = bonosList.reduce(
    (acc, curr) => acc + Number(curr.importe || 0),
    0
  );

  const totalDescuentosCalculado = descuentosList.reduce(
    (acc, curr) => acc + Number(curr.importe || 0),
    0
  );

  const totalPercepcionesComp = totalPagoHorasExtra + totalBonosCalculado;
  const totalNetoComp = totalPercepcionesComp - totalDescuentosCalculado;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      {/* Botón de impresión */}
      <div className="no-print mb-6">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow-md transition"
        >
          🖨️ Imprimir Recibos / Guardar PDF
        </button>
      </div>

      {/* Contenedor Hoja Completa */}
      <div className="w-full max-w-3xl bg-white p-6 border border-gray-300 shadow-xl font-sans text-xs text-black print:shadow-none print:border-none print:p-0">
        
        {/* ==========================================
            PRIMER RECIBO (SUELDO BASE / OFICIAL)
           ========================================== */}
        <div className="border border-black p-4 mb-6">
          <div className="flex justify-between items-center font-bold border-b border-black pb-1 mb-2 text-sm">
            <span>RECIBO OFICIAL</span>
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
              <span className="font-normal">{emp?.numero_empleado || "—"}</span>
            </div>
          </div>

          {/* Tabla Desglose Recibo 1 */}
          <div className="grid grid-cols-12 border-t border-b border-black py-2 my-2 gap-2">
            <div className="col-span-7 pr-2 border-r border-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>SUELDO BASE</span>
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

            <div className="col-span-5 pl-2 space-y-1">
              <div className="flex justify-between">
                <span>V (Vacaciones)</span>
                <span>{datos?.dias_vacaciones || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>J (Faltas Justificadas)</span>
                <span>{datos?.faltas_justificadas || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>FI (Faltas Injustificadas)</span>
                <span>{datos?.faltas_injustificadas || 0}</span>
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
              <span>${Number(datos?.sueldo_base || 0).toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>DEDUCCIONES</span>
              <span>${Number(datos?.descuento_ausencias || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>TOTAL PAGO</span>
            <span>${(Number(datos?.sueldo_base || 0) - Number(datos?.descuento_ausencias || 0)).toFixed(2)}</span>
          </div>

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
            <span>RECIBO COMPLEMENTARIO / BONOS</span>
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
              <span className="font-normal">{emp?.numero_empleado || "—"}</span>
            </div>
          </div>

          {/* Tabla Desglose Recibo 2 (Mapeo Dinámico) */}
          <div className="grid grid-cols-12 border-t border-b border-black py-2 my-2 gap-2">
            
            {/* Columna de Percepciones Complementarias */}
            <div className="col-span-7 pr-2 border-r border-gray-300 space-y-1">
              {totalHorasExtraCant > 0 && (
                <div className="flex justify-between font-medium">
                  <span>HRS. EXTRAS ({totalHorasExtraCant} hrs)</span>
                  <span>${totalPagoHorasExtra.toFixed(2)}</span>
                </div>
              )}

              {/* Lista dinámica de Bonos */}
              {bonosList.length > 0 ? (
                bonosList.map((bono, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="uppercase">{bono.concepto || "BONO"}</span>
                    <span>${Number(bono.importe || 0).toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-gray-400 italic">
                  <span>SIN BONOS</span>
                  <span>$0.00</span>
                </div>
              )}
            </div>

            {/* Columna de Deducciones Complementarias */}
            <div className="col-span-5 pl-2 space-y-1">
              <div className="flex justify-between">
                <span>V</span>
                <span>{datos?.dias_vacaciones || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>FJ</span>
                <span>{datos?.faltas_justificadas || 0}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span>FI</span>
                <span>{datos?.faltas_injustificadas || 0}</span>
              </div>

              {/* Lista dinámica de Descuentos */}
              {descuentosList.length > 0 ? (
                descuentosList.map((desc, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="uppercase">{desc.concepto || "DESCUENTO"}</span>
                    <span>${Number(desc.importe || 0).toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-gray-400 italic">
                  <span>SIN DEDUCCIONES</span>
                  <span>$0.00</span>
                </div>
              )}
            </div>
          </div>

          {/* Totales Recibo 2 */}
          <div className="grid grid-cols-12 font-bold py-1 my-1">
            <div className="col-span-7 flex justify-between pr-2">
              <span>TOTAL PERCEPCIONES</span>
              <span>${totalPercepcionesComp.toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>TOTAL DEDUCCIONES</span>
              <span>${totalDescuentosCalculado.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>NETO A PAGAR</span>
            <span>${totalNetoComp.toFixed(2)}</span>
          </div>

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