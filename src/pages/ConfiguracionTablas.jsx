import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { supabase } from "../services/supabase";

export default function ConfiguracionTablas() {
  const [archivo, setArchivo] = useState(null);
  const [columnasDetectadas, setColumnasDetectadas] = useState([]);
  
  // Estado para la configuración de cada tabla/módulo de Supabase
  const [configuracionTablas, setConfiguracionTablas] = useState({
    empleados: {
      activa: true,
      mapeo: {
        numero_empleado: "",
        nombre_completo: "",
        puesto: "",
        departamento: "",
        fecha_ingreso: "",
        sueldo_base: "",
        bono_puesto: "",
      },
    },
    incidencias: {
      activa: true,
      mapeo: {
        horas_extra: "",
        bono_puntualidad: "",
        bono_asistencia: "",
        monto_final_semanal: "",
      },
    },
    vacaciones: {
      activa: true,
      mapeo: {
        dias_vacaciones: "",
      },
    },
    prestamos: {
      activa: true,
      mapeo: {
        descuento_varios: "",
        saldo_prestamo: "",
      },
    },
  });

  const [guardando, setGuardando] = useState(false);

  // Campos oficiales existentes en cada tabla de Supabase
  const esquemaTablasSupabase = {
    empleados: [
      { key: "numero_empleado", label: "Número de Empleado (#)" },
      { key: "nombre_completo", label: "Nombre del Colaborador" },
      { key: "puesto", label: "Puesto" },
      { key: "departamento", label: "Departamento / Línea" },
      { key: "fecha_ingreso", label: "Fecha de Ingreso (Alta)" },
      { key: "sueldo_base", label: "Sueldo Base" },
      { key: "bono_puesto", label: "Bono por Puesto" },
    ],
    incidencias: [
      { key: "horas_extra", label: "Horas Extra" },
      { key: "bono_puntualidad", label: "Bono de Puntualidad" },
      { key: "bono_asistencia", label: "Bono de Asistencia" },
      { key: "monto_final_semanal", label: "Monto Final Semanal (Total)" },
    ],
    vacaciones: [
      { key: "dias_vacaciones", label: "Días de Vacaciones" },
    ],
    prestamos: [
      { key: "descuento_varios", label: "Descuento / Préstamo Semanal" },
      { key: "saldo_prestamo", label: "Adeudo / Saldo Pendiente" },
    ],
  };

  // Cargar configuración existente desde Supabase al iniciar la página
  useEffect(() => {
    cargarConfiguracionGuardada();
  }, []);

  const cargarConfiguracionGuardada = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_tablas")
        .select("configuracion")
        .eq("clave", "config_mapeo_tablas_supabase")
        .maybeSingle();

      if (data && data.configuracion && data.configuracion.mapeo) {
        setConfiguracionTablas(data.configuracion.mapeo);
      }
    } catch (err) {
      console.error("Error al cargar configuración de Supabase:", err);
    }
  };

  // Leer archivo Excel/CSV para extraer los encabezados de la fila 0
  const leerEncabezadosArchivo = (event) => {
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
          const encabezados = rows[0]
            .map((h) => String(h || "").trim())
            .filter((h) => h !== "");
          
          setColumnasDetectadas(encabezados);

          // Auto-mapeo inteligente sugerido por similitud de nombres
          const nuevaConfig = JSON.parse(JSON.stringify(configuracionTablas));
          Object.keys(nuevaConfig).forEach((tabla) => {
            Object.keys(nuevaConfig[tabla].mapeo).forEach((campoSupabase) => {
              const encontrada = encabezados.find((col) => 
                col.toUpperCase().includes(campoSupabase.toUpperCase()) ||
                col.toUpperCase().replace(/[_]/g, " ").includes(campoSupabase.toUpperCase().replace(/[_]/g, " "))
              );
              if (encontrada) {
                nuevaConfig[tabla].mapeo[campoSupabase] = encontrada;
              }
            });
          });
          setConfiguracionTablas(nuevaConfig);
        }
      } catch (error) {
        console.error("Error al leer estructura del archivo:", error);
        alert("No se pudo leer el archivo correctamente.");
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleCambioMapeo = (tabla, campoSupabase, columnaExcel) => {
    setConfiguracionTablas((prev) => ({
      ...prev,
      [tabla]: {
        ...prev[tabla],
        mapeo: {
          ...prev[tabla].mapeo,
          [campoSupabase]: columnaExcel,
        },
      },
    }));
  };

  const toggleTablaActiva = (tabla) => {
    setConfiguracionTablas((prev) => ({
      ...prev,
      [tabla]: {
        ...prev[tabla],
        activa: !prev[tabla].activa,
      },
    }));
  };

  // Guardar configuración en la tabla configuracion_tablas de Supabase
  const guardarConfiguracion = async () => {
    try {
      setGuardando(true);
      
      const configuracionFinal = {
        mapeo: configuracionTablas,
        fecha_actualizacion: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("configuracion_tablas")
        .upsert({ 
          clave: "config_mapeo_tablas_supabase", 
          configuracion: configuracionFinal 
        }, { 
          onConflict: "clave" 
        });

      if (error) throw error;

      // Respaldo local de seguridad
      localStorage.setItem("config_mapeo_tablas_supabase", JSON.stringify(configuracionTablas));

      alert("🎉 ¡Configuración guardada en Supabase y lista para usarse!");
    } catch (error) {
      console.error("Error al guardar en Supabase:", error.message);
      alert("Hubo un error al guardar la configuración en la base de datos.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">⚙️ Configuración y Mapeo por Tablas</h1>
          <p className="text-gray-500 mt-1">
            Administra qué columnas de tu archivo Excel alimentan a cada tabla de tu base de datos en Supabase.
          </p>
        </div>

        {/* PASO 1: Carga de archivo de referencia */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 mb-3">1. Cargar Archivo Patrón (Excel o CSV)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Sube tu archivo de nómina para extraer la lista completa de nombres de columnas originales (ej. "Telempromt", "Prestamos", etc.).
          </p>
          <input 
            type="file" 
            accept=".csv,.xlsx,.xls" 
            onChange={leerEncabezadosArchivo} 
            className="border rounded-xl p-3 w-full bg-slate-50 text-sm" 
          />
          {archivo && (
            <p className="text-xs text-emerald-600 font-semibold mt-2">
              ✅ Archivo detectado: {archivo.name} ({columnasDetectadas.length} columnas encontradas)
            </p>
          )}
        </div>

        {/* PASO 2: Secciones divididas por Tablas de Supabase */}
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-bold text-slate-800">2. Mapeo de Columnas por cada Tabla de Base de Datos</h2>
          
          {Object.keys(esquemaTablasSupabase).map((nombreTabla) => {
            const tablaInfo = configuracionTablas[nombreTabla];
            return (
              <div key={nombreTabla} className={`bg-white rounded-2xl shadow-md p-6 border transition-all ${tablaInfo?.activa ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50"}`}>
                
                <div className="flex justify-between items-center mb-4 pb-3 border-b">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {nombreTabla === "empleados" && "👥"}
                      {nombreTabla === "incidencias" && "⚡"}
                      {nombreTabla === "vacaciones" && "🌴"}
                      {nombreTabla === "prestamos" && "💳"}
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 capitalize">Tabla: <span className="text-blue-600">{nombreTabla}</span></h3>
                      <p className="text-xs text-gray-500">Define qué columna del Excel se sincroniza con cada campo de esta tabla.</p>
                    </div>
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-semibold text-slate-700">{tablaInfo?.activa ? "Tabla Activa" : "Tabla Inactiva"}</span>
                    <input 
                      type="checkbox" 
                      checked={tablaInfo?.activa ?? true} 
                      onChange={() => toggleTablaActiva(nombreTabla)}
                      className="w-4 h-4 text-blue-600 rounded" 
                    />
                  </label>
                </div>

                {tablaInfo?.activa && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {esquemaTablasSupabase[nombreTabla].map((campo) => (
                      <div key={campo.key} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">{campo.label}</span>
                          <span className="font-mono text-gray-400">campo: {campo.key}</span>
                        </div>
                        <select
                          value={tablaInfo?.mapeo?.[campo.key] || ""}
                          onChange={(e) => handleCambioMapeo(nombreTabla, campo.key, e.target.value)}
                          className="border rounded-lg p-2 bg-white text-sm"
                          disabled={columnasDetectadas.length === 0}
                        >
                          <option value="">-- Selecciona la columna del Excel --</option>
                          {columnasDetectadas.map((colOriginal, idx) => (
                            <option key={idx} value={colOriginal}>
                              {colOriginal}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end bg-white p-6 rounded-2xl shadow-md border border-slate-100">
          <button 
            onClick={guardarConfiguracion}
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg transition-all"
          >
            {guardando ? "Guardando en Supabase..." : "💾 Guardar Configuración en Supabase"}
          </button>
        </div>

      </div>
    </Layout>
  );
}