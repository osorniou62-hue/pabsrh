import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

export default function ReciboNomina() {
  const { empleadoId, periodoId } = useParams();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mostrarConfigPanel, setMostrarConfigPanel] = useState(false);

  // Campos seleccionados para mostrar en los recibos (Configuración personalizada)
  const [camposVisibles, setCamposVisibles] = useState({
    sueldoBase: true,
    sueldoVacaciones: true,
    primaVacacional: true,
    aguinaldo: true,
    ptu: true,
    bonoImportado: true,
    vacacionesDias: true,
    faltasJustificadas: true,
    faltasInjustificadas: true,
  });

  useEffect(() => {
    cargarDatosRecibo();
    cargarConfiguracionCamposTablas();
  }, [empleadoId, periodoId]);

  const cargarDatosRecibo = async () => {
    setLoading(true);
    const { data: nominaData, error: errNom } = await supabase
      .from("nomina")
      .select(`
        *,
        empleados (*),
        periodos_nomina (*)
      `)
      .eq("empleado_id", empleadoId)
      .eq("periodo_id", periodoId)
      .maybeSingle();

    if (errNom || !nominaData) {
      console.error("Error al cargar recibo:", errNom);
      setLoading(false);
      return;
    }

    setDatos(nominaData);
    setLoading(false);
  };

  // Cargar configuración desde configuracion_tablas si existe
  const cargarConfiguracionCamposTablas = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_tablas")
        .select("*")
        .ilike("tabla", "%nomina%")
        .maybeSingle();

      if (!error && data && data.configuracion) {
        let cfg = data.configuracion;
        if (typeof cfg === "string") cfg = JSON.parse(cfg);
        if (cfg) setCamposVisibles((prev) => ({ ...prev, ...cfg }));
      }
    } catch (e) {
      console.error("No se encontró configuración personalizada, usando por defecto.", e);
    }
  };

  const guardarConfiguracionPanel = async () => {
    try {
      await supabase.from("configuracion_tablas").upsert([
        {
          tabla: "recibo_nomina_config",
          configuracion: JSON.stringify(camposVisibles),
        },
      ], { onConflict: "tabla" });

      alert("¡Configuración de campos guardada correctamente!");
      setMostrarConfigPanel(false);
    } catch (e) {
      alert("Error al guardar la configuración: " + e.message);
    }
  };

  if (loading) {
    return <div className="p-10 text-center font-medium">Cargando recibos de nómina...</div>;
  }

  if (!datos) {
    return <div className="p-10 text-center text-red-600 font-bold">No se encontró información de nómina para este recibo.</div>;
  }

  const emp = datos.empleados || {};
  const per = datos.periodos_nomina || {};
  const periodoTexto = `${per.fecha_inicio || ""}AL${per.fecha_fin || ""}`.replace(/-/g, "");

  return (
    <div className="max-w-3xl mx-auto p-6 bg-slate-100 min-h-screen print:bg-white print:p-0">
      
      {/* BARRA DE ACCIONES Y PANEL DE CONFIGURACIÓN */}
      <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm print:hidden">
        <button
          onClick={() => setMostrarConfigPanel(!mostrarConfigPanel)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
        >
          ⚙️ {mostrarConfigPanel ? "Ocultar Relación de Campos" : "Configurar Campos del Recibo"}
        </button>

        <button
          onClick={() => window.print()}
          className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-black transition shadow-sm"
        >
          🖨️ Imprimir Recibos
        </button>
      </div>

      {/* PANEL FLOTANTE DE RELACIÓN DE CAMPOS */}
      {mostrarConfigPanel && (
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6 border border-indigo-100 print:hidden">
          <h3 className="font-bold text-slate-800 text-sm mb-2">Panel de Relación de Campos (Visibilidad en Recibos)</h3>
          <p className="text-xs text-gray-500 mb-4">Selecciona qué conceptos deseas que aparezcan impresos en los recibos oficiales y complementarios.</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-4">
            {Object.keys(camposVisibles).map((campo) => (
              <label key={campo} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={camposVisibles[campo]}
                  onChange={(e) => setCamposVisibles({ ...camposVisibles, [campo]: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-700 capitalize">{campo.replace(/([A-Z])/g, ' $1')}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={guardarConfiguracionPanel}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
            >
              💾 Guardar Configuración de Campos
            </button>
          </div>
        </div>
      )}

      <div className="space-y-8">
        
        {/* ================= 1. RECIBO OFICIAL ================= */}
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-2">
          <div className="text-center border-b pb-3 mb-4">
            <h2 className="text-lg font-black tracking-wider text-slate-900">RECIBO OFICIAL</h2>
          </div>

          <div className="text-xs space-y-1 mb-4">
            <p><strong>FECHA DE PAGO:</strong> —</p>
            <p className="font-bold text-slate-800 text-sm">NOMBRE: {emp.nombre_completo}</p>
            <p className="font-mono">{emp.numero_empleado}</p>
          </div>

          <div className="border-t border-b py-3 space-y-2 text-xs">
            {camposVisibles.sueldoBase && (
              <div className="flex justify-between">
                <span>SUELDO BASE</span>
                <span className="font-mono">${Number(datos.sueldo_base || 0).toFixed(2)}</span>
              </div>
            )}
            {camposVisibles.sueldoVacaciones && (
              <div className="flex justify-between">
                <span>SUELDO VACACIONES</span>
                <span className="font-mono">${Number(datos.sueldo_vacaciones || 0).toFixed(2)}</span>
              </div>
            )}
            {camposVisibles.primaVacacional && (
              <div className="flex justify-between">
                <span>PRIMA VACACIONAL</span>
                <span className="font-mono">${Number(datos.prima_vacacional || 0).toFixed(2)}</span>
              </div>
            )}
            {camposVisibles.aguinaldo && (
              <div className="flex justify-between">
                <span>AGUINALDO</span>
                <span className="font-mono">${Number(datos.aguinaldo || 0).toFixed(2)}</span>
              </div>
            )}
            {camposVisibles.ptu && (
              <div className="flex justify-between">
                <span>PTU</span>
                <span className="font-mono">${Number(datos.ptu || 0).toFixed(2)}</span>
              </div>
            )}

            {camposVisibles.vacacionesDias && (
              <div className="flex justify-between text-slate-600">
                <span>V (Vacaciones)</span>
                <span className="font-mono">{datos.dias_vacaciones || 0}</span>
              </div>
            )}
            {camposVisibles.faltasJustificadas && (
              <div className="flex justify-between text-slate-600">
                <span>J (Faltas Justificadas)</span>
                <span className="font-mono">{datos.faltas_justificadas || 0}</span>
              </div>
            )}
            {camposVisibles.faltasInjustificadas && (
              <div className="flex justify-between text-slate-600">
                <span>FI (Faltas Injustificadas)</span>
                <span className="font-mono">{datos.faltas_injustificadas || 0}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>AUSENCIAS</span>
              <span className="font-mono text-red-600">${Number(datos.descuento_ausencias || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="py-3 border-b space-y-2 text-xs font-semibold">
            <div className="flex justify-between text-green-700">
              <span>PERCEPCIONES</span>
              <span className="font-mono">${Number(datos.total_percepciones || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-700">
              <span>DEDUCCIONES</span>
              <span className="font-mono">${Number(datos.total_descuentos || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
              <span>TOTAL PAGO</span>
              <span className="font-mono">${Number(datos.neto_pagar || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-4 pt-2 text-[11px] text-slate-600 space-y-4">
            <p>RECIBI DE CONFORMIDAD:</p>
            <p>CORRESPONDIENTE: {periodoTexto}</p>
            <div className="pt-12 text-center border-t border-slate-400 w-1/2 mx-auto">
              <p className="font-bold">FIRMA</p>
            </div>
          </div>
        </div>

        {/* ================= 2. RECIBO COMPLEMENTARIO / BONOS ================= */}
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-2">
          <div className="text-center border-b pb-3 mb-4">
            <h2 className="text-lg font-black tracking-wider text-slate-900">RECIBO COMPLEMENTARIO / BONOS</h2>
          </div>

          <div className="text-xs space-y-1 mb-4">
            <p><strong>FECHA DE PAGO:</strong> —</p>
            <p className="font-bold text-slate-800 text-sm">NOMBRE: {emp.nombre_completo}</p>
            <p className="font-mono">{emp.numero_empleado}</p>
          </div>

          <div className="border-t border-b py-3 space-y-2 text-xs">
            {camposVisibles.bonoImportado && (
              <div className="flex justify-between">
                <span>BONO IMPORTADO</span>
                <span className="font-mono text-green-600">${Number(datos.total_bonos || 0).toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>V</span>
              <span className="font-mono">0</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>FJ</span>
              <span className="font-mono">0</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>FI</span>
              <span className="font-mono">0</span>
            </div>

            <div className="flex justify-between">
              <span>SIN DEDUCCIONES</span>
              <span className="font-mono">$0.00</span>
            </div>
          </div>

          <div className="py-3 border-b space-y-2 text-xs font-semibold">
            <div className="flex justify-between text-green-700">
              <span>TOTAL PERCEPCIONES</span>
              <span className="font-mono">${Number(datos.total_bonos || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-700">
              <span>TOTAL DEDUCCIONES</span>
              <span className="font-mono">$0.00</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
              <span>NETO A PAGAR</span>
              <span className="font-mono">${Number(datos.total_bonos || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-4 pt-2 text-[11px] text-slate-600 space-y-4">
            <p>RECIBI DE CONFORMIDAD:</p>
            <p>CORRESPONDIENTE: {periodoTexto}</p>
            <div className="pt-12 text-center border-t border-slate-400 w-1/2 mx-auto">
              <p className="font-bold">FIRMA</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}