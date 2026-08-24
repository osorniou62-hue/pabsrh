import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";

// 🔥 PARSER DE FECHAS ROBUSTO - Maneja todos los formatos
const parsearFechaRobusta = (valor) => {
  if (!valor) return null;
  
  // Si es número de Excel (serial date)
  if (typeof valor === 'number') {
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    if (!isNaN(fecha.getTime())) {
      return fecha.toISOString().split('T')[0];
    }
  }
  
  const str = String(valor).trim();
  
  // Ignorar valores inválidos
  if (str === '-' || str === '' || str.toLowerCase().includes('pagad') || str.includes('#¡REF!')) {
    return null;
  }
  
  // Formato: dd/mm/yyyy o dd/mm/yy
  const matchSlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (matchSlash) {
    let [, dia, mes, anio] = matchSlash;
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  // Formato: dd-mmm-yy o dd/mmm/yy (ej: 13-may-26, 13/may/26)
  const meses = { 
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
  };
  const matchMes = str.match(/^(\d{1,2})[\/\-]([a-z]{3})[\/\-](\d{2,4})$/i);
  if (matchMes) {
    let [, dia, mes, anio] = matchMes;
    const mesNum = meses[mes.toLowerCase()];
    if (anio.length === 2) anio = '20' + anio;
    if (mesNum) return `${anio}-${mesNum}-${dia.padStart(2, '0')}`;
  }
  
  // Formato: dd-mm-yyyy (ej: 13-05-2026)
  const matchGuion = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (matchGuion) {
    let [, dia, mes, anio] = matchGuion;
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  // Formato: yyyy-mm-dd (ISO)
  const matchISO = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchISO) {
    const [, anio, mes, dia] = matchISO;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  return null;
};

// 🔥 LIMPIADOR DE VALORES MONETARIOS
const limpiarMoneda = (valor) => {
  if (!valor) return 0;
  if (typeof valor === 'number') return valor;
  
  const str = String(valor)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/\-/g, '0');
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

// 🔥 NORMALIZADOR DE NOMBRES
const normalizarNombre = (texto) => {
  if (!texto) return "";
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[.,;:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export default function ImportarVacaciones() {
  const [empleados, setEmpleados] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [datosProcesados, setDatosProcesados] = useState(null);
  const [duplicados, setDuplicados] = useState([]);
  const [resolucionesDuplicados, setResolucionesDuplicados] = useState({});
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [vista, setVista] = useState('upload'); // 'upload', 'preview', 'duplicados', 'resultado'

  useEffect(() => {
    cargarEmpleados();
  }, []);

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .eq("activo", true);
      
      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error cargando empleados:", err);
    }
  };

  const procesarArchivo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setArchivo(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        // 🔥 Filtrar filas vacías
        const filasValidas = rows.filter(row => {
          const nombre = row['NOMBRE DEL TRABAJADOR'] || row['NOMBRE'] || '';
          const numero = row['N°'] || row['N'] || row['NUMERO'] || '';
          return nombre || numero;
        });

        // 🔥 Procesar cada fila
        const empleadosProcesados = [];
        const duplicadosEncontrados = [];
        
        filasValidas.forEach((fila, index) => {
          const numero = String(row['N°'] || fila['N'] || fila['NUMERO'] || '').trim();
          const nombre = String(fila['NOMBRE DEL TRABAJADOR'] || fila['NOMBRE'] || '').trim();
          const puesto = String(fila['PUESTO'] || '').trim();
          const area = String(fila['ÁREA'] || fila['AREA'] || '').trim();
          const empresa = String(fila['EMPRESA'] || '').trim();
          const salarioFiscal = limpiarMoneda(fila[' SALARIO FISCAL '] || fila['SALARIO FISCAL']);
          const salarioNoFiscal = limpiarMoneda(fila[' SALARIO NO FISCAL '] || fila['SALARIO NO FISCAL']);
          const bonoPuesto = limpiarMoneda(fila[' BONO POR PUESTO '] || fila['BONO POR PUESTO']);
          const bonoPunt = limpiarMoneda(fila[' BONO PUNT '] || fila['BONO PUNT']);
          const bonoAsis = limpiarMoneda(fila[' BONO ASIS '] || fila['BONO ASIS']);
          const bonoDesempeno = limpiarMoneda(fila[' BONO DESEMPEÑO '] || fila['BONO DESEMPEÑO']);
          const montoSemanal = limpiarMoneda(fila[' MONTO SEMANAL '] || fila['MONTO SEMANAL']);
          const genero = String(fila['GENERO'] || fila['GÉNERO'] || '').trim();
          const fechaAlta = parsearFechaRobusta(fila['FECHA DE ALTA']);
          
          if (!nombre && !numero) return;
          
          // 🔥 Buscar bloques de vacaciones (puede haber múltiples)
          const bloquesVacaciones = [];
          const keys = Object.keys(fila);
          
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (/^DÍAS$/i.test(key) || /^DIAS$/i.test(key)) {
              if (i + 3 < keys.length) {
                const keyInicio = keys[i + 1];
                const keyTermino = keys[i + 2];
                const keyRegreso = keys[i + 3];
                
                if (/INICIO/i.test(keyInicio) && /TERMINO|FIN/i.test(keyTermino) && /REGRESO/i.test(keyRegreso)) {
                  const dias = Number(fila[key]) || 0;
                  const fechaInicio = parsearFechaRobusta(fila[keyInicio]);
                  const fechaFin = parsearFechaRobusta(fila[keyTermino]);
                  const fechaRegreso = parsearFechaRobusta(fila[keyRegreso]);
                  
                  if (dias > 0 && fechaInicio) {
                    bloquesVacaciones.push({
                      dias_solicitados: dias,
                      fecha_inicio: fechaInicio,
                      fecha_fin: fechaFin || fechaInicio,
                      fecha_regreso: fechaRegreso,
                      tipo: String(fila[keyRegreso]).toUpperCase().includes('PAGAD') ? 'PAGADAS_NO_TOMADAS' : 'TOMADAS_Y_PAGADAS'
                    });
                  }
                }
              }
            }
          }
          
          const empleadoData = {
            numero_empleado: numero,
            nombre_completo: nombre,
            puesto: puesto,
            departamento: area,
            empresa: empresa,
            salario_fiscal: salarioFiscal,
            salario_no_fiscal: salarioNoFiscal,
            bono_puesto: bonoPuesto,
            bono_puntualidad: bonoPunt,
            bono_asistencia: bonoAsis,
            bono_desempeno: bonoDesempeno,
            monto_semanal: montoSemanal,
            genero: genero,
            fecha_ingreso: fechaAlta,
            vacaciones: bloquesVacaciones
          };
          
          empleadosProcesados.push(empleadoData);
        });
        
        // 🔥 Detectar duplicados
        const mapaEmpleados = new Map();
        const duplicados = [];
        
        empleadosProcesados.forEach((emp, idx) => {
          const key = normalizarNombre(emp.nombre_completo) || emp.numero_empleado;
          
          if (mapaEmpleados.has(key)) {
            duplicados.push({
              key,
              indices: [mapaEmpleados.get(key), idx],
              empleados: [empleadosProcesados[mapaEmpleados.get(key)], emp]
            });
          } else {
            mapaEmpleados.set(key, idx);
          }
        });
        
        setDatosProcesados(empleadosProcesados);
        setDuplicados(duplicados);
        setVista(duplicados.length > 0 ? 'duplicados' : 'preview');
      } catch (error) {
        console.error("Error procesando archivo:", error);
        alert("Error al procesar el archivo: " + error.message);
      }
    };
    
    reader.readAsBinaryString(file);
  };

  const resolverDuplicado = (key, accion, indiceConservar) => {
    setResolucionesDuplicados(prev => ({
      ...prev,
      [key]: { accion, indiceConservar }
    }));
  };

  const aplicarResoluciones = () => {
    const empleadosFinales = [...datosProcesados];
    
    duplicados.forEach(dup => {
      const resolucion = resolucionesDuplicados[dup.key];
      if (!resolucion) return;
      
      if (resolucion.accion === 'unificar') {
        // Unificar vacaciones de ambos registros
        const emp1 = empleadosFinales[dup.indices[0]];
        const emp2 = empleadosFinales[dup.indices[1]];
        
        if (emp1 && emp2) {
          emp1.vacaciones = [...emp1.vacaciones, ...emp2.vacaciones];
          empleadosFinales[dup.indices[1]] = null; // Marcar para eliminar
        }
      } else if (resolucion.accion === 'omitir') {
        empleadosFinales[dup.indices[1]] = null; // Eliminar el segundo
      }
      // Si es 'diferentes', no hacer nada
    });
    
    // Filtrar nulls
    const empleadosLimpios = empleadosFinales.filter(e => e !== null);
    setDatosProcesados(empleadosLimpios);
    setVista('preview');
  };

  const importarDatos = async () => {
    setImportando(true);
    setProgreso(0);
    
    try {
      let empleadosCreados = 0;
      let empleadosActualizados = 0;
      let vacacionesCreadas = 0;
      let vacacionesActualizadas = 0;
      let errores = 0;
      
      for (let i = 0; i < datosProcesados.length; i++) {
        const emp = datosProcesados[i];
        
        try {
          // 🔥 Buscar si el empleado ya existe
          const { data: existente } = await supabase
            .from("empleados")
            .select("id")
            .eq("numero_empleado", emp.numero_empleado)
            .maybeSingle();
          
          let empleadoId;
          
          if (existente) {
            // Actualizar empleado existente
            const { error } = await supabase
              .from("empleados")
              .update({
                nombre_completo: emp.nombre_completo,
                puesto: emp.puesto,
                departamento: emp.departamento,
                empresa: emp.empresa,
                salario_fiscal: emp.salario_fiscal,
                salario_no_fiscal: emp.salario_no_fiscal,
                bono_puesto: emp.bono_puesto,
                bono_puntualidad: emp.bono_puntualidad,
                bono_asistencia: emp.bono_asistencia,
                bono_desempeno: emp.bono_desempeno,
                monto_semanal: emp.monto_semanal,
                genero: emp.genero,
                fecha_ingreso: emp.fecha_ingreso
              })
              .eq("id", existente.id);
            
            if (error) throw error;
            empleadoId = existente.id;
            empleadosActualizados++;
          } else {
            // Crear nuevo empleado
            const { data, error } = await supabase
              .from("empleados")
              .insert([{
                numero_empleado: emp.numero_empleado,
                nombre_completo: emp.nombre_completo,
                puesto: emp.puesto,
                departamento: emp.departamento,
                empresa: emp.empresa,
                salario_fiscal: emp.salario_fiscal,
                salario_no_fiscal: emp.salario_no_fiscal,
                bono_puesto: emp.bono_puesto,
                bono_puntualidad: emp.bono_puntualidad,
                bono_asistencia: emp.bono_asistencia,
                bono_desempeno: emp.bono_desempeno,
                monto_semanal: emp.monto_semanal,
                genero: emp.genero,
                fecha_ingreso: emp.fecha_ingreso,
                activo: true
              }])
              .select()
              .single();
            
            if (error) throw error;
            empleadoId = data.id;
            empleadosCreados++;
          }
          
          // 🔥 Importar vacaciones como histórico
          for (const vac of emp.vacaciones) {
            const { data: vacExistente } = await supabase
              .from("vacaciones")
              .select("id")
              .eq("empleado_id", empleadoId)
              .eq("fecha_inicio", vac.fecha_inicio)
              .eq("fecha_fin", vac.fecha_fin)
              .maybeSingle();
            
            if (vacExistente) {
              const { error } = await supabase
                .from("vacaciones")
                .update({
                  dias_solicitados: vac.dias_solicitados,
                  tipo_vacaciones: vac.tipo,
                  estatus: "APROBADO"
                })
                .eq("id", vacExistente.id);
              
              if (error) throw error;
              vacacionesActualizadas++;
            } else {
              const { error } = await supabase
                .from("vacaciones")
                .insert([{
                  empleado_id: empleadoId,
                  dias_solicitados: vac.dias_solicitados,
                  fecha_inicio: vac.fecha_inicio,
                  fecha_fin: vac.fecha_fin,
                  tipo_vacaciones: vac.tipo,
                  estatus: "APROBADO"
                }]);
              
              if (error) throw error;
              vacacionesCreadas++;
            }
          }
        } catch (err) {
          console.error(`Error procesando ${emp.nombre_completo}:`, err);
          errores++;
        }
        
        setProgreso(Math.round(((i + 1) / datosProcesados.length) * 100));
      }
      
      setResultado({
        empleadosCreados,
        empleadosActualizados,
        vacacionesCreadas,
        vacacionesActualizadas,
        errores
      });
      setVista('resultado');
    } catch (err) {
      console.error("Error en importación:", err);
      alert("Error en importación: " + err.message);
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">📥 Importar Vacaciones desde CSV</h1>
      
      {vista === 'upload' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">1. Seleccionar Archivo</h2>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={procesarArchivo}
            className="w-full p-3 border rounded"
          />
          <p className="text-sm text-gray-600 mt-2">
            El archivo debe contener las columnas: N°, NOMBRE DEL TRABAJADOR, PUESTO, ÁREA, EMPRESA, FECHA DE ALTA, y bloques de DÍAS/INICIO/TERMINO/REGRESO LAB
          </p>
        </div>
      )}
      
      {vista === 'duplicados' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">2. Resolver Duplicados</h2>
          <p className="mb-4 text-gray-600">
            Se encontraron {duplicados.length} empleados duplicados. Por favor, indica cómo resolver cada caso:
          </p>
          
          <div className="space-y-4">
            {duplicados.map((dup, idx) => (
              <div key={idx} className="border rounded p-4">
                <h3 className="font-semibold mb-2">Empleado: {dup.empleados[0].nombre_completo}</h3>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm"><strong>Registro 1:</strong></p>
                    <p className="text-xs">N°: {dup.empleados[0].numero_empleado}</p>
                    <p className="text-xs">Empresa: {dup.empleados[0].empresa}</p>
                    <p className="text-xs">Vacaciones: {dup.empleados[0].vacaciones.length} bloques</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm"><strong>Registro 2:</strong></p>
                    <p className="text-xs">N°: {dup.empleados[1].numero_empleado}</p>
                    <p className="text-xs">Empresa: {dup.empleados[1].empresa}</p>
                    <p className="text-xs">Vacaciones: {dup.empleados[1].vacaciones.length} bloques</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => resolverDuplicado(dup.key, 'unificar', 0)}
                    className={`px-4 py-2 rounded ${resolucionesDuplicados[dup.key]?.accion === 'unificar' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  >
                    🔗 Unificar (combinar vacaciones)
                  </button>
                  <button
                    onClick={() => resolverDuplicado(dup.key, 'omitir', 0)}
                    className={`px-4 py-2 rounded ${resolucionesDuplicados[dup.key]?.accion === 'omitir' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  >
                    ⏭️ Omitir segundo registro
                  </button>
                  <button
                    onClick={() => resolverDuplicado(dup.key, 'diferentes', null)}
                    className={`px-4 py-2 rounded ${resolucionesDuplicados[dup.key]?.accion === 'diferentes' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  >
                     Son personas diferentes
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={aplicarResoluciones}
            disabled={Object.keys(resolucionesDuplicados).length < duplicados.length}
            className="mt-6 bg-green-600 text-white px-6 py-3 rounded font-semibold disabled:bg-gray-300"
          >
            Continuar →
          </button>
        </div>
      )}
      
      {vista === 'preview' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">3. Vista Previa</h2>
          <div className="mb-4 p-4 bg-blue-50 rounded">
            <p><strong>Total de empleados:</strong> {datosProcesados.length}</p>
            <p><strong>Total de bloques de vacaciones:</strong> {datosProcesados.reduce((acc, emp) => acc + emp.vacaciones.length, 0)}</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">N°</th>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Empresa</th>
                  <th className="p-2 text-left">Vacaciones</th>
                </tr>
              </thead>
              <tbody>
                {datosProcesados.slice(0, 10).map((emp, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2">{emp.numero_empleado}</td>
                    <td className="p-2">{emp.nombre_completo}</td>
                    <td className="p-2">{emp.empresa}</td>
                    <td className="p-2">{emp.vacaciones.length} bloques</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {datosProcesados.length > 10 && (
              <p className="text-sm text-gray-600 mt-2">... y {datosProcesados.length - 10} más</p>
            )}
          </div>
          
          <button
            onClick={importarDatos}
            disabled={importando}
            className="mt-6 bg-green-600 text-white px-6 py-3 rounded font-semibold disabled:bg-gray-300"
          >
            {importando ? `Importando... ${progreso}%` : '🚀 Importar Datos'}
          </button>
        </div>
      )}
      
      {vista === 'resultado' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">✅ Importación Completada</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-gray-600">Empleados creados:</p>
              <p className="text-2xl font-bold text-green-600">{resultado.empleadosCreados}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-sm text-gray-600">Empleados actualizados:</p>
              <p className="text-2xl font-bold text-blue-600">{resultado.empleadosActualizados}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-gray-600">Vacaciones creadas:</p>
              <p className="text-2xl font-bold text-green-600">{resultado.vacacionesCreadas}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-sm text-gray-600">Vacaciones actualizadas:</p>
              <p className="text-2xl font-bold text-blue-600">{resultado.vacacionesActualizadas}</p>
            </div>
          </div>
          
          {resultado.errores > 0 && (
            <div className="mt-4 bg-red-50 p-4 rounded">
              <p className="text-sm text-red-600">Errores: {resultado.errores}</p>
            </div>
          )}
          
          <button
            onClick={() => {
              setVista('upload');
              setArchivo(null);
              setDatosProcesados(null);
              setDuplicados([]);
              setResolucionesDuplicados({});
              setResultado(null);
            }}
            className="mt-6 bg-blue-600 text-white px-6 py-3 rounded font-semibold"
          >
            Importar Otro Archivo
          </button>
        </div>
      )}
    </div>
  );
}