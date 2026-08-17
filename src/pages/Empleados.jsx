import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const COLUMNAS_FIJAS = ["numero_empleado", "nombre_completo", "departamento", "puesto"];

const COLUMNAS_MONEDA = [
  "sueldo", "salario", "bono", "apoyo", "gratificacion", "percepcion",
  "deduccion", "importe", "monto", "pago", "comision", "neto", "total",
  "descuento", "abono", "saldo", "prestamo", "adeudo"
];

const TABLAS_CATALOGO = ["puestos", "departamentos"];
const TABLAS_RELACIONALES_VALIDAS = ["empleados", "incidencias", "vacaciones", "prestamos"];

const ETIQUETAS_COLUMNAS = {
  sueldo_base: "Sueldo Base", sueldo_diario: "Sueldo Diario",
  bono_puesto: "Bono Puesto", bono_puntualidad: "Bono Puntualidad",
  bono_asistencia: "Bono Asistencia", bono_multiplicador: "Bono Multiplicador",
  bono_desempeno: "Bono Desempeño", bono_extra: "Bono Extra",
  apoyo_medico: "Apoyo Médico", gratificacion_especial: "Gratificación Especial",
  total_bonos: "Total Bonos", fecha_alta: "Fecha de Alta",
  fecha_baja: "Fecha de Baja", activo: "Estatus",
};

const formatearNombreColumna = (texto) => {
  if (ETIQUETAS_COLUMNAS[texto]) return ETIQUETAS_COLUMNAS[texto];
  return String(texto || "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const esColumnaMoneda = (columna) => {
  const nombre = String(columna || "").toLowerCase();
  return COLUMNAS_MONEDA.some((palabra) => nombre.includes(palabra));
};

const esColumnaFecha = (columna) => {
  const nombre = String(columna || "").toLowerCase();
  return nombre.includes("fecha") || nombre.endsWith("_at");
};

const valorNumerico = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

const formatearMoneda = (valor) => {
  const numero = valorNumerico(valor);
  if (numero === null) return "-";
  return numero.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatearFecha = (valor) => {
  if (!valor) return "-";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString("es-MX");
};

const formatearValorCelda = (valor, columna) => {
  if (valor === null || valor === undefined || valor === "") return "-";
  if (columna === "activo") return Boolean(valor) ? "Activo" : "Baja";
  if (esColumnaMoneda(columna)) return formatearMoneda(valor);
  if (esColumnaFecha(columna)) return formatearFecha(valor);
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) {
    return valor.map((el) => (typeof el === "object" && el !== null ? el.nombre || el.label || JSON.stringify(el) : String(el))).join(", ");
  }
  if (typeof valor === "object") return valor.nombre || valor.label || JSON.stringify(valor);
  return String(valor);
};

const descubrirColumnasTabla = async (nombreTabla) => {
  try {
    const { data, error } = await supabase.from(nombreTabla).select("*").limit(1);
    if (error) return [];
    if (data && data.length > 0) return Object.keys(data[0]);
    return [];
  } catch (err) {
    return [];
  }
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
  const [esquemaReal, setEsquemaReal] = useState({});

  const [columnasDisponibles, setColumnasDisponibles] = useState([]);
  
  // 🔥 NUEVO: Estado para el orden personalizado de columnas
  const [ordenColumnas, setOrdenColumnas] = useState(() => {
    try {
      const guardadas = localStorage.getItem("empleados_orden_columnas");
      return guardadas ? JSON.parse(guardadas) : [];
    } catch {
      return [];
    }
  });

  const [columnasVisibles, setColumnasVisibles] = useState(() => {
    try {
      const guardadas = localStorage.getItem("empleados_columnas_visibles_dinamicas");
      return guardadas ? JSON.parse(guardadas) : {};
    } catch {
      return {};
    }
  });

  const columnasDelMapeo = useMemo(() => {
    if (!configuracionMapeo?.asignacion || Object.keys(esquemaReal).length === 0) return [];
    
    const columnasOmitidas = [];
    const columnasValidas = [];

    Object.entries(configuracionMapeo.asignacion).forEach(([colOriginal, info]) => {
      if (!info.tablaDestino || !info.tablaDestino.trim()) {
        columnasOmitidas.push({ col: colOriginal, razon: "Marcada como ignorada" });
        return;
      }
      if (TABLAS_CATALOGO.includes(info.tablaDestino)) {
        columnasOmitidas.push({ col: colOriginal, razon: `Tabla '${info.tablaDestino}' es catálogo` });
        return;
      }
      if (!esquemaReal[info.tablaDestino]) {
        columnasOmitidas.push({ col: colOriginal, razon: `Tabla '${info.tablaDestino}' no existe` });
        return;
      }
      const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
      if (!campoFinal) {
        columnasOmitidas.push({ col: colOriginal, razon: "No tiene campo destino" });
        return;
      }
      const columnasExistentes = esquemaReal[info.tablaDestino] || [];
      if (!columnasExistentes.includes(campoFinal)) {
        columnasOmitidas.push({ col: colOriginal, razon: `Campo '${campoFinal}' NO existe en '${info.tablaDestino}'` });
        return;
      }
      columnasValidas.push({
        original: colOriginal,
        tabla: info.tablaDestino,
        campo: campoFinal,
        etiqueta: formatearNombreColumna(campoFinal)
      });
    });

    const unicasMap = new Map();
    columnasValidas.forEach(item => {
      if (!unicasMap.has(item.campo)) unicasMap.set(item.campo, item);
    });

    return Array.from(unicasMap.values());
  }, [configuracionMapeo, esquemaReal]);

  const columnasPorTabla = useMemo(() => {
    const agrupado = {};
    columnasDelMapeo.forEach(col => {
      if (!agrupado[col.tabla]) agrupado[col.tabla] = [];
      agrupado[col.tabla].push(col.campo);
    });
    return agrupado;
  }, [columnasDelMapeo]);

  // 🔥 NUEVO: Actualizar orden cuando cambian las columnas disponibles
  useEffect(() => {
    if (columnasDelMapeo.length > 0) {
      const nuevasColumnas = columnasDelMapeo.map(c => c.campo);
      setColumnasDisponibles(nuevasColumnas);
      
      // Actualizar orden: agregar nuevas columnas al final, mantener las existentes
      setOrdenColumnas(prev => {
        const ordenActualizado = [...prev];
        nuevasColumnas.forEach(col => {
          if (!ordenActualizado.includes(col)) {
            ordenActualizado.push(col);
          }
        });
        // Remover columnas que ya no existen
        return ordenActualizado.filter(col => nuevasColumnas.includes(col));
      });
      
      setColumnasVisibles(prev => {
        const nuevoEstado = {};
        nuevasColumnas.forEach(col => {
          nuevoEstado[col] = prev[col] !== undefined ? prev[col] : true;
        });
        return nuevoEstado;
      });

      cargarEmpleados();
    }
  }, [columnasDelMapeo]);

  useEffect(() => {
    localStorage.setItem("empleados_columnas_visibles_dinamicas", JSON.stringify(columnasVisibles));
  }, [columnasVisibles]);

  // 🔥 NUEVO: Guardar orden en localStorage
  useEffect(() => {
    localStorage.setItem("empleados_orden_columnas", JSON.stringify(ordenColumnas));
  }, [ordenColumnas]);

  useEffect(() => {
    cargarCatalogos();
    cargarRelacionCamposConfiguracion();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepartamentos] = await Promise.all([
        supabase.from("puestos").select("id, nombre").order("nombre"),
        supabase.from("departamentos").select("id, nombre").order("nombre"),
      ]);
      if (resPuestos.data) setPuestosLista(resPuestos.data);
      if (resDepartamentos.data) setDepartamentosLista(resDepartamentos.data);
    } catch (error) {
      console.error("Error cargando catálogos:", error);
    }
  };

  const descubrirEsquemaTablas = async () => {
    const tablasAExplorar = new Set(TABLAS_RELACIONALES_VALIDAS);
    if (configuracionMapeo?.asignacion) {
      Object.values(configuracionMapeo.asignacion).forEach(info => {
        if (info.tablaDestino && !TABLAS_CATALOGO.includes(info.tablaDestino)) {
          tablasAExplorar.add(info.tablaDestino);
        }
      });
    }
    const resultados = await Promise.all(
      Array.from(tablasAExplorar).map(async (tabla) => {
        const columnas = await descubrirColumnasTabla(tabla);
        return { tabla, columnas };
      })
    );
    const esquema = {};
    resultados.forEach(({ tabla, columnas }) => {
      if (columnas.length > 0) esquema[tabla] = columnas;
    });
    setEsquemaReal(esquema);
    return esquema;
  };

  const cargarEmpleados = async () => {
    setLoading(true);
    try {
      const columnasEmpleados = columnasPorTabla.empleados || [];
      const columnasEsenciales = ["id", "numero_empleado", "nombre_completo", "departamento_id", "puesto_id", "supervisor_id", "activo", "created_at", "updated_at"];
      const columnasExistentesEmpleados = esquemaReal.empleados || [];
      const columnasEmpleadosValidas = columnasEmpleados.filter(c => columnasExistentesEmpleados.includes(c));
      const selectEmpleados = [...new Set([...columnasEsenciales, ...columnasEmpleadosValidas])].join(",");

      const { data: empleadosData, error: empleadosError } = await supabase
        .from("empleados")
        .select(selectEmpleados)
        .order("nombre_completo");

      if (empleadosError) throw empleadosError;

      const tablasRelacionadas = Object.keys(columnasPorTabla).filter(t => t !== 'empleados' && !TABLAS_CATALOGO.includes(t));
      const datosRelacionados = {};

      if (tablasRelacionadas.length > 0) {
        const consultas = tablasRelacionadas.map(async (tabla) => {
          const columnasTabla = columnasPorTabla[tabla];
          const columnasExistentes = esquemaReal[tabla] || [];
          const columnasValidas = columnasTabla.filter(c => columnasExistentes.includes(c));
          if (columnasValidas.length === 0 || !columnasExistentes.includes('empleado_id')) {
            return { tabla, data: [] };
          }
          const selectRelacion = [...new Set(["empleado_id", ...columnasValidas, "created_at"])].join(",");
          try {
            const { data, error } = await supabase.from(tabla).select(selectRelacion).order("created_at", { ascending: false });
            if (error) return { tabla, data: [] };
            return { tabla, data: data || [] };
          } catch (err) {
            return { tabla, data: [] };
          }
        });
        const resultados = await Promise.all(consultas);
        resultados.forEach(({ tabla, data }) => { datosRelacionados[tabla] = data; });
      }

      const empleadosCombinados = (empleadosData || []).map((empleado) => {
        const empleadoCombinado = {
          ...empleado,
          departamentos: departamentosLista.find(d => d.id === empleado.departamento_id) || null,
          puestos: puestosLista.find(p => p.id === empleado.puesto_id) || null,
        };
        tablasRelacionadas.forEach(tabla => {
          const registros = datosRelacionados[tabla] || [];
          const registroReciente = registros.find(r => r.empleado_id === empleado.id);
          if (registroReciente) {
            (columnasPorTabla[tabla] || []).forEach(campo => {
              if (campo in registroReciente) empleadoCombinado[campo] = registroReciente[campo];
            });
          }
        });
        return empleadoCombinado;
      });

      setEmpleados(empleadosCombinados);
    } catch (error) {
      console.error("Error al cargar empleados:", error);
      alert(`Error: ${error?.message || "Desconocido"}`);
      setEmpleados([]);
    } finally {
      setLoading(false);
    }
  };

  const cargarRelacionCamposConfiguracion = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_tablas")
        .select("configuracion")
        .eq("clave", "config_mapeo_columnas_dinamico")
        .maybeSingle();

      if (error) throw error;

      if (data?.configuracion) {
        setConfiguracionMapeo(data.configuracion);
        await descubrirEsquemaTablas();
        return;
      }

      const local = localStorage.getItem("config_mapeo_columnas_dinamico");
      if (local) {
        setConfiguracionMapeo(JSON.parse(local));
        await descubrirEsquemaTablas();
      }
    } catch (error) {
      console.error("Error cargando configuración:", error);
    }
  };

  const cambiarVisibilidadColumna = (columna) => {
    setColumnasVisibles(prev => ({ ...prev, [columna]: !prev[columna] }));
  };

  // 🔥 NUEVO: Funciones para reordenar columnas
  const moverColumna = (columna, direccion) => {
    setOrdenColumnas(prev => {
      const indice = prev.indexOf(columna);
      if (indice === -1) return prev;
      
      const nuevoOrden = [...prev];
      if (direccion === 'arriba' && indice > 0) {
        [nuevoOrden[indice - 1], nuevoOrden[indice]] = [nuevoOrden[indice], nuevoOrden[indice - 1]];
      } else if (direccion === 'abajo' && indice < prev.length - 1) {
        [nuevoOrden[indice], nuevoOrden[indice + 1]] = [nuevoOrden[indice + 1], nuevoOrden[indice]];
      }
      return nuevoOrden;
    });
  };

  const restablecerOrdenColumnas = () => {
    setOrdenColumnas(columnasDelMapeo.map(c => c.campo));
    alert("✅ Orden restablecido al predeterminado.");
  };

  const restablecerPreferenciasColumnas = () => {
    const nuevoEstado = {};
    columnasDelMapeo.forEach(col => { nuevoEstado[col.campo] = true; });
    setColumnasVisibles(nuevoEstado);
    localStorage.setItem("empleados_columnas_visibles_dinamicas", JSON.stringify(nuevoEstado));
    alert("✅ Preferencias reiniciadas.");
  };

  const guardarEdicionRapida = async (evento) => {
    evento.preventDefault();
    if (!modalEdicionRapida.datos) return;
    setGuardando(true);
    try {
      const datos = modalEdicionRapida.datos;
      const { error } = await supabase.from("empleados").update({
        departamento_id: datos.departamento_id || null,
        puesto_id: datos.puesto_id || null,
        activo: Boolean(datos.activo),
        sueldo_base: Number(datos.sueldo_base) || 0,
        supervisor_id: datos.supervisor_id || null,
        fecha_baja: datos.activo ? null : (datos.fecha_baja || new Date().toISOString().split("T")[0]),
      }).eq("id", datos.id);

      if (error) throw error;
      setModalEdicionRapida({ abierto: false, datos: null });
      await cargarEmpleados();
    } catch (error) {
      alert(`Error: ${error?.message || "Desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const esPuestoSupervisor = (puestoId) => {
    const puesto = puestosLista.find((p) => String(p.id) === String(puestoId));
    if (!puesto) return false;
    return ["supervisor", "jefe", "líder", "lider", "encargado"].some((palabra) => String(puesto.nombre).toLowerCase().includes(palabra));
  };

  const departamentos = useMemo(() => {
    const nombres = empleados.map((e) => e?.departamentos?.nombre).filter(Boolean);
    return ["TODOS", ...new Set(nombres)].sort((a, b) => a.localeCompare(b, "es"));
  }, [empleados]);

  const empleadosFiltrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return empleados.filter((empleado) => {
      if (!empleado) return false;
      const coincideBusqueda = [
        empleado.nombre_completo, empleado.numero_empleado,
        empleado.departamentos?.nombre, empleado.puestos?.nombre
      ].some(campo => String(campo || "").toLowerCase().includes(texto));

      const activo = Boolean(empleado.activo ?? true);
      const coincideEstatus = estatus === "TODOS" || (estatus === "ACTIVOS" && activo) || (estatus === "BAJAS" && !activo);
      const coincideDepartamento = departamentoFiltro === "TODOS" || empleado.departamentos?.nombre === departamentoFiltro;

      return coincideBusqueda && coincideEstatus && coincideDepartamento;
    });
  }, [empleados, busqueda, estatus, departamentoFiltro]);

  const total = empleados.length;
  const activos = empleados.filter((e) => e?.activo ?? true).length;
  const bajas = empleados.filter((e) => !(e?.activo ?? true)).length;
  
  // 🔥 NUEVO: Aplicar orden personalizado a las columnas activas
  const columnasActivas = useMemo(() => {
    const visibles = columnasDisponibles.filter(c => columnasVisibles[c]);
    // Ordenar según el orden personalizado
    return visibles.sort((a, b) => {
      const indexA = ordenColumnas.indexOf(a);
      const indexB = ordenColumnas.indexOf(b);
      // Si no están en el orden, ponerlas al final
      return (indexA === -1 ? 9999 : indexA) - (indexB === -1 ? 9999 : indexB);
    });
  }, [columnasDisponibles, columnasVisibles, ordenColumnas]);

  const totalColumnasTabla = 4 + columnasActivas.length + 2;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">👥 Empleados</h1>
            <p className="text-gray-500 mt-2">Gestión sincronizada con todos los módulos</p>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4 md:mt-0">
            <button type="button" onClick={() => setModalConfigColumnas(true)} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">
              ⚙️ Columnas visibles ({columnasActivas.length})
            </button>
            <button type="button" onClick={() => setModalRelacion(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">
              🔗 Relación campos
            </button>
            <Link to="/empleados/importar" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">📝 Editar empleados</Link>
            <Link to="/empleados/nuevo" className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm shadow-sm">+ Nuevo empleado</Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Total" valor={total} icono="👥" color="text-blue-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input type="text" placeholder="🔍 Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
            <select value={estatus} onChange={(e) => setEstatus(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="ACTIVOS">Activos</option>
              <option value="BAJAS">Bajas</option>
              <option value="TODOS">Todos</option>
            </select>
            <select value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 text-gray-700 font-bold border-b">
              <tr>
                <th className="p-3">No.</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Departamento</th>
                <th className="p-3">Puesto</th>
                {columnasActivas.map((columna) => (
                  <th key={columna} className={`p-3 text-center ${esColumnaMoneda(columna) ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-800"}`}>
                    {formatearNombreColumna(columna)}
                  </th>
                ))}
                <th className="p-3 text-center">Estatus</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={totalColumnasTabla} className="p-6 text-center text-gray-500">Cargando...</td></tr>}
              {!loading && empleadosFiltrados.map((empleado) => {
                const estaActivo = empleado.activo ?? true;
                return (
                  <tr key={empleado.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-3 font-mono">{empleado.numero_empleado || "S/N"}</td>
                    <td className="p-3 font-semibold text-gray-800">{empleado.nombre_completo || "Sin nombre"}</td>
                    <td className="p-3">{empleado.departamentos?.nombre || "N/A"}</td>
                    <td className="p-3">{empleado.puestos?.nombre || "Sin asignar"}</td>
                    {columnasActivas.map((columna) => (
                      <td key={`${empleado.id}-${columna}`} className={`p-3 ${esColumnaMoneda(columna) ? "text-right bg-emerald-50/20 font-medium" : "text-center text-gray-700"}`}>
                        {columna === "activo" ? (
                          estaActivo ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Activo</span> : <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">Baja</span>
                        ) : formatearValorCelda(empleado[columna], columna)}
                      </td>
                    ))}
                    <td className="p-3 text-center">
                      {estaActivo ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Activo</span> : <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">Baja</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button type="button" onClick={() => setModalEdicionRapida({ abierto: true, datos: { id: empleado.id, nombre_completo: empleado.nombre_completo, departamento_id: empleado.departamento_id || "", puesto_id: empleado.puesto_id || "", activo: estaActivo, sueldo_base: valorNumerico(empleado.sueldo_base) || 0, supervisor_id: empleado.supervisor_id || "", fecha_baja: empleado.fecha_baja || "" } })} className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg font-semibold text-xs">✏️ Editar</button>
                        <Link to={`/empleados/detalle/${empleado.id}`} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg font-semibold text-xs">Ver</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && empleadosFiltrados.length === 0 && <tr><td colSpan={totalColumnasTabla} className="p-6 text-center text-gray-500">No se encontraron empleados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🔥 MODAL MEJORADO CON REORDENAMIENTO */}
      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">⚙️ Configurar columnas visibles y orden</h3>
                <p className="text-xs text-gray-500 mt-1">Activa/desactiva columnas y usa las flechas para reordenarlas</p>
              </div>
              <button type="button" onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3 rounded-xl">
              <span className="text-xs text-slate-600 font-medium">
                Mostrando <strong>{columnasActivas.length}</strong> de <strong>{columnasDisponibles.length}</strong> columnas
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={restablecerOrdenColumnas} className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-2 rounded-lg text-xs font-semibold">
                  🔄 Orden original
                </button>
                <button type="button" onClick={restablecerPreferenciasColumnas} className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs font-semibold">
                  ✓ Todas visibles
                </button>
              </div>
            </div>

            {columnasDelMapeo.length > 0 ? (
              <div className="space-y-4">
                {Object.keys(columnasPorTabla).map(tabla => {
                  const columnasTabla = columnasDelMapeo.filter(c => c.tabla === tabla);
                  if (columnasTabla.length === 0) return null;
                  
                  return (
                    <div key={tabla} className="border border-slate-200 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-slate-700 mb-3 capitalize flex items-center gap-2">
                        {tabla === 'empleados' && '👥'}
                        {tabla === 'incidencias' && '⚡'}
                        {tabla === 'vacaciones' && '🌴'}
                        {tabla === 'prestamos' && '💳'}
                        {tabla} ({columnasTabla.length} columnas)
                      </h4>
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {columnasTabla.map((colInfo, index) => {
                          const posicionEnOrden = ordenColumnas.indexOf(colInfo.campo);
                          const puedeSubir = posicionEnOrden > 0;
                          const puedeBajar = posicionEnOrden < ordenColumnas.length - 1;
                          
                          return (
                            <div key={colInfo.campo} className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition">
                              <input
                                type="checkbox"
                                checked={columnasVisibles[colInfo.campo] || false}
                                onChange={() => cambiarVisibilidadColumna(colInfo.campo)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <div className="font-semibold text-slate-700 text-sm">{colInfo.etiqueta}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">📄 Excel: <span className="font-mono">{colInfo.original}</span></div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => moverColumna(colInfo.campo, 'arriba')}
                                  disabled={!puedeSubir}
                                  className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold transition"
                                  title="Mover arriba"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moverColumna(colInfo.campo, 'abajo')}
                                  disabled={!puedeBajar}
                                  className="bg-blue-100 hover:bg-blue-200 disabled:bg-slate-200 disabled:cursor-not-allowed text-blue-700 disabled:text-slate-400 px-2 py-1 rounded text-xs font-bold transition"
                                  title="Mover abajo"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p>⚠️ No se encontraron columnas válidas.</p>
              </div>
            )}

            <div className="pt-3 border-t flex justify-end">
              <button type="button" onClick={() => setModalConfigColumnas(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Aplicar cambios</button>
            </div>
          </div>
        </div>
      )}

      {modalRelacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">🔗 Relación completa de campos</h2>
                <p className="text-xs text-gray-500 mt-0.5">Cruces configurados desde Configuración de Tablas.</p>
              </div>
              <button type="button" onClick={() => setModalRelacion(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm">✕ Cerrar</button>
            </div>
            {configuracionMapeo?.asignacion ? (
              <div className="space-y-4">
                <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-medium">
                  ✅ Mapeo activo. Total: <strong>{Object.keys(configuracionMapeo.asignacion).length}</strong> columnas
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                      <tr>
                        <th className="p-3 border-b">Columna Excel</th>
                        <th className="p-3 border-b">Tabla Destino</th>
                        <th className="p-3 border-b">Campo Mapeado</th>
                        <th className="p-3 border-b">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(configuracionMapeo.asignacion).map(([colOrig, info]) => {
                        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
                        const tablaExiste = esquemaReal[info.tablaDestino];
                        const campoExiste = tablaExiste && campoFinal && tablaExiste.includes(campoFinal);
                        
                        return (
                          <tr key={colOrig} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-800">{colOrig}</td>
                            <td className="p-3">
                              {info.tablaDestino ? <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">{info.tablaDestino}</span> : <span className="text-gray-400 italic">Omitida</span>}
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {info.esManual ? <span className="text-blue-700 font-bold">✏️ {info.campoManual}</span> : (campoFinal || <span className="text-gray-400 italic">Sin definir</span>)}
                            </td>
                            <td className="p-3">
                              {!info.tablaDestino ? (
                                <span className="text-gray-400 text-xs">⊘ Ignorada</span>
                              ) : TABLAS_CATALOGO.includes(info.tablaDestino) ? (
                                <span className="text-amber-600 text-xs">📚 Catálogo</span>
                              ) : !tablaExiste ? (
                                <span className="text-red-600 text-xs">❌ Tabla no existe</span>
                              ) : !campoExiste ? (
                                <span className="text-red-600 text-xs">❌ Campo no existe</span>
                              ) : (
                                <span className="text-emerald-600 text-xs">✓ Válida</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500">
                <p className="text-sm">⚠️ No se encontró una relación previa establecida.</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t flex justify-end">
              <button type="button" onClick={() => setModalRelacion(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarEdicionRapida} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="border-b pb-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">✏️ Editar empleado</h3>
              <button type="button" onClick={() => setModalEdicionRapida({ abierto: false, datos: null })} className="text-gray-400 font-bold">✕</button>
            </div>
            <p className="text-xs text-gray-500">Colaborador: <strong className="text-gray-800">{modalEdicionRapida.datos?.nombre_completo || "S/D"}</strong></p>
            <div className="space-y-4 text-xs md:text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Departamento</label>
                <select value={modalEdicionRapida.datos?.departamento_id || ""} onChange={(e) => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, departamento_id: e.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="">-- Seleccionar --</option>
                  {departamentosLista.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Puesto</label>
                <select value={modalEdicionRapida.datos?.puesto_id || ""} onChange={(e) => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, puesto_id: e.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="">-- Seleccionar --</option>
                  {puestosLista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              {esPuestoSupervisor(modalEdicionRapida.datos?.puesto_id) && (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <label className="block font-bold text-blue-900 mb-1">👥 Supervisor</label>
                  <select value={modalEdicionRapida.datos?.supervisor_id || ""} onChange={(e) => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, supervisor_id: e.target.value } }))} className="w-full border p-2 rounded-lg bg-white text-xs">
                    <option value="">-- Sin supervisor --</option>
                    {empleados.filter((emp) => emp.id !== modalEdicionRapida.datos?.id).map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.nombre_completo} ({emp.puestos?.nombre || "Sin puesto"})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Estatus</label>
                <select value={modalEdicionRapida.datos?.activo ? "ACTIVO" : "INACTIVO"} onChange={(e) => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, activo: e.target.value === "ACTIVO" } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Baja / Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Sueldo base semanal</label>
                <input type="number" step="0.01" min="0" value={modalEdicionRapida.datos?.sueldo_base ?? 0} onChange={(e) => setModalEdicionRapida(prev => ({ ...prev, datos: { ...prev.datos, sueldo_base: e.target.value } }))} className="w-full border p-2.5 rounded-lg font-bold text-green-700 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t">
              <button type="button" onClick={() => setModalEdicionRapida({ abierto: false, datos: null })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold">Cancelar</button>
              <button type="submit" disabled={guardando} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300">{guardando ? "Guardando..." : "Guardar cambios"}</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}