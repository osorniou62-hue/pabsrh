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

  // Normalizador flexible para comparar palabras sin importar acentos ni mayúsculas
  const normalizar = (texto) =>
    (texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  // Helper flexible de búsqueda de bonos
  const obtenerMontoBono = (palabraClave) => {
    const item = bonosList.find((b) =>
      normalizar(b.concepto).includes(normalizar(palabraClave))
    );
    return Number(item?.importe || 0);
  };

  // Helper flexible de búsqueda de descuentos
  const obtenerMontoDescuento = (palabraClave) => {
    const item = descuentosList.find((d) =>
      normalizar(d.concepto).includes(normalizar(palabraClave))
    );
    return Number(item?.importe || 0);
  };

  // Horas Extras desde incidencias
  const totalHorasExtraHoras = incidenciasList.reduce(
    (acc, curr) => acc + Number(curr.horas_extra || 0),
    0
  );
  const totalPagoHorasExtra = Number(datos?.total_horas_extra || 0);

  // Mapeo flexible de Bonos
  const bonoPuesto = obtenerMontoBono("puesto");
  const bonoPuntualidad = obtenerMontoBono("puntualidad");
  const bonoAsistencia = obtenerMontoBono("asistencia");
  const bonoMultiplicador = obtenerMontoBono("multiplicador");
  const bonoDesempeno = obtenerMontoBono("desempeno");
  const apoyoMedico = obtenerMontoBono("medico");
  const bonoExtras = obtenerMontoBono("extra");
  const gratificacionEspecial = obtenerMontoBono("gratificacion") || obtenerMontoBono("especial");

  // Suma de bonos no categorizados
  const palabrasClaveBonos = ["puesto", "puntualidad", "asistencia", "multiplicador", "desempeno", "medico", "extra", "gratificacion", "especial"];
  const otrosBonos = bonosList
    .filter((b) => !palabrasClaveBonos.some((k) => normalizar(b.concepto).includes(k)))
    .reduce((acc, curr) => acc + Number(curr.importe || 0), 0);

  // Mapeo flexible de Descuentos
  const bajoDesempeno = obtenerMontoDescuento("desempeno");
  const epp = obtenerMontoDescuento("epp");
  const prestamo = obtenerMontoDescuento("prestamo");
  const ausencias = obtenerMontoDescuento("ausencia");

  // Suma de descuentos no categorizados
  const palabrasClaveDesc = ["desempeno", "epp", "prestamo", "ausencia"];
  const otrosDescuentos = descuentosList
    .filter((d) => !palabrasClaveDesc.some((k) => normalizar(d.concepto).includes(k)))
    .reduce((acc, curr) => acc + Number(curr.importe || 0), 0);

  // Cálculo de totales para el recibo 2 (Complementos/Bonos)
  const totalBonosYComplementos =
    totalPagoHorasExtra +
    bonoPuesto +
    bonoPuntualidad +
    bonoAsistencia +
    bonoMultiplicador +
    bonoDesempeno +
    apoyoMedico +
    bonoExtras +
    gratificacionEspecial +
    otrosBonos;

  const totalDeduccionesComplemento =
    bajoDesempeno + epp + prestamo + otrosDescuentos;

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
                <span>${Number(ausencias || datos?.descuento_ausencias || 0).toFixed(2)}</span>
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
              <span>${Number(ausencias || datos?.descuento_ausencias || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>TOTAL PAGO</span>
            <span>${(Number(datos?.sueldo_base || 0) - Number(ausencias || 0)).toFixed(2)}</span>
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

          {/* Tabla Desglose Recibo 2 */}
          <div className="grid grid-cols-12 border-t border-b border-black py-2 my-2 gap-2">
            <div className="col-span-7 pr-2 border-r border-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>HRS. EXTRAS ({totalHorasExtraHoras} hrs)</span>
                <span>${totalPagoHorasExtra.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO POR PUESTO</span>
                <span>${bonoPuesto.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO PUNTUALIDAD</span>
                <span>${bonoPuntualidad.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO ASISTENCIA</span>
                <span>${bonoAsistencia.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO MULTIPLICADOR</span>
                <span>${bonoMultiplicador.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO DESEMPEÑO</span>
                <span>${bonoDesempeno.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>APOYO MEDICO</span>
                <span>${apoyoMedico.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>BONO EXTRAS / OTROS</span>
                <span>${(bonoExtras + otrosBonos).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GRATIFICACIÓN ESPECIAL</span>
                <span>${gratificacionEspecial.toFixed(2)}</span>
              </div>
            </div>

            <div className="col-span-5 pl-2 space-y-1">
              <div className="flex justify-between">
                <span>V</span>
                <span>{datos?.dias_vacaciones || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>FJ</span>
                <span>{datos?.faltas_justificadas || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>FI</span>
                <span>{datos?.faltas_injustificadas || 0}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span>BAJO DESEMPEÑO</span>
                <span>${bajoDesempeno.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>EPP</span>
                <span>${epp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>DESCUENTOS GRAL / OTROS</span>
                <span>${otrosDescuentos.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PRESTAMO</span>
                <span>${prestamo.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Totales Recibo 2 */}
          <div className="grid grid-cols-12 font-bold py-1 my-1">
            <div className="col-span-7 flex justify-between pr-2">
              <span>TOTAL PERCEPCIONES</span>
              <span>${totalBonosYComplementos.toFixed(2)}</span>
            </div>
            <div className="col-span-5 flex justify-between pl-2">
              <span>TOTAL DEDUCCIONES</span>
              <span>${totalDeduccionesComplemento.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1">
            <span>NETO A PAGAR</span>
            <span>${(totalBonosYComplementos - totalDeduccionesComplemento).toFixed(2)}</span>
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