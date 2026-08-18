import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const formatearNombreColumna = (texto) => {
  return String(texto || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

// 🔥 FUNCIÓN CLAVE: Normaliza cualquier nombre para poder comparar
// "Sueldo Neto" → "sueldoneto"
// "sueldo_neto" → "sueldoneto"
// "AntigüEdad" → "antiguedad"
// "Sueldo Complemento" → "sueldocomplemento"
const normalizar = (texto) => {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita acentos
    .replace(/[^a-z0-9]/g, "");       // Quita TODO excepto letras y números
};

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [puestosLista, setPuestosLista] = useState([]);
  const [departamentosLista, setDepartamentosLista] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estatus, setEstatus] = useState("ACTIVOS");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("TODOS");
  const [loading, setLoading] = useState(true);

  const [modalEdicionRapida, setModalEdicionRapida] = useState({ abierto: false, datos: null });
  const [modalRelacion, setModalRelacion] = useState(false);
  const [modalConfigColumnas, setModalConfigColumnas] = useState(false);
  const [configuracionMapeo, setConfiguracionMapeo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [ordenColumnas, setOrdenColumnas] = useState(() => {
    try { const g = localStorage.getItem("empleados_orden_columnas"); return g ? JSON.parse(g) : []; } catch { return []; }
  });

  const [columnasVisibles, setColumnasVisibles] = useState(() => {
    try { const g = localStorage.getItem("empleados_columnas_visibles"); return g ? JSON.parse(g) : {}; } catch { return {}; }
  });

  // 🔥 MAPA DE TRADUCCIÓN: Relaciona el nombre del mapeo con el nombre REAL en la BD
  const [mapaColumnas, setMapaColumnas] = useState({});

  const columnasDelMapeo = useMemo(() => {
    if (!configuracionMapeo?.asignacion) return [];
    const validas = [];
    Object.entries(configuracionMapeo.asignacion).forEach(([colOriginal, info]) => {
      if (info.tablaDestino && info.tablaDestino.trim() !== "") {
        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
        if (campoFinal) {
          validas.push({
            original: colOriginal,
            tabla: info.tablaDestino,
            campo: campoFinal,
            etiqueta: formatearNombreColumna(campoFinal)
          });
        }
      }
    });
    const unicas = new Map();
    validas.forEach(item => { if (!unicas.has(item.campo)) unicas.set(item.campo, item); });
    return Array.from(unicas.values());
  }, [configuracionMapeo]);

  const columnasActivas = useMemo(() => {
    const visibles = columnasDelMapeo.filter(c => columnasVisibles[c.campo] !== false);
    return visibles.sort((a, b) => {
      const idxA = ordenColumnas.indexOf(a.campo);
      const idxB = ordenColumnas.indexOf(b.campo);
      return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
    });
  }, [columnasDelMapeo, columnasVisibles, ordenColumnas]);

  useEffect(() => { localStorage.setItem("empleados_columnas_visibles", JSON.stringify(columnasVisibles)); }, [columnasVisibles]);
  useEffect(() => { localStorage.setItem("empleados_orden_columnas", JSON.stringify(ordenColumnas)); }, [ordenColumnas]);

  useEffect(() => {
    cargarCatalogos();
    cargarRelacionCamposConfiguracion();
  }, []);

  useEffect(() => {
    if (columnasDelMapeo.length > 0) {
      setColumnasVisibles(prev => {
        const nuevo = { ...prev };
        columnasDelMapeo.forEach(col => { if (nuevo[col.campo] === undefined) nuevo[col.campo] = true; });
        return nuevo;
      });
      setOrdenColumnas(prev => {
        const nuevoOrden = [...prev];
        columnasDelMapeo.forEach(col => { if (!nuevoOrden.includes(col.campo)) nuevoOrden.push(col.campo); });
        return nuevoOrden;
      });
      cargarEmpleados();
    }
  }, [columnasDelMapeo]);

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepts] = await Promise.all([
        supabase.from("puestos").select("*").order("nombre"),
        supabase.from("departamentos").select("*").order("nombre")
      ]);
      const puestosUnicos = new Map();
      (resPuestos.data || []).forEach((p) => {
        const nombre = String(p.nombre || "").trim();
        if (nombre && !puestosUnicos.has(nombre.toLowerCase())) puestosUnicos.set(nombre.toLowerCase(), { ...p, nombre });
      });
      setPuestosLista(Array.from(puestosUnicos.values()));
      setDepartamentosLista(resDepts.data || []);
    } catch (e) { console.error("Error cargando catálogos:", e); }
  };

  const cargarEmpleados = async () => {
    setLoading(true);
    try {
      const { data: emps, error: errorEmps } = await supabase
        .from("empleados")
        .select("*")
        .order("nombre_completo");

      if (errorEmps) throw errorEmps;

      // 🔥 PASO CLAVE: Construir el mapa de traducción de columnas
      // Compara lo que dice el mapeo con lo que REALMENTE existe en la BD
      if (emps && emps.length > 0 && columnasDelMapeo.length > 0) {
        const columnasReales = Object.keys(emps[0]);
        const nuevoMapa = {};

        columnasDelMapeo.forEach(colMapeo => {
          const nombreBuscado = colMapeo.campo;
          const nombreNormalizado = normalizar(nombreBuscado);

          // 1. Primero buscar coincidencia EXACTA
          if (columnasReales.includes(nombreBuscado)) {
            nuevoMapa[nombreBuscado] = nombreBuscado;
            return;
          }

          // 2. Si no hay exacta, buscar por nombre normalizado
          const coincidencia = columnasReales.find(colReal => {
            return normalizar(colReal) === nombreNormalizado;
          });

          if (coincidencia) {
            nuevoMapa[nombreBuscado] = coincidencia;
            console.log(`🔄 Columna mapeada: "${nombreBuscado}" → encontrada en BD como: "${coincidencia}"`);
          } else {
            // 3. Si tampoco hay normalizada, buscar coincidencia parcial
            const parcial = columnasReales.find(colReal => {
              const colNorm = normalizar(colReal);
              return colNorm.includes(nombreNormalizado) || nombreNormalizado.includes(colNorm);
            });

            if (parcial) {
              nuevoMapa[nombreBuscado] = parcial;
              console.log(`🔄 Columna mapeada (parcial): "${nombreBuscado}" → encontrada en BD como: "${parcial}"`);
            } else {
              nuevoMapa[nombreBuscado] = nombreBuscado;
              console.log(`⚠️ Columna "${nombreBuscado}" no encontrada en la BD`);
            }
          }
        });

        setMapaColumnas(nuevoMapa);
        console.log("📋 Mapa de columnas completo:", nuevoMapa);
      }

      let empleadosProcesados = (emps || []).map(emp => {
        let deptoObj = null;
        if (emp.departamento_id) {
          deptoObj = departamentosLista.find(d => d.id === emp.departamento_id);
        } else if (emp.departamento) {
          deptoObj = { nombre: emp.departamento };
        }

        let puestoObj = null;
        if (emp.puesto_id) {
          puestoObj = puestosLista.find(p => p.id === emp.puesto_id);
        } else if (emp.puesto) {
          puestoObj = { nombre: emp.puesto };
        }

        return { ...emp, departamentos: deptoObj, puestos: puestoObj };
      });

      // Enriquecer con tablas relacionadas
      const tablasRelacionadas = new Set();
      Object.values(configuracionMapeo?.asignacion || {}).forEach(info => {
        if (info.tablaDestino && !['empleados', 'puestos', 'departamentos'].includes(info.tablaDestino)) {
          tablasRelacionadas.add(info.tablaDestino);
        }
      });

      if (tablasRelacionadas.size > 0) {
        const promesas = Array.from(tablasRelacionadas).map(async (tabla) => {
          try {
            const { data, error } = await supabase.from(tabla).select("*");
            return { tabla, data: error ? [] : (data || []) };
          } catch (e) { return { tabla, data: [] }; }
        });
        const resultados = await Promise.all(promesas);

        empleadosProcesados = empleadosProcesados.map(emp => {
          const empEnriquecido = { ...emp };
          resultados.forEach(({ tabla, data }) => {
            const registros = data.filter(r => r.empleado_id === emp.id || r.empleado_id === emp.numero_empleado);
            if (registros.length > 0) {
              const ultimo = registros[registros.length - 1];
              Object.keys(ultimo).forEach(key => {
                if (!['id', 'empleado_id', 'created_at', 'updated_at'].includes(key)) {
                  empEnriquecido[key] = ultimo[key];
                }
              });
            }
          });
          return empEnriquecido;
        });
      }

      setEmpleados(empleadosProcesados);
    } catch (err) {
      console.error("❌ Error al cargar empleados:", err?.message || err);
      setEmpleados([]);
    } finally { setLoading(false); }
  };

  const cargarRelacionCamposConfiguracion = async () => {
    try {
      const { data } = await supabase.from("configuracion_tablas").select("configuracion").eq("clave", "config_mapeo_columnas_dinamico").maybeSingle();
      if (data?.configuracion) setConfiguracionMapeo(data.configuracion);
      else {
        const local = localStorage.getItem("config_mapeo_columnas_dinamico");
        if (local) setConfiguracionMapeo(JSON.parse(local));
      }
    } catch (err) { console.error("Error cargando configuración:", err); }
  };

  // 🔥 FUNCIÓN CLAVE: Obtener el valor de una columna usando el mapa de traducción
  const obtenerValorColumna = (empleado, campoMapeo) => {
    // Primero intentar con el nombre del mapeo
    if (empleado[campoMapeo] !== undefined && empleado[campoMapeo] !== null) {
      return empleado[campoMapeo];
    }
    // Si no, usar el mapa de traducción para encontrar el nombre real
    const nombreReal = mapaColumnas[campoMapeo];
    if (nombreReal && empleado[nombreReal] !== undefined) {
      return empleado[nombreReal];
    }
    // Si tampoco, buscar en todas las propiedades del empleado
    const normalizado = normalizar(campoMapeo);
    const claveReal = Object.keys(empleado).find(k => normalizar(k) === normalizado);
    if (claveReal) return empleado[claveReal];
    
    return null;
  };

  const cambiarVisibilidadColumna = (campo) => setColumnasVisibles(prev => ({ ...prev, [campo]: !prev[campo] }));
  const moverColumna = (campo, direccion) => {
    setOrdenColumnas(prev => {
      const idx = prev.indexOf(campo);
      if (idx === -1) return prev;
      const nuevo = [...prev];
      if (direccion === 'arriba' && idx > 0) [nuevo[idx - 1], nuevo[idx]] = [nuevo[idx], nuevo[idx - 1]];
      else if (direccion === 'abajo' && idx < prev.length - 1) [nuevo[idx], nuevo[idx + 1]] = [nuevo[idx + 1], nuevo[idx]];
      return nuevo;
    });
  };
  const restablecerOrden = () => setOrdenColumnas(columnasDelMapeo.map(c => c.campo));

  const obtenerValoresEmpleado = (emp) => {
    if (!emp) return { salarioBaseSemanal: 0, salarioDiario: 0, totalBonos: 0 };
    const sb = Number(emp?.sueldo_base ?? 0);
    const bonos = [
      Number(emp?.bono_puesto ?? 0), Number(emp?.bono_puntualidad ?? 0), Number(emp?.bono_asistencia ?? 0),
      Number(emp?.bono_multiplicador ?? 0), Number(emp?.bono_desempeno ?? 0), Number(emp?.bono_extra ?? 0),
      Number(emp?.apoyo_medico ?? 0), Number(emp?.gratificacion_especial ?? 0)
    ];
    return {
      salarioBaseSemanal: sb, salarioDiario: sb > 0 ? sb / 7 : 0,
      bonoPuesto: bonos[0], bonoPuntualidad: bonos[1], bonoAsistencia: bonos[2],
      bonoMultiplicador: bonos[3], bonoDesempeno: bonos[4], bonoExtra: bonos[5],
      apoyoMedico: bonos[6], gratificacionEspecial: bonos[7],
      totalBonos: bonos.reduce((a, b) => a + b, 0)
    };
  };

  const guardarEdicionRapida = async (e) => {
    e.preventDefault();
    if (!modalEdicionRapida.datos) return;
    setGuardando(true);
    const d = modalEdicionRapida.datos;
    const { error } = await supabase.from("empleados").update({
      departamento_id: d.departamento_id || null, puesto_id: d.puesto_id || null,
      activo: Boolean(d.activo), sueldo_base: Number(d.sueldo_base) || 0,
      supervisor_id: d.supervisor_id || null,
      fecha_baja: d.activo ? null : (d.fecha_baja || new Date().toISOString().split("T")[0]),
    }).eq("id", d.id);
    setGuardando(false);
    if (error) alert("Error: " + error.message);
    else { setModalEdicionRapida({ abierto: false, datos: null }); cargarEmpleados(); }
  };

  const esPuestoSupervisor = (puestoId) => {
    const p = puestosLista.find(x => x.id === puestoId);
    if (!p) return false;
    return ["supervisor", "jefe", "líder", "lider", "encargado"].some(word => p.nombre.toLowerCase().includes(word));
  };

  const departamentos = ["TODOS", ...new Set(empleados.map(e => e?.departamentos?.nombre).filter(Boolean))].sort();

  const empleadosFiltrados = empleados.filter(emp => {
    if (!emp) return false;
    const texto = busqueda.toLowerCase().trim();
    const coincide = [emp.nombre_completo, emp.numero_empleado, emp.departamentos?.nombre, emp.puestos?.nombre].some(campo => String(campo || "").toLowerCase().includes(texto));
    const coincideEstatus = estatus === "TODOS" || (estatus === "ACTIVOS" && (emp.activo ?? true)) || (estatus === "BAJAS" && !(emp.activo ?? true));
    const coincideDepto = departamentoFiltro === "TODOS" || emp.departamentos?.nombre === departamentoFiltro;
    return coincide && coincideEstatus && coincideDepto;
  });

  const total = empleados.length;
  const activos = empleados.filter(e => e?.activo ?? true).length;
  const bajas = empleados.filter(e => !(e?.activo ?? true)).length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">👥 Empleados</h1>
            <p className="text-gray-500 mt-2">Gestión sincronizada con configuración dinámica</p>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4 md:mt-0">
            <button onClick={() => setModalConfigColumnas(true)} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">⚙️ Columnas ({columnasActivas.length})</button>
            <button onClick={() => setModalRelacion(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">🔗 Relación</button>
            <Link to="/empleados/importar" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">📝 Editar</Link>
            <Link to="/empleados/nuevo" className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm shadow-sm">+ Nuevo</Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Total" valor={total} icono="👥" color="text-blue-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input type="text" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
            <select value={estatus} onChange={e => setEstatus(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="ACTIVOS">Activos</option><option value="BAJAS">Bajas</option><option value="TODOS">Todos</option>
            </select>
            <select value={departamentoFiltro} onChange={e => setDepartamentoFiltro(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              {departamentos.map(dep => <option key={dep} value={dep}>{dep}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 text-gray-700 font-bold border-b">
              <tr>
                <th className="p-3">No.</th><th className="p-3">Colaborador</th><th className="p-3">Departamento</th><th className="p-3">Puesto</th>
                {columnasActivas.map(col => (<th key={col.campo} className={`p-3 text-right ${col.campo.includes('sueldo') || col.campo.includes('bono') ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-50'}`}>{col.etiqueta}</th>))}
                <th className="p-3 text-center">Estatus</th><th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={20} className="p-6 text-center text-gray-500">Cargando...</td></tr>}
              {!loading && empleadosFiltrados.map(emp => {
                const valores = obtenerValoresEmpleado(emp);
                const estaActivo = emp.activo ?? true;
                return (
                  <tr key={emp.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-3 font-mono">{emp.numero_empleado || "S/N"}</td>
                    <td className="p-3 font-semibold text-gray-800">{emp.nombre_completo || "Sin nombre"}</td>
                    <td className="p-3">{emp.departamentos?.nombre || "N/A"}</td>
                    <td className="p-3">{emp.puestos?.nombre || "Sin Asignar"}</td>
                    {columnasActivas.map(col => {
                      // 🔥 USAR LA FUNCIÓN INTELIGENTE para obtener el valor
                      const val = obtenerValorColumna(emp, col.campo);
                      const esMoneda = col.campo.includes('sueldo') || col.campo.includes('bono') || col.campo.includes('total') || col.campo.includes('apoyo') || col.campo.includes('gratificacion') || col.campo.includes('neto') || col.campo.includes('complemento');
                      const displayVal = esMoneda 
                        ? (val !== null && val !== undefined && val !== "" ? `$${Number(val).toFixed(2)}` : "$0.00") 
                        : (val !== null && val !== undefined && val !== "" ? String(val) : "-");
                      return (<td key={col.campo} className={`p-3 text-right ${esMoneda ? 'bg-emerald-50/20 text-gray-700' : ''}`}>{displayVal}</td>);
                    })}
                    <td className="p-3 text-center">{estaActivo ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Activo</span> : <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">Baja</span>}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => setModalEdicionRapida({ abierto: true, datos: { id: emp.id, nombre_completo: emp.nombre_completo, departamento_id: emp.departamento_id || "", puesto_id: emp.puesto_id || "", activo: estaActivo, sueldo_base: valores.salarioBaseSemanal, supervisor_id: emp.supervisor_id || "" } })} className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg font-semibold text-xs">✏️ Editar</button>
                        <Link to={`/empleados/detalle/${emp.id}`} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg font-semibold text-xs">Ver</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && empleadosFiltrados.length === 0 && <tr><td colSpan={20} className="p-6 text-center text-gray-500">No se encontraron empleados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b">
              <div><h3 className="text-lg font-bold text-slate-800">⚙️ Configurar y Reordenar Columnas</h3><p className="text-xs text-gray-500">Activa/desactiva y usa las flechas para ordenar.</p></div>
              <button onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
              <span className="text-xs text-slate-600 font-medium">Mostrando <strong>{columnasActivas.length}</strong> de <strong>{columnasDelMapeo.length}</strong></span>
              <button onClick={restablecerOrden} className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-2 rounded-lg text-xs font-semibold">🔄 Orden original</button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {columnasDelMapeo.map(col => {
                const idx = ordenColumnas.indexOf(col.campo);
                const nombreReal = mapaColumnas[col.campo];
                const encontrada = nombreReal && nombreReal !== col.campo;
                return (
                  <div key={col.campo} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition">
                    <input type="checkbox" checked={columnasVisibles[col.campo] !== false} onChange={() => cambiarVisibilidadColumna(col.campo)} className="w-4 h-4 text-blue-600 rounded" />
                    <div className="flex-1">
                      <div className="font-semibold text-slate-700 text-sm">{col.etiqueta}</div>
                      <div className="text-[10px] text-slate-500">📄 Excel: <span className="font-mono">{col.original}</span> | 🗄️ {col.tabla}</div>
                      {encontrada && <div className="text-[10px] text-emerald-600 mt-0.5">✅ Encontrada en BD como: <span className="font-mono font-bold">{nombreReal}</span></div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moverColumna(col.campo, 'arriba')} disabled={idx === 0} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↑</button>
                      <button onClick={() => moverColumna(col.campo, 'abajo')} disabled={idx === ordenColumnas.length - 1} className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold">↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t flex justify-end"><button onClick={() => setModalConfigColumnas(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Aplicar Cambios</button></div>
          </div>
        </div>
      )}

      {modalRelacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b mb-4">
              <div><h2 className="text-xl font-bold text-slate-800">🔗 Relación Completa</h2></div>
              <button onClick={() => setModalRelacion(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm">✕ Cerrar</button>
            </div>
            {configuracionMapeo?.asignacion ? (
              <div className="space-y-4">
                <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-medium">✅ Mapeo activo. Total: <strong>{Object.keys(configuracionMapeo.asignacion).length}</strong></div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-semibold"><tr><th className="p-3 border-b">Excel</th><th className="p-3 border-b">Tabla</th><th className="p-3 border-b">Campo</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(configuracionMapeo.asignacion).map(([colOrig, info], idx) => {
                        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
                        return (<tr key={idx} className="hover:bg-slate-50"><td className="p-3 font-semibold text-slate-800">{colOrig}</td><td className="p-3">{info.tablaDestino ? <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">{info.tablaDestino}</span> : "Omitida"}</td><td className="p-3 font-mono text-slate-600">{campoFinal || "Sin definir"}</td></tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (<div className="py-12 text-center text-gray-500"><p className="text-sm">⚠️ No se encontró configuración.</p></div>)}
            <div className="mt-6 pt-4 border-t flex justify-end"><button onClick={() => setModalRelacion(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold">Cerrar</button></div>
          </div>
        </div>
      )}

      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarEdicionRapida} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="border-b pb-3 flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">✏️ Editar Empleado</h3><button type="button" onClick={() => setModalEdicionRapida({ abierto: false, datos: null })} className="text-gray-400 font-bold">✕</button></div>
            <p className="text-xs text-gray-500">Colaborador: <strong className="text-gray-800">{modalEdicionRapida.datos?.nombre_completo || "S/D"}</strong></p>
            <div className="space-y-4 text-xs md:text-sm">
              <div><label className="block font-semibold text-gray-700 mb-1">Departamento</label><select value={modalEdicionRapida.datos?.departamento_id || ""} onChange={e => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, departamento_id: e.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white"><option value="">-- Seleccionar --</option>{departamentosLista.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></div>
              <div><label className="block font-semibold text-gray-700 mb-1">Puesto</label><select value={modalEdicionRapida.datos?.puesto_id || ""} onChange={e => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, puesto_id: e.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white"><option value="">-- Seleccionar --</option>{puestosLista.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
              {esPuestoSupervisor(modalEdicionRapida.datos?.puesto_id) && (<div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100"><label className="block font-bold text-blue-900 mb-1">👥 Supervisor</label><select value={modalEdicionRapida.datos?.supervisor_id || ""} onChange={e => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, supervisor_id: e.target.value } }))} className="w-full border p-2 rounded-lg bg-white text-xs"><option value="">-- Sin supervisor --</option>{empleados.filter(emp => emp.id !== modalEdicionRapida.datos?.id).map(emp => <option key={emp.id} value={emp.id}>{emp.nombre_completo} ({emp.puestos?.nombre || "Sin puesto"})</option>)}</select></div>)}
              <div><label className="block font-semibold text-gray-700 mb-1">Estatus</label><select value={modalEdicionRapida.datos?.activo ? "ACTIVO" : "INACTIVO"} onChange={e => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, activo: e.target.value === "ACTIVO" } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white"><option value="ACTIVO">Activo</option><option value="INACTIVO">Baja / Inactivo</option></select></div>
              <div><label className="block font-semibold text-gray-700 mb-1">Sueldo Base ($)</label><input type="number" step="0.01" min="0" value={modalEdicionRapida.datos?.sueldo_base ?? 0} onChange={e => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, sueldo_base: e.target.value } }))} className="w-full border p-2.5 rounded-lg font-bold text-green-700 outline-none" /></div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t"><button type="button" onClick={() => setModalEdicionRapida({ abierto: false, datos: null })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold">Cancelar</button><button type="submit" disabled={guardando} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300">{guardando ? "Guardando..." : "Guardar Cambios"}</button></div>
          </form>
        </div>
      )}
    </Layout>
  );
}