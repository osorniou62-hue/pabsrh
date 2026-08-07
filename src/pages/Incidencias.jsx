import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Incidencias() {
  const [empleados, setEmpleados] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [incidencias, setIncidencias] = useState([]);

  const [form, setForm] = useState({
    empleado_id: "",
    periodo_id: "",
    horas_extra: 0,
    faltas: 0,
    permisos: 0,
    vacaciones: 0,
    incapacidades: 0,
    observaciones: "",
  });

  useEffect(() => {
    cargarEmpleados();
    cargarPeriodos();
    cargarIncidencias();
  }, []);

  const cargarEmpleados = async () => {
    // Asegúrate de pedir el salario_mensual o salario_diario
    const { data, error } = await supabase
      .from("empleados")
      .select("id, nombre_completo, salario_mensual")
      .eq("activo", true)
      .order("nombre_completo");

    if (error) console.error("Error al cargar empleados:", error.message);
    else setEmpleados(data || []);
  };

  const cargarPeriodos = async () => {
    const { data, error } = await supabase
      .from("periodos_nomina")
      .select("*")
      .eq("estatus", "ABIERTO");

    if (error) console.error("Error al cargar periodos:", error.message);
    else setPeriodos(data || []);
  };

  const cargarIncidencias = async () => {
    const { data, error } = await supabase
      .from("incidencias")
      .select(`
        *,
        empleados (
          nombre_completo,
          salario_mensual
        ),
        periodos_nomina (
          descripcion,
          dias_periodo
        )
      `)
      .order("created_at", { ascending: false });

    if (error) console.error("Error al cargar incidencias:", error.message);
    else setIncidencias(data || []);
  };

  const actualizarCampo = (campo, valor) => {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };

  // 🧮 Función Helper para calcular el impacto financiero
  const calcularNominaIncidencia = (empleado, incidencia, diasPeriodo = 15) => {
    const salarioMensual = empleado?.salario_mensual || 0;
    const salarioDiario = salarioMensual / 30;
    const valorHora = salarioDiario / 8; // Jornada de 8 horas

    // Percepciones adicionales
    const pagoHorasExtra = (Number(incidencia.horas_extra) || 0) * (valorHora * 2);

    // Deducciones
    const descuentoFaltas = (Number(incidencia.faltas) || 0) * salarioDiario;
    
    // Sueldo base del periodo
    const sueldoBasePeriodo = salarioDiario * diasPeriodo;

    // Neto estimado
    const netoEstimado = sueldoBasePeriodo + pagoHorasExtra - descuentoFaltas;

    return {
      salarioDiario,
      pagoHorasExtra,
      descuentoFaltas,
      netoEstimado: netoEstimado < 0 ? 0 : netoEstimado,
    };
  };

  const guardarIncidencia = async () => {
    if (!form.empleado_id || !form.periodo_id) {
      alert("Por favor selecciona un empleado y un periodo de nómina.");
      return;
    }

    const payload = {
      ...form,
      empleado_id: Number(form.empleado_id),
      periodo_id: Number(form.periodo_id),
      horas_extra: Number(form.horas_extra) || 0,
      faltas: Number(form.faltas) || 0,
      permisos: Number(form.permisos) || 0,
      vacaciones: Number(form.vacaciones) || 0,
      incapacidades: Number(form.incapacidades) || 0,
    };

    const { error } = await supabase.from("incidencias").insert([payload]);

    if (error) {
      alert("Error al guardar: " + error.message);
      return;
    }

    alert("Incidencia guardada exitosamente");

    setForm({
      empleado_id: "",
      periodo_id: "",
      horas_extra: 0,
      faltas: 0,
      permisos: 0,
      vacaciones: 0,
      incapacidades: 0,
      observaciones: "",
    });

    cargarIncidencias();
  };

  // Obtener datos del empleado seleccionado en el formulario para la vista previa
  const empleadoSeleccionado = empleados.find(
    (e) => e.id === Number(form.empleado_id)
  );
  
  const simulacionForm = empleadoSeleccionado 
    ? calcularNominaIncidencia(empleadoSeleccionado, form)
    : null;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">
        📋 Registro de Incidencias y Cálculo de Nómina
      </h1>

      {/* FORMULARIO */}
      <div className="bg-white p-6 rounded-lg shadow mb-6 border border-gray-100">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Captura de Novedades</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Empleado *
            </label>
            <select
              value={form.empleado_id}
              onChange={(e) => actualizarCampo("empleado_id", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_completo} (${emp.salario_mensual?.toLocaleString()}/mes)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Periodo de Nómina *
            </label>
            <select
              value={form.periodo_id}
              onChange={(e) => actualizarCampo("periodo_id", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Seleccionar periodo</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Horas Extras (Doble)
            </label>
            <input
              type="number"
              min="0"
              value={form.horas_extra}
              onChange={(e) => actualizarCampo("horas_extra", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Faltas (Días)
            </label>
            <input
              type="number"
              min="0"
              value={form.faltas}
              onChange={(e) => actualizarCampo("faltas", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permisos (Días)
            </label>
            <input
              type="number"
              min="0"
              value={form.permisos}
              onChange={(e) => actualizarCampo("permisos", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vacaciones (Días)
            </label>
            <input
              type="number"
              min="0"
              value={form.vacaciones}
              onChange={(e) => actualizarCampo("vacaciones", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Incapacidades (Días)
            </label>
            <input
              type="number"
              min="0"
              value={form.incapacidades}
              onChange={(e) => actualizarCampo("incapacidades", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              placeholder="Notas o motivo..."
              value={form.observaciones}
              onChange={(e) => actualizarCampo("observaciones", e.target.value)}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              rows="2"
            />
          </div>
        </div>

        {/* CÁLCULO EN TIEMPO REAL / PREVISUALIZACIÓN */}
        {simulacionForm && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">Salario Diario:</span>
              <span className="font-bold text-gray-800">
                ${simulacionForm.salarioDiario.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-green-600 block">+ Pago Hrs Extra:</span>
              <span className="font-bold text-green-700">
                +${simulacionForm.pagoHorasExtra.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-red-600 block">- Descuento Faltas:</span>
              <span className="font-bold text-red-700">
                -${simulacionForm.descuentoFaltas.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-blue-600 block">Estimado Percepción Periodo:</span>
              <span className="font-bold text-blue-900 text-base">
                ${simulacionForm.netoEstimado.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={guardarIncidencia}
          className="mt-4 bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700 transition-colors"
        >
          Guardar Incidencia
        </button>
      </div>

      {/* TABLA CON DETALLE FINANCIERO */}
      <div className="bg-white p-6 rounded-lg shadow border border-gray-100 overflow-x-auto">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Historial con Impacto Monetario</h2>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 border-b text-gray-700">
              <th className="p-2 border">Empleado</th>
              <th className="p-2 border">Periodo</th>
              <th className="p-2 border text-center">Hrs Extra</th>
              <th className="p-2 border text-center">Faltas</th>
              <th className="p-2 border text-right">Monto Hrs Extra</th>
              <th className="p-2 border text-right">Desc. Faltas</th>
              <th className="p-2 border text-right bg-blue-50">Total Ajuste Incidencias</th>
            </tr>
          </thead>
          <tbody>
            {incidencias.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center p-4 text-gray-500">
                  No hay incidencias registradas.
                </td>
              </tr>
            ) : (
              incidencias.map((item) => {
                const calculo = calcularNominaIncidencia(
                  item.empleados,
                  item,
                  item.periodos_nomina?.dias_periodo || 15
                );
                const ajusteNeto = calculo.pagoHorasExtra - calculo.descuentoFaltas;

                return (
                  <tr key={item.id} className="hover:bg-gray-50 border-b">
                    <td className="p-2 border font-medium">
                      {item.empleados?.nombre_completo || "N/A"}
                    </td>
                    <td className="p-2 border">
                      {item.periodos_nomina?.descripcion || "N/A"}
                    </td>
                    <td className="p-2 border text-center">{item.horas_extra}h</td>
                    <td className="p-2 border text-center">{item.faltas}d</td>
                    <td className="p-2 border text-right text-green-600 font-medium">
                      +${calculo.pagoHorasExtra.toFixed(2)}
                    </td>
                    <td className="p-2 border text-right text-red-600 font-medium">
                      -${calculo.descuentoFaltas.toFixed(2)}
                    </td>
                    <td className={`p-2 border text-right font-bold bg-blue-50 ${
                      ajusteNeto >= 0 ? "text-green-700" : "text-red-700"
                    }`}>
                      {ajusteNeto >= 0 ? `+$${ajusteNeto.toFixed(2)}` : `-$${Math.abs(ajusteNeto).toFixed(2)}`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}