import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { supabase } from "../services/supabase";

export default function ConfiguracionTablas() {
  const [archivo, setArchivo] = useState(null);
  const [columnasDetectadas, setColumnasDetectadas] = useState([]);
  
  // Mapeo dinámico: Relaciona cada columna del Excel con su Tabla, Campo y si usa Manual
  // Estructura: { "NombreColumna": { tablaDestino: "", campoDestino: "", esManual: false, campoManual: "" } }
  const [asignacionColumnas, setAsignacionColumnas] = useState({});
  
  // Control de módulos activos / inactivos
  const [modulosActivos, setModulosActivos] = useState({
    empleados: true,
    incidencias: true,
    vacaciones: true,
    prestamos: true,
  });

  const [guardando, setGuardando] = useState(false);

  // Estados para el Modal / Pop-up de verificación
  const [mostrarModal, setMostrarModal] = useState(false);
  const [datosGuardadosResumen, setDatosGuardadosResumen] = useState(null);

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

          // Sugerencia automática inteligente
          const nuevaAsignacion = {};
          encabezadosValidos.forEach((col) => {
            const colUpper = col.toUpperCase();
            let encontradaTabla = "";
            let encontradoCampo = "";

            Object.keys(esquemaTablasSupabase).forEach((tabla) => {
              esquemaTablasSupabase[tabla].forEach((campo) => {
                if (!encontradaTabla && (colUpper.includes(campo.key.toUpperCase()) || colUpper.includes(campo.label.toUpperCase()))) {
                  encontradaTabla = tabla;
                  encontradoCampo = campo.key;
                }
              });
            });

            nuevaAsignacion[col] = { 
              tablaDestino: encontradaTabla || "", 
              campoDestino: encontradoCampo || "", 
              esManual: false, 
              campoManual: "" 
            };
          });

          setAsignacionColumnas(nuevaAsignacion);
          alert(`✅ ¡Se detectaron e importaron ${encabezadosValidos.length} columnas con título!`);
        }
      } catch (error) {
        console.error("Error al leer el archivo:", error);
        alert("No se pudieron procesar las columnas del archivo.");
      }
    };

    reader.readAsBinaryString(file);
  };

  // 2. Modificar la asignación de una columna específica de forma dinámica
  const handleCambioAsignacion = (columna, tipo, valor) => {
    setAsignacionColumnas((prev) => {
      const actual = prev[columna] || { tablaDestino: "", campoDestino: "", esManual: false, campoManual: "" };
      
      let nuevoValor = { ...actual, [tipo]: valor };

      // Si cambia de tabla, limpiamos el campo destino anterior por seguridad
      if (tipo === "tablaDestino") {
        nuevoValor.campoDestino = "";
        nuevoValor.esManual = false;
      }

      // Si selecciona la opción manual en el campo destino
      if (tipo === "campoDestino" && valor === "MANUAL") {
        nuevoValor.esManual = true;
        nuevoValor.campoManual = "";
      } else if (tipo === "campoDestino" && valor !== "MANUAL") {
        nuevoValor.esManual = false;
      }

      return {
        ...prev,
        [columna]: nuevoValor,
      };
    });
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

      setDatosGuardadosResumen(payloadConfiguracion);
      setMostrarModal(true);

    } catch (error) {
      console.error("Error al guardar en Supabase:", error.message);
      alert("Hubo un error al actualizar las tablas en Supabase.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto relative">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Administración y Asignación de Columnas</h1>
          <p className="text-gray-500 mt-1">
            Analiza las columnas de tu archivo, asígnalas a su tabla y elige un campo predefinido o escribe uno de forma manual.
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

        {/* PASO 3: Asignar cada columna detectada a una Tabla y Campo (con opción de Llenado Manual) */}
        {columnasDetectadas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Configurar Tabla y Campo Destino en Supabase</h2>
            <p className="text-sm text-gray-500 mb-6">
              Selecciona la tabla destino y elige el campo específico o selecciona <b>"Llenado manual"</b> para escribirlo tú mismo.
            </p>

            <div className="space-y-4">
              {columnasDetectadas.map((colOriginal, idx) => {
                const asignacionActual = asignacionColumnas[colOriginal] || { tablaDestino: "", campoDestino: "", esManual: false, campoManual: "" };
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

                    {/* Selector de Campo Específico con opción de Llenado Manual */}
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Campo específico destino:</label>
                      
                      {!asignacionActual.esManual ? (
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
                          {tablaSeleccionada && (
                            <option value="MANUAL" className="font-bold text-blue-600">
                              ✏️ Llenado manual (Escribir campo...)
                            </option>
                          )}
                        </select>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input 
                            type="text"
                            value={asignacionActual.campoManual}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAsignacionColumnas((prev) => ({
                                ...prev,
                                [colOriginal]: { ...prev[colOriginal], campoManual: val }
                              }));
                            }}
                            placeholder="Escribe el nombre del campo..."
                            className="border rounded-lg p-2 bg-white text-sm w-full font-mono text-slate-700"
                          />
                          <button
                            type="button"
                            onClick={() => handleCambioAsignacion(colOriginal, "campoDestino", "")}
                            className="text-xs text-red-600 hover:underline px-1 whitespace-nowrap"
                            title="Regresar a lista"
                          >
                            Volver
                          </button>
                        </div>
                      )}
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

        {/* 🌟 POP-UP / MODAL DE VERIFICACIÓN DE ACTUALIZACIÓN EN SUPABASE */}
        {mostrarModal && datosGuardadosResumen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
              
              <div className="flex justify-between items-center pb-4 border-b mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">🎉 ¡Actualización Exitosa en Supabase!</h2>
                  <p className="text-xs text-emerald-600 font-semibold mt-1">
                    Última sincronización: {new Date(datosGuardadosResumen.actualizado_at).toLocaleString()}
                  </p>
                </div>
                <button 
                  onClick={() => setMostrarModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm transition-all"
                >
                  ✕ Cerrar
                </button>
              </div>

              <div className="space-y-6">
                {/* Resumen de Módulos Activos */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2">📌 Estado de Módulos Activos:</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(datosGuardadosResumen.modulos).map((mod) => (
                      <span key={mod} className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${datosGuardadosResumen.modulos[mod] ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                        {mod.toUpperCase()}: {datosGuardadosResumen.modulos[mod] ? "ACTIVO" : "INACTIVO"}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Resumen Detallado de Asignaciones por Tabla */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3">📊 Detalle de Columnas y Campos Destino Registrados:</h3>
                  
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                        <tr>
                          <th className="p-3 border-b">Columna Archivo</th>
                          <th className="p-3 border-b">Tabla Supabase</th>
                          <th className="p-3 border-b">Campo Destino Final</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(datosGuardadosResumen.asignacion).map(([col, info], i) => {
                          const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-800">{col}</td>
                              <td className="p-3">
                                {info.tablaDestino ? (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">
                                    {info.tablaDestino}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 italic">Ignorada</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-600">
                                {campoFinal || <span className="text-gray-400 italic">-</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t flex justify-end">
                <button
                  onClick={() => setMostrarModal(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-md transition-all"
                >
                  Entendido, Verificado
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}