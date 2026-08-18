import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { supabase } from "../services/supabase";

// 🔥 FUNCIÓN ROBUSTA: Convierte cualquier texto a snake_case estricto
const toSnakeCase = (str) => {
  return String(str || "")
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quita acentos (ü -> u, ó -> o)
    .replace(/\s+/g, '_')                             // Espacios a guiones bajos
    .replace(/([A-Z])/g, '_$1')                       // Separa mayúsculas (Neto -> _neto)
    .toLowerCase()                                    // Todo a minúsculas
    .replace(/^_/, '')                                // Quita guión inicial
    .replace(/[^a-z0-9_]/g, '');                      // Quita cualquier carácter raro
};

export default function ConfiguracionTablas() {
  const [archivo, setArchivo] = useState(null);
  const [columnasDetectadas, setColumnasDetectadas] = useState([]);
  const [asignacionColumnas, setAsignacionColumnas] = useState({});
  
  const [modulosActivos, setModulosActivos] = useState({
    empleados: true, incidencias: true, vacaciones: true, prestamos: true, puestos: true,
  });

  const [guardando, setGuardando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [datosGuardadosResumen, setDatosGuardadosResumen] = useState(null);

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
    vacaciones: [{ key: "dias_vacaciones", label: "Días de Vacaciones" }],
    prestamos: [
      { key: "descuento_varios", label: "Descuento / Préstamo Semanal" },
      { key: "saldo_prestamo", label: "Saldo / Adeudo Pendiente" },
    ],
    puestos: [
      { key: "nombre_puesto", label: "Nombre del Puesto" },
      { key: "nivel_jerarquico", label: "Nivel Jerárquico" },
      { key: "descripcion", label: "Descripción de Puesto" },
      { key: "salario_minimo", label: "Salario Mínimo" },
      { key: "salario_maximo", label: "Salario Máximo" },
    ],
  };

  useEffect(() => { cargarConfiguracionDeSupabase(); }, []);

  const cargarConfiguracionDeSupabase = async () => {
    try {
      const { data } = await supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle();
      if (data && data.configuracion) {
        if (data.configuracion.asignacion) setAsignacionColumnas(data.configuracion.asignacion);
        if (data.configuracion.modulos) setModulosActivos((prev) => ({ ...prev, ...data.configuracion.modulos }));
        if (data.configuracion.columnas) setColumnasDetectadas(data.configuracion.columnas);
      }
    } catch (err) { console.error("Error al cargar la configuración:", err); }
  };

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
          const encabezadosValidos = rows[0].map((h) => String(h || "").trim()).filter((h) => h !== "");
          setColumnasDetectadas(encabezadosValidos);
          const nuevaAsignacion = {};
          encabezadosValidos.forEach((col) => {
            const colUpper = col.toUpperCase();
            let encontradaTabla = "", encontradoCampo = "";
            Object.keys(esquemaTablasSupabase).forEach((tabla) => {
              esquemaTablasSupabase[tabla].forEach((campo) => {
                if (!encontradaTabla && (colUpper.includes(campo.key.toUpperCase()) || colUpper.includes(campo.label.toUpperCase()))) {
                  encontradaTabla = tabla;
                  encontradoCampo = campo.key;
                }
              });
            });
            nuevaAsignacion[col] = { tablaDestino: encontradaTabla || "", campoDestino: encontradoCampo || "", esManual: false, campoManual: "" };
          });
          setAsignacionColumnas(nuevaAsignacion);
          alert(`✅ ¡Se detectaron e importaron ${encabezadosValidos.length} columnas!`);
        }
      } catch (error) {
        console.error("Error al leer el archivo:", error);
        alert("No se pudieron procesar las columnas del archivo.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCambioAsignacion = (columna, tipo, valor) => {
    setAsignacionColumnas((prev) => {
      const actual = prev[columna] || { tablaDestino: "", campoDestino: "", esManual: false, campoManual: "" };
      let nuevoValor = { ...actual, [tipo]: valor };
      if (tipo === "tablaDestino") { nuevoValor.campoDestino = ""; nuevoValor.esManual = false; }
      if (tipo === "campoDestino" && valor === "MANUAL") { nuevoValor.esManual = true; nuevoValor.campoManual = ""; } 
      else if (tipo === "campoDestino" && valor !== "MANUAL") { nuevoValor.esManual = false; }
      return { ...prev, [columna]: nuevoValor };
    });
  };

  const toggleModulo = (modulo) => setModulosActivos((prev) => ({ ...prev, [modulo]: !prev[modulo] }));

  // 🔥 CORRECCIÓN CLAVE: Normalizar el payload ANTES de guardarlo
  const guardarYActualizarSupabase = async () => {
    try {
      setGuardando(true);
      const promesasCreacion = [];
      
      // Creamos una copia normalizada de la asignación para guardar
      const asignacionNormalizada = {};

      Object.entries(asignacionColumnas).forEach(([colOriginal, info]) => {
        if (info.tablaDestino && info.tablaDestino.trim() !== "") {
          const campoRaw = info.esManual ? info.campoManual : info.campoDestino;
          
          if (campoRaw && campoRaw.trim() !== "") {
            // 1. Normalizar el nombre del campo
            const campoFinal = toSnakeCase(campoRaw);
            
            // 2. Guardar la versión normalizada en nuestro objeto temporal
            asignacionNormalizada[colOriginal] = {
              ...info,
              campoDestino: info.esManual ? info.campoDestino : campoFinal,
              campoManual: info.esManual ? campoFinal : info.campoManual
            };

            // 3. Determinar tipo de dato
            let tipoDato = "TEXT";
            const nombre = campoFinal.toLowerCase();
            if (nombre.includes("sueldo") || nombre.includes("bono") || nombre.includes("total") || nombre.includes("saldo") || nombre.includes("descuento") || nombre.includes("valor") || nombre.includes("porcentaje") || nombre.includes("dias") || nombre.includes("horas") || nombre.includes("monto") || nombre.includes("neto") || nombre.includes("prestamo") || nombre.includes("adeudo") || nombre.includes("abono") || nombre.includes("cantidad") || nombre.includes("antiguedad")) {
              tipoDato = "NUMERIC";
            } else if (nombre.includes("fecha") || nombre.includes("alta") || nombre.includes("baja") || nombre.includes("ingreso")) {
              tipoDato = "DATE";
            } else if (nombre.includes("activo") || nombre.includes("estatus")) {
              tipoDato = "BOOLEAN";
            }

            // 4. Solicitar a Supabase que cree la columna si no existe
            promesasCreacion.push(
              supabase.rpc("agregar_columna_dinamica", {
                p_tabla: info.tablaDestino,
                p_columna: campoFinal,
                p_tipo: tipoDato,
              })
            );
          } else {
            // Si no hay campo, se marca como ignorado
            asignacionNormalizada[colOriginal] = { ...info, tablaDestino: "", campoDestino: "", campoManual: "" };
          }
        } else {
          asignacionNormalizada[colOriginal] = { ...info, tablaDestino: "", campoDestino: "", campoManual: "" };
        }
      });

      // Esperar a que se creen las columnas
      if (promesasCreacion.length > 0) {
        console.log(`🔨 Creando/Verificando ${promesasCreacion.length} columnas...`);
        const resultados = await Promise.all(promesasCreacion);
        const errores = resultados.filter(r => r.error);
        if (errores.length > 0) {
          console.warn("⚠️ Errores al crear columnas (¿Ejecutaste el script SQL?):", errores);
        }
      }

      // 5. Guardar la configuración YA NORMALIZADA en Supabase
      const payloadConfiguracion = {
        asignacion: asignacionNormalizada, // <-- Aquí está la magia
        modulos: modulosActivos,
        columnas: columnasDetectadas,
        actualizado_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("configuracion_tablas")
        .upsert({ clave: "config_mapeo_columnas_dinamico", configuracion: payloadConfiguracion }, { onConflict: "clave" });

      if (error) throw error;

      // Actualizar estado local y localStorage con la versión normalizada
      setAsignacionColumnas(asignacionNormalizada);
      localStorage.setItem("config_mapeo_columnas_dinamico", JSON.stringify(payloadConfiguracion));
      
      setDatosGuardadosResumen(payloadConfiguracion);
      setMostrarModal(true);

    } catch (error) {
      console.error("Error al guardar:", error.message);
      alert("Error: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto relative">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Administración y Asignación de Columnas</h1>
          <p className="text-gray-500 mt-1">Analiza las columnas de tu archivo, asígnalas a su tabla y elige un campo predefinido o escribe uno de forma manual.</p>
          <p className="text-xs text-emerald-600 font-semibold mt-2">💡 Al guardar, el sistema convertirá automáticamente los nombres a formato base de datos (ej: "Sueldo Neto" → "sueldo_neto").</p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">1. Cargar archivo Excel</h2>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={analizarColumnasArchivo} className="border rounded-xl p-3 w-full bg-slate-50 text-sm cursor-pointer" />
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">2. Módulos Activos</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-3">
            {Object.keys(modulosActivos).map((mod) => (
              <label key={mod} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${modulosActivos[mod] ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}>
                <span className="capitalize font-semibold text-slate-700">{mod}</span>
                <input type="checkbox" checked={modulosActivos[mod]} onChange={() => toggleModulo(mod)} className="w-4 h-4 text-blue-600 rounded" />
              </label>
            ))}
          </div>
        </div>

        {columnasDetectadas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Configurar Tabla y Campo Destino</h2>
            <div className="space-y-4">
              {columnasDetectadas.map((colOriginal, idx) => {
                const asignacionActual = asignacionColumnas[colOriginal] || { tablaDestino: "", campoDestino: "", esManual: false, campoManual: "" };
                const tablaSeleccionada = asignacionActual.tablaDestino;
                return (
                  <div key={idx} className="p-4 rounded-xl border bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full md:w-1/3">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-lg">#{idx + 1}</span>
                      <span className="font-bold text-slate-800 text-sm break-all">{colOriginal}</span>
                    </div>
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Tabla Destino:</label>
                      <select value={tablaSeleccionada} onChange={(e) => handleCambioAsignacion(colOriginal, "tablaDestino", e.target.value)} className="border rounded-lg p-2 bg-white text-sm font-medium capitalize">
                        <option value="">-- Ignorar --</option>
                        {Object.keys(esquemaTablasSupabase).map((tablaKey) => (
                          <option key={tablaKey} value={tablaKey}>
                            {tablaKey === "empleados" && "👥 "}{tablaKey === "incidencias" && "⚡ "}{tablaKey === "vacaciones" && "🌴 "}{tablaKey === "prestamos" && "💳 "}{tablaKey === "puestos" && "💼 "}
                            {tablaKey.charAt(0).toUpperCase() + tablaKey.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full md:w-1/3 flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">Campo destino:</label>
                      {!asignacionActual.esManual ? (
                        <select value={asignacionActual.campoDestino} onChange={(e) => handleCambioAsignacion(colOriginal, "campoDestino", e.target.value)} className="border rounded-lg p-2 bg-white text-sm" disabled={!tablaSeleccionada}>
                          <option value="">-- Selecciona campo --</option>
                          {tablaSeleccionada && esquemaTablasSupabase[tablaSeleccionada]?.map((campo) => (<option key={campo.key} value={campo.key}>{campo.label} ({campo.key})</option>))}
                          {tablaSeleccionada && (<option value="MANUAL" className="font-bold text-blue-600">✏️ Llenado manual...</option>)}
                        </select>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input type="text" value={asignacionActual.campoManual} onChange={(e) => setAsignacionColumnas((prev) => ({ ...prev, [colOriginal]: { ...prev[colOriginal], campoManual: e.target.value } }))} placeholder="Ej: sueldo_neto" className="border rounded-lg p-2 bg-white text-sm w-full font-mono text-slate-700" />
                          <button type="button" onClick={() => handleCambioAsignacion(colOriginal, "campoDestino", "")} className="text-xs text-red-600 hover:underline px-1">Volver</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={guardarYActualizarSupabase} disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg transition-all flex items-center gap-2">
                {guardando ? "⏳ Procesando..." : "💾 Guardar y Normalizar Columnas"}
              </button>
            </div>
          </div>
        )}

        {mostrarModal && datosGuardadosResumen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-100">
              <div className="flex justify-between items-center pb-4 border-b mb-4">
                <h2 className="text-2xl font-bold text-slate-800">🎉 ¡Actualización Exitosa!</h2>
                <button onClick={() => setMostrarModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm">✕ Cerrar</button>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                    <tr><th className="p-3 border-b">Excel</th><th className="p-3 border-b">Tabla</th><th className="p-3 border-b">Campo Final (snake_case)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(datosGuardadosResumen.asignacion).map(([col, info], i) => {
                      const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-3 font-medium">{col}</td>
                          <td className="p-3">{info.tablaDestino ? <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">{info.tablaDestino}</span> : "Ignorada"}</td>
                          <td className="p-3 font-mono text-emerald-700 font-bold">{campoFinal || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 pt-4 border-t flex justify-end">
                <button onClick={() => setMostrarModal(false)} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium">Entendido</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}