import React, { useState, useEffect } from "react";

export default function PanelNomina() {
  // --- ESTADOS PRINCIPALES ---
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  // --- ESTADOS PARA COLUMNAS DINÁMICAS ---
  const [columnasDisponibles, setColumnasDisponibles] = useState([]);
  const [columnasVisibles, setColumnasVisibles] = useState({});
  const [mostrarModalColumnas, setMostrarModalColumnas] = useState(false);

  // 1. CARGA DE DATOS
  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);
      try {
        // ----------------------------------------------------------------------
        // ⚠️ REEMPLAZA ESTO CON TU LLAMADA REAL A SUPABASE
        // Asegúrate de traer los joins de los módulos de empleados, prestamos, 
        // vacaciones e incidencias.
        // ----------------------------------------------------------------------
        
        // Datos simulados (borra esto cuando conectes Supabase):
        const dataSimulada = [
          {
            id: 1,
            nombre_completo: "Juan Pérez",
            sueldo_base: 2500.00,
            sueldo_complemento: 500.00,
            bono_puntualidad: 200,
            dias_vacaciones_tomados: 2, 
            saldo_prestamos: 1500,      
            abono_prestamos: 300,       
            faltas_injustificadas: 1,   
            descuento_faltas: 350.50
          },
          {
            id: 2,
            nombre_completo: "María Gómez",
            sueldo_base: 3200.00,
            sueldo_complemento: 0,
            bono_puntualidad: 200,
            dias_vacaciones_tomados: 0,
            saldo_prestamos: 0,
            abono_prestamos: 0,
            faltas_injustificadas: 0,
            descuento_faltas: 0
          }
        ];
        
        setEmpleados(dataSimulada);
      } catch (error) {
        console.error("Error al cargar la nómina:", error);
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, []);

  // 2. EXTRACCIÓN DINÁMICA DE COLUMNAS
  useEffect(() => {
    if (empleados && empleados.length > 0) {
      // Extraemos todas las llaves del primer registro
      const todasLasColumnas = Object.keys(empleados[0]);
      
      // Filtramos columnas internas que el usuario no necesita ver ni controlar
      const columnasOcultasPorDefecto = ["id", "empleado_id", "created_at", "updated_at", "nombre_completo"];
      const columnasFiltradas = todasLasColumnas.filter(col => !columnasOcultasPorDefecto.includes(col));

      setColumnasDisponibles(columnasFiltradas);

      // Inicializamos la visibilidad
      setColumnasVisibles(prev => {
        const nuevoEstado = { ...prev };
        columnasFiltradas.forEach(col => {
          if (nuevoEstado[col] === undefined) {
            nuevoEstado[col] = true; // Por defecto mostramos todas las columnas
          }
        });
        return nuevoEstado;
      });
    }
  }, [empleados]);

  // 3. FUNCIONES AUXILIARES
  const cambiarVisibilidadColumna = (columna) => {
    setColumnasVisibles(prev => ({
      ...prev,
      [columna]: !prev[columna]
    }));
  };

  const formatearNombreColumna = (texto) => {
    return texto.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const esColumnaMonetaria = (nombreColumna) => {
    // Si la columna tiene una de estas palabras, le daremos formato de $ dinero
    const terminosMoneda = ['sueldo', 'bono', 'saldo', 'abono', 'descuento', 'aguinaldo', 'ptu', 'total', 'gratificacion', 'apoyo'];
    return terminosMoneda.some(termino => nombreColumna.toLowerCase().includes(termino));
  };

  // --- RENDERIZADO ---
  if (cargando) {
    return <div className="p-8 text-center text-slate-500">Cargando nómina...</div>;
  }

  return (
    <div className="p-6 max-w-full overflow-x-hidden bg-slate-50 min-h-screen">
      
      {/* HEADER Y BOTÓN DE CONFIGURACIÓN */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Panel de Nómina</h1>
        
        <div className="relative">
          <button 
            onClick={() => setMostrarModalColumnas(!mostrarModalColumnas)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            Configurar Columnas
          </button>

          {/* MODAL DROPDOWN DE COLUMNAS */}
          {mostrarModalColumnas && (
            <div className="absolute right-0 mt-2 w-max max-w-2xl bg-white border border-slate-200 shadow-xl rounded-xl z-50 p-4">
              <div className="mb-3 pb-2 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Columnas Visibles</h3>
                <button onClick={() => setMostrarModalColumnas(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2 text-sm">
                {columnasDisponibles.map((colKey) => (
                  <label key={colKey} className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer border border-slate-200 transition">
                    <input
                      type="checkbox"
                      checked={columnasVisibles[colKey] || false}
                      onChange={() => cambiarVisibilidadColumna(colKey)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="font-medium text-slate-700 select-none">
                      {formatearNombreColumna(colKey)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TABLA DINÁMICA */}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-600 uppercase bg-slate-100 border-b border-slate-200">
            <tr>
              {/* Columna Fija: Nombre del Empleado */}
              <th className="px-4 py-3 font-bold bg-slate-200 sticky left-0 z-10 shadow-[1px_0_0_0_#cbd5e1]">
                Empleado
              </th>
              
              {/* Columnas Dinámicas Mapeadas */}
              {columnasDisponibles.map((colKey) => (
                columnasVisibles[colKey] && (
                  <th key={colKey} className="px-4 py-3 font-semibold text-center border-l border-slate-200">
                    {formatearNombreColumna(colKey)}
                  </th>
                )
              ))}
            </tr>
          </thead>
          
          <tbody>
            {empleados.length === 0 ? (
              <tr>
                <td colSpan="100%" className="px-4 py-8 text-center text-slate-500">
                  No hay datos para mostrar.
                </td>
              </tr>
            ) : (
              empleados.map((empleado) => (
                <tr key={empleado.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  
                  {/* Celda Fija: Nombre */}
                  <td className="px-4 py-3 font-medium text-slate-800 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                    {empleado.nombre_completo}
                  </td>

                  {/* Celdas Dinámicas */}
                  {columnasDisponibles.map((colKey) => {
                    if (!columnasVisibles[colKey]) return null;

                    const valor = empleado[colKey];
                    const esMoneda = esColumnaMonetaria(colKey);
                    const esNumero = typeof valor === 'number';

                    return (
                      <td key={`${empleado.id}-${colKey}`} className="px-4 py-3 text-center border-l border-slate-100 text-slate-600">
                        {esNumero && esMoneda 
                          ? <span className={valor < 0 ? "text-red-600" : ""}>${Number(valor).toFixed(2)}</span>
                          : esNumero ? valor 
                          : valor || <span className="text-slate-300">-</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}