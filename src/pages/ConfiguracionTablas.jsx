import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { supabase } from "../services/supabase";

export default function ConfiguracionTablas() {
  const [archivo, setArchivo] = useState(null);
  const [columnasDetectadas, setColumnasDetectadas] = useState([]);
  
  // Mapeo dinámico: Relaciona cada columna del Excel con una Tabla de Supabase y un Campo
  const [asignacionColumnas, setAsignacionColumnas] = useState({});
  
  // Control de módulos activos / inactivos
  const [modulosActivos, setModulosActivos] = useState({
    empleados: true,
    incidencias: true,
    vacaciones: true,
    prestamos: true,
  });

  const [guardando, setGuardando] = useState(false);

  // Catálogo oficial de tablas y campos existentes en Supabase
  const esquemaTablasSupabase = {
    empleados: [
      { key: "numero_empleado", label: "Número de Empleado" },
      { key: "nombre_completo", label: "Nombre Completo" },
      { key: "puesto", label: "Puesto" },
      { key: "departamento", label: "Departamento / Línea" },
      { key: "fecha_ingreso", label: "Fecha de Ingreso" },
      { key: "sueldo_base", label: "Sueldo Base" },
      { key: "bono_puesto", label: "Bono por Puesto" },
    ],
    incidencias: [
      { key: "horas_extra", label: "Horas Extra" },
      { key: "bono_puntualidad", label: "Bono de Puntualidad" },
      { key: "bono_asistencia", label: "Bono de Asistencia" },
      { key: "monto_final_semanal", label: "Monto Final Semanal" },
    ],
    vacaciones: [
      { key: "dias_vacaciones", label: "Días de Vacaciones" },
    ],
    prestamos: [
      { key: "descuento_varios", label: "Descuento / Préstamo Semanal" },
      { key: "saldo_prestamo", label: "Saldo / Adeudo Pendiente" },
    ],
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

          // Sugerencia automática inteligente basada en nombres similares
          const nuevaAsignacion = {};
          encabezadosValidos.forEach((col) => {
            const colUpper = col.toUpperCase();
            let encontrada = false;

            Object.keys(esquemaTablasSupabase).forEach((tabla) => {
              esquemaTablasSupabase[tabla].forEach((campo) => {
                if (!encontrada && (colUpper.includes(campo.key.toUpperCase()) || colUpper.includes(campo.label.toUpperCase()))) {
                  nuevaAsignacion[col] = { tablaDestino: tabla, campoDestino: campo.key };
                  encontrada = true;
                }
              });
            });

            if (!encontrada) {
              nuevaAsignacion[col] = { tablaDestino: "", campoDestino: "" };
            }
          });

          setAsignacionColumnas(nuevaAsignacion);
          alert(`✅ ¡Se detectaron e importaron ${encabezadosValidos.length} columnas con título! Ahora asígnalas a su tabla correspondiente.`);
        }
      } catch (error) {
        console.error("Error al leer el archivo:", error);
        alert("No se pudieron procesar las columnas del archivo.");
      }
    };

    reader.readAsBinaryString(file);
  };

  // 2. Modificar la asignación de una columna específica corregida
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

      alert("🎉 ¡Configuración guardada y tablas actualizadas en Supabase con éxito!");
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
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Administración y Asignación de Columnas</h1>
          <p className="text-gray-500 mt-1">
            Analiza las columnas de tu archivo, decide a qué tabla de Supabase pertenece cada una y actualiza los módulos del sistema.
          </p>
        </div>

        {/* PASO 1: Subir Archivo y Analizar Columnas */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">1. Cargar archivo Excel para importar columnas con título</h2>
          <p className="text-sm text-gray-500 mb-4">
            Sube tu archivo (ej. con columnas personalizadas como "Telempromt") para que el sistema liste todas sus cabeceras.
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
          <p className="text-sm text-gray-500 mb-4">Elige qué bases de datos operarán con esta configuración.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        {/* PASO 3: Asignar cada columna detectada a una Tabla de Supabase */}
        {columnasDetectadas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Administrar y Asignar Columnas del Excel</h2>
            <p className="text-sm text-gray-500 mb-6">
              Para cada columna encontrada en tu archivo, selecciona a qué tabla de Supabase (Empleados, Incidencias, Préstamos, Vacaciones) deseas enviarla.
            </p>

            <div className="space-y-4">
              {columnasDetectadas.map((colOriginal, idx) => {
                const asignacionActual = asignacionColumnas[colOriginal] || { tablaDestino: "", campoDestino: "" };
                const tablaSeleccionada = asignacionActual.tablaDestino;

                return (
                  <div key={idx} className="p-4 rounded-xl border bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    
                    {/* Nombre de la columna original */}
                    <div className="flex items-center gap-3 w-full md:w-1/3">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-lg">#{idx + 1}</span>
                      <span className="font-bold text-slate-800 text-sm break-all">{colOriginal}</span>
                    </div>

                    {/* Selector de Tabla de Supabase */}
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Asignar a Tabla en Supabase:</label>
                      <select
                        value={tablaSeleccionada}
                        onChange={(e) => handleCambioAsignacion(colOriginal, "tablaDestino", e.target.value)}
                        className="border rounded-lg p-2 bg-white text-sm font-medium"
                      >
                        <option value="">-- Ignorar / No usar --</option>
                        <option value="empleados">👥 Tabla: Empleados</option>
                        <option value="incidencias">⚡ Tabla: Incidencias</option>
                        <option value="vacaciones">🌴 Tabla: Vacaciones</option>
                        <option value="prestamos">💳 Tabla: Préstamos</option>
                      </select>
                    </div>

                    {/* Selector de Campo Específico dentro de esa Tabla */}
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Campo específico destino:</label>
                      <select
                        value={asignacionActual.campoDestino}
                        onChange={(e) => handleCambioAsignacion(colOriginal, "campoDestino", e.target.value)}
                        className="border rounded-lg p-2 bg-white text-sm"
                        disabled={!tablaSeleccionada}
                      >
                        <option value="">-- Selecciona campo --</option>
                        {tablaSeleccionada && esquemaTablasSupabase[tablaSeleccionada]?.map((campo) => (
                          <option key={campo.key} value={campo.key}>
                            {campo.label} ({campo.key})
                          </option>
                        ))}
                      </select>
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