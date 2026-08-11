import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { supabase } from "../services/supabase";

export default function ConfiguracionTablas() {
  const [archivo, setArchivo] = useState(null);
  const [columnasDetectadas, setColumnasDetectadas] = useState([]);
  
  // Mapeo dinámico: Relaciona cada columna del Excel con una Tabla de Supabase y un Campo libre
  const [asignacionColumnas, setAsignacionColumnas] = useState({});
  
  // Control de módulos activos / inactivos
  const [modulosActivos, setModulosActivos] = useState({
    empleados: true,
    incidencias: true,
    vacaciones: true,
    prestamos: true,
  });

  const [guardando, setGuardando] = useState(false);

  // Sugerencias comunes de campos por cada tabla de Supabase (puedes escribir cualquiera)
  const sugerenciasCampos = {
    empleados: ["numero_empleado", "nombre_completo", "puesto", "departamento", "fecha_ingreso", "sueldo_base", "bono_puesto"],
    incidencias: ["horas_extra", "bono_puntualidad", "bono_asistencia", "monto_final_semanal"],
    vacaciones: ["dias_vacaciones", "fecha_inicio", "fecha_fin"],
    prestamos: ["descuento_varios", "saldo_prestamo", "monto_prestamo"],
  };

  // Cargar configuración previa desde Supabase al iniciar
  useEffect(() => {
    cargarConfiguracionDeSupabase();
  }, []);

  const cargarConfiguracionDeSupabase = async () => {
    try {
      const { data } = await supabase
        .from("configuracion_tablas")
        .select("configuracion")
        .eq("clave", "config_mapeo_columnas_dinamico")
        .maybeSingle();

      if (data && data.configuracion) {
        if (data.configuracion.asignacion) setAsignacionColumnas(data.configuracion.asignacion);
        if (data.configuracion.modulos) setModulosActivos(data.configuracion.modulos);
        if (data.configuracion.columnas) setColumnasDetectadas(data.configuracion.columnas);
      }
    } catch (err) {
      console.error("Error al cargar la configuración de Supabase:", err);
    }
  };

  // 1. Analizar archivo y extraer todas las columnas con título
  const analizarColumnasArchivo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setArchivo(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (rows && rows.length > 0) {
          const encabezadosValidos = rows[0]
            .map((h) => String(h || "").trim())
            .filter((h) => h !== "");

          setColumnasDetectadas(encabezadosValidos);

          // Sugerencia automática inteligente
          const nuevaAsignacion = {};
          encabezadosValidos.forEach((col) => {
            const colUpper = col.toUpperCase();
            let encontradaTabla = "";
            let encontradoCampo = "";

            Object.keys(sugerenciasCampos).forEach((tabla) => {
              sugerenciasCampos[tabla].forEach((campo) => {
                if (!encontradaTabla && (colUpper.includes(campo.toUpperCase()) || colUpper.replace(/[_]/g, " ").includes(campo.replace(/[_]/g, " ")))) {
                  encontradaTabla = tabla;
                  encontradoCampo = campo;
                }
              });
            });

            nuevaAsignacion[col] = {
              tablaDestino: encontradaTabla || "",
              campoDestino: encontradoCampo || col.toLowerCase().replace(/\s+/g, "_"),
            };
          });

          setAsignacionColumnas(nuevaAsignacion);
          alert(`✅ ¡Se detectaron e importaron ${encabezadosValidos.length} columnas con título! Revisa o personaliza sus campos destino.`);
        }
      } catch (error) {
        console.error("Error al leer el archivo:", error);
        alert("No se pudieron procesar las columnas del archivo.");
      }
    };

    reader.readAsBinaryString(file);
  };

  // 2. Modificar la asignación o el nombre del campo destino libremente
  const handleCambioAsignacion = (columna, tipo, valor) => {
    setAsignacionColumnas((prev) => ({
      ...prev,
      [columna]: {
        ...(prev[columna] || { tablaDestino: "", campoDestino: "" }),
        [tipo]: valor,
      },
    }));
  };

  const toggleModulo = (modulo) => {
    setModulosActivos((prev) => ({ ...prev, [modulo]: !prev[modulo] }));
  };

  // 3. Guardar y actualizar las tablas en Supabase
  const guardarYActualizarSupabase = async () => {
    try {
      setGuardando(true);

      const payloadConfiguracion = {
        asignacion: asignacionColumnas,
        modulos: modulosActivos,
        columnas: columnasDetectadas,
        actualizado_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("configuracion_tablas")
        .upsert({
          clave: "config_mapeo_columnas_dinamico",
          configuracion: payloadConfiguracion,
        }, {
          onConflict: "clave",
        });

      if (error) throw error;

      localStorage.setItem("config_mapeo_columnas_dinamico", JSON.stringify(payloadConfiguracion));

      alert("🎉 ¡Configuración guardada y campos actualizados en Supabase con éxito!");
    } catch (error) {
      console.error("Error al guardar en Supabase:", error.message);
      alert("Hubo un error al actualizar las tablas en Supabase.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Administración y Mapeo de Columnas</h1>
          <p className="text-gray-500 mt-1">
            Analiza las columnas de tu archivo, asígnalas a una tabla y personaliza el nombre exacto del campo destino en Supabase.
          </p>
        </div>

        {/* PASO 1: Subir Archivo y Analizar Columnas */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">1. Cargar archivo Excel para importar columnas con título</h2>
          <p className="text-sm text-gray-500 mb-4">
            Sube tu archivo de nómina para extraer de forma dinámica todas las cabeceras disponibles.
          </p>
          <input 
            type="file" 
            accept=".csv,.xlsx,.xls" 
            onChange={analizarColumnasArchivo} 
            className="border rounded-xl p-3 w-full bg-slate-50 text-sm cursor-pointer" 
          />
        </div>

        {/* PASO 2: Control de Módulos Activos */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">2. Módulos y Tablas Activas en el Sistema</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            {Object.keys(modulosActivos).map((mod) => (
              <label key={mod} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${modulosActivos[mod] ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}>
                <span className="capitalize font-semibold text-slate-700">{mod}</span>
                <input 
                  type="checkbox" 
                  checked={modulosActivos[mod]} 
                  onChange={() => toggleModulo(mod)}
                  className="w-4 h-4 text-blue-600 rounded" 
                />
              </label>
            ))}
          </div>
        </div>

        {/* PASO 3: Asignar columnas, tablas y nombre de campo libre */}
        {columnasDetectadas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Configurar Tabla y Campo Destino en Supabase</h2>
            <p className="text-sm text-gray-500 mb-6">
              Indica a qué tabla pertenece la columna y escribe el nombre exacto de la columna en tu base de datos Supabase.
            </p>

            <div className="space-y-4">
              {columnasDetectadas.map((colOriginal, idx) => {
                const asignacionActual = asignacionColumnas[colOriginal] || { tablaDestino: "", campoDestino: "" };
                const tablaSeleccionada = asignacionActual.tablaDestino;

                return (
                  <div key={idx} className="p-4 rounded-xl border bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    
                    {/* Nombre de la columna original en el archivo */}
                    <div className="flex items-center gap-3 w-full md:w-1/3">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-lg">#{idx + 1}</span>
                      <span className="font-bold text-slate-800 text-sm break-all">{colOriginal}</span>
                    </div>

                    {/* Selector de Tabla de Supabase */}
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Tabla Destino:</label>
                      <select
                        value={tablaSeleccionada}
                        onChange={(e) => handleCambioAsignacion(colOriginal, "tablaDestino", e.target.value)}
                        className="border rounded-lg p-2 bg-white text-sm font-medium"
                      >
                        <option value="">-- Ignorar / No usar --</option>
                        <option value="empleados">👥 Empleados</option>
                        <option value="incidencias">⚡ Incidencias</option>
                        <option value="vacaciones">🌴 Vacaciones</option>
                        <option value="prestamos">💳 Préstamos</option>
                      </select>
                    </div>

                    {/* Campo Específico Destino (Editable / Libre) */}
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Nombre del Campo en Supabase:</label>
                      <input 
                        type="text"
                        value={asignacionActual.campoDestino || ""}
                        onChange={(e) => handleCambioAsignacion(colOriginal, "campoDestino", e.target.value)}
                        placeholder="Ej. sueldo_base, prestamo..."
                        className="border rounded-lg p-2 bg-white text-sm font-mono text-slate-700"
                        disabled={!tablaSeleccionada}
                      />
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Botón de Guardado General */}
            <div className="mt-8 flex justify-end">
              <button 
                onClick={guardarYActualizarSupabase}
                disabled={guardando}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg transition-all"
              >
                {guardando ? "Actualizando tablas en Supabase..." : "💾 Guardar y Actualizar Tablas en Supabase"}
              </button>
            </div>

          </div>
        )}

      </div>
    </Layout>
  );
}