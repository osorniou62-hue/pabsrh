import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

const COLUMNAS_FIJAS = [
  "numero_empleado",
  "nombre_completo",
  "departamento",
  "puesto",
];

const COLUMNAS_OCULTAS = [
  "id",
  "empleado_id",
  "departamento_id",
  "puesto_id",
  "supervisor_id",
  "created_at",
  "updated_at",
  "deleted_at",
  "departamentos",
  "puestos",
];

const COLUMNAS_MONEDA = [
  "sueldo", "salario", "bono", "apoyo", "gratificacion", "percepcion",
  "deduccion", "importe", "monto", "pago", "comision", "neto", "total"
];

const ETIQUETAS_COLUMNAS = {
  sueldo_base: "Sueldo Base",
  sueldo_diario: "Sueldo Diario",
  bono_puesto: "Bono Puesto",
  bono_puntualidad: "Bono Puntualidad",
  bono_asistencia: "Bono Asistencia",
  bono_multiplicador: "Bono Multiplicador",
  bono_desempeno: "Bono Desempeño",
  bono_extra: "Bono Extra",
  apoyo_medico: "Apoyo Médico",
  gratificacion_especial: "Gratificación Especial",
  total_bonos: "Total Bonos",
  fecha_alta: "Fecha de Alta",
  fecha_baja: "Fecha de Baja",
  activo: "Estatus",
};

const formatearNombreColumna = (texto) => {
  if (ETIQUETAS_COLUMNAS[texto]) return ETIQUETAS_COLUMNAS[texto];
  return String(texto || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
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
  return numero.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    return valor.map((elemento) => {
      if (typeof elemento === "object" && elemento !== null) {
        return elemento.nombre || elemento.label || JSON.stringify(elemento);
      }
      return String(elemento);
    }).join(", ");
  }
  if (typeof valor === "object") {
    return valor.nombre || valor.label || JSON.stringify(valor);
  }
  return String(valor);
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

  const [columnasDisponibles, setColumnasDisponibles] = useState([]);
  const [columnasVisibles, setColumnasVisibles] = useState(() => {
    try {
      const guardadas = localStorage.getItem("empleados_columnas_visibles_dinamicas");
      return guardadas ? JSON.parse(guardadas) : {};
    } catch (error) {
      console.error("Error leyendo preferencias de columnas:", error);
      return {};
    }
  });

  // 🔥 NUEVO: Extraer columnas directamente de la configuración de mapeo
  const columnasDelMapeo = useMemo(() => {
    if (!configuracionMapeo?.asignacion) return [];
    
    return Object.entries(configuracionMapeo.asignacion)
      .filter(([_, info]) => info.tablaDestino && (info.campoDestino || info.campoManual))
      .map(([colOriginal, info]) => {
        const campoFinal = info.esManual ? info.campoManual : info.campoDestino;
        return {
          original: colOriginal,
          tabla: info.tablaDestino,
          campo: campoFinal,
          etiqueta: formatearNombreColumna(campoFinal)
        };
      });
  }, [configuracionMapeo]);

  useEffect(() => {
    cargarCatalogos();
    cargarRelacionCamposConfiguracion();
  }, []);

  // 🔥 NUEVO: Cuando cambia el mapeo, actualizamos las columnas disponibles y cargamos los datos
  useEffect(() => {
    if (columnasDelMapeo.length > 0) {
      const nuevasColumnas = [...new Set(columnasDelMapeo.map(c => c.campo))];
      setColumnasDisponibles(nuevasColumnas);
      
      setColumnasVisibles(prev => {
        const nuevoEstado = { ...prev };
        nuevasColumnas.forEach(col => {
          if (nuevoEstado[col] === undefined) {
            nuevoEstado[col] = true; // Por defecto visibles
          }
        });
        return nuevoEstado;
      });

      // Recargar empleados ahora que sabemos qué columnas consultar
      cargarEmpleados();
    }
  }, [columnasDelMapeo]);

  useEffect(() => {
    try {
      localStorage.setItem("empleados_columnas_visibles_dinamicas", JSON.stringify(columnasVisibles));
    } catch (error) {
      console.error("Error guardando preferencias de columnas:", error);
    }
  }, [columnasVisibles]);

  const cargarCatalogos = async () => {
    try {
      const [resPuestos, resDepartamentos] = await Promise.all([
        supabase.from("puestos").select("id, nombre").order("nombre"),
        supabase.from("departamentos").select("id, nombre").order("nombre"),
      ]);
      if (resPuestos.error) throw resPuestos.error;
      if (resDepartamentos.error) throw resDepartamentos.error;
      setPuestosLista(resPuestos.data || []);
      setDepartamentosLista(resDepartamentos.data || []);
    } catch (error) {
      console.error("Error cargando catálogos:", error);
    }
  };

  // 🔥 MODIFICADO: Construye un select explícito con las columnas del mapeo
  const cargarEmpleados = async () => {
    setLoading(true);
    try {
      const columnasEsenciales = [
        "id", "numero_empleado", "nombre_completo", "departamento_id", 
        "puesto_id", "supervisor_id", "activo", "created_at", "updated_at"
      ];
      
      const columnasDinamicas = columnasDelMapeo.map(c => c.campo);
      const todasLasColumnas = [...new Set([...columnasEsenciales, ...columnasDinamicas])];
      const selectString = todasLasColumnas.join(",");

      console.log("🔍 Consultando columnas explícitas:", selectString);

      const { data: empleadosData, error: empleadosError } = await supabase
        .from("empleados")
        .select(selectString)
        .order("nombre_completo");

      if (empleadosError) throw empleadosError;

      const empleadosMapeados = (empleadosData || []).map((empleado) => ({
        ...empleado,
        departamentos: departamentosLista.find(d => d.id === empleado.departamento_id) || null,
        puestos: puestosLista.find(p => p.id === empleado.puesto_id) || null,
      }));

      setEmpleados(empleadosMapeados);
    } catch (error) {
      console.error("Error al cargar empleados:", error?.message || error);
      // Si hay error de columna no existente, avisamos al usuario
      if (error?.message?.includes("column")) {
        alert("⚠️ Una columna configurada en el mapeo no existe en la tabla 'empleados' de Supabase. Revisa tu configuración.");
      }
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
        return;
      }

      const configuracionLocal = localStorage.getItem("config_mapeo_columnas_dinamico");
      if (configuracionLocal) {
        setConfiguracionMapeo(JSON.parse(configuracionLocal));
      }
    } catch (error) {
      console.error("Error cargando configuración de mapeo:", error);
    }
  };

  const cambiarVisibilidadColumna = (columna) => {
    setColumnasVisibles((estadoAnterior) => ({
      ...estadoAnterior,
      [columna]: !estadoAnterior[columna],
    }));
  };

  const seleccionarTodasLasColumnas = () => {
    setColumnasVisibles(Object.fromEntries(columnasDisponibles.map((columna) => [columna, true])));
  };

  const ocultarTodasLasColumnas = () => {
    setColumnasVisibles(Object.fromEntries(columnasDisponibles.map((columna) => [columna, false])));
  };

  const guardarEdicionRapida = async (evento) => {
    evento.preventDefault();
    if (!modalEdicionRapida.datos) return;
    setGuardando(true);

    try {
      const datos = modalEdicionRapida.datos;
      const { error } = await supabase
        .from("empleados")
        .update({
          departamento_id: datos.departamento_id || null,
          puesto_id: datos.puesto_id || null,
          activo: Boolean(datos.activo),
          sueldo_base: Number(datos.sueldo_base) || 0,
          supervisor_id: datos.supervisor_id || null,
          fecha_baja: datos.activo ? null : (datos.fecha_baja || new Date().toISOString().split("T")[0]),
        })
        .eq("id", datos.id);

      if (error) throw error;

      setModalEdicionRapida({ abierto: false, datos: null });
      await cargarEmpleados();
    } catch (error) {
      alert(`Error al actualizar empleado: ${error?.message || "Error desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const esPuestoSupervisor = (puestoId) => {
    const puesto = puestosLista.find((elemento) => String(elemento.id) === String(puestoId));
    if (!puesto) return false;
    const nombre = String(puesto.nombre || "").toLowerCase();
    return ["supervisor", "jefe", "líder", "lider", "encargado"].some((palabra) => nombre.includes(palabra));
  };

  const departamentos = useMemo(() => {
    const nombres = empleados.map((empleado) => empleado?.departamentos?.nombre).filter(Boolean);
    return ["TODOS", ...new Set(nombres)].sort((a, b) => a.localeCompare(b, "es"));
  }, [empleados]);

  const empleadosFiltrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return empleados.filter((empleado) => {
      if (!empleado) return false;
      const coincideBusqueda =
        String(empleado.nombre_completo || "").toLowerCase().includes(texto) ||
        String(empleado.numero_empleado || "").toLowerCase().includes(texto) ||
        String(empleado.departamentos?.nombre || "").toLowerCase().includes(texto) ||
        String(empleado.puestos?.nombre || "").toLowerCase().includes(texto);

      const activo = Boolean(empleado.activo ?? true);
      const coincideEstatus = estatus === "TODOS" || (estatus === "ACTIVOS" && activo) || (estatus === "BAJAS" && !activo);
      const coincideDepartamento = departamentoFiltro === "TODOS" || empleado.departamentos?.nombre === departamentoFiltro;

      return coincideBusqueda && coincideEstatus && coincideDepartamento;
    });
  }, [empleados, busqueda, estatus, departamentoFiltro]);

  const total = empleados.length;
  const activos = empleados.filter((empleado) => empleado?.activo ?? true).length;
  const bajas = empleados.filter((empleado) => !(empleado?.activo ?? true)).length;
  const columnasActivas = columnasDisponibles.filter((columna) => columnasVisibles[columna]);
  const totalColumnasTabla = 4 + columnasActivas.length + 2;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">👥 Empleados</h1>
            <p className="text-gray-500 mt-2">
              Gestión de empleados y columnas dinámicas sincronizadas con la configuración de importación
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 mt-4 md:mt-0">
            <button
              type="button"
              onClick={() => setModalConfigColumnas(true)}
              className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm"
            >
              ⚙️ Columnas visibles ({columnasActivas.length})
            </button>

            <button
              type="button"
              onClick={() => setModalRelacion(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm"
            >
              🔗 Relación campos
            </button>

            <Link to="/empleados/importar" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm flex items-center gap-2 shadow-sm">
              📝 Editar empleados
            </Link>

            <Link to="/empleados/nuevo" className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition font-semibold text-sm shadow-sm">
              + Nuevo empleado
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <KpiCard titulo="Activos" valor={activos} icono="✅" color="text-green-600" />
          <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
          <KpiCard titulo="Total" valor={total} icono="👥" color="text-blue-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="🔍 Buscar nombre, número, departamento o puesto..."
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select value={estatus} onChange={(evento) => setEstatus(evento.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="ACTIVOS">Activos</option>
              <option value="BAJAS">Bajas</option>
              <option value="TODOS">Todos</option>
            </select>
            <select value={departamentoFiltro} onChange={(evento) => setDepartamentoFiltro(evento.target.value)} className="border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none">
              {departamentos.map((departamento) => (
                <option key={departamento} value={departamento}>{departamento}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 text-gray-600 font-medium flex flex-col gap-2 md:flex-row md:justify-between md:items-center">
          <span>Mostrando <strong>{empleadosFiltrados.length}</strong> empleados</span>
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
            Las columnas visibles se derivan de tu configuración de mapeo de Excel.
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 text-gray-700 font-bold border-b">
              <tr>
                <th className="p-3">No.</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Departamento</th>
                <th className="p-3">Puesto</th>
                {columnasDisponibles.map((columna) =>
                  columnasVisibles[columna] && (
                    <th key={columna} className={`p-3 text-center ${esColumnaMoneda(columna) ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-800"}`}>
                      {formatearNombreColumna(columna)}
                    </th>
                  )
                )}
                <th className="p-3 text-center">Estatus</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={totalColumnasTabla} className="p-6 text-center text-gray-500">Cargando lista de empleados...</td>
                </tr>
              )}
              {!loading && empleadosFiltrados.map((empleado) => {
                const estaActivo = empleado.activo ?? true;
                return (
                  <tr key={empleado.id} className="border-t hover:bg-slate-50 transition">
                    <td className="p-3 font-mono">{empleado.numero_empleado || "S/N"}</td>
                    <td className="p-3 font-semibold text-gray-800">{empleado.nombre_completo || "Sin nombre"}</td>
                    <td className="p-3">{empleado.departamentos?.nombre || "N/A"}</td>
                    <td className="p-3">{empleado.puestos?.nombre || "Sin asignar"}</td>
                    {columnasDisponibles.map((columna) =>
                      columnasVisibles[columna] && (
                        <td key={`${empleado.id}-${columna}`} className={`p-3 ${esColumnaMoneda(columna) ? "text-right bg-emerald-50/20 font-medium" : "text-center text-gray-700"}`}>
                          {columna === "activo" ? (
                            estaActivo ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Activo</span> : <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">Baja</span>
                          ) : (
                            formatearValorCelda(empleado[columna], columna)
                          )}
                        </td>
                      )
                    )}
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
              {!loading && empleadosFiltrados.length === 0 && (
                <tr><td colSpan={totalColumnasTabla} className="p-6 text-center text-gray-500">No se encontraron empleados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🔥 MODIFICADO: Modal de columnas ahora muestra el origen del Excel */}
      {modalConfigColumnas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">⚙️ Configurar columnas visibles</h3>
                <p className="text-xs text-gray-500 mt-1">Estas columnas se derivan directamente de tu configuración de mapeo de Excel.</p>
              </div>
              <button type="button" onClick={() => setModalConfigColumnas(false)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3">
              <span className="text-xs text-slate-500">{columnasActivas.length} de {columnasDisponibles.length} columnas dinámicas visibles</span>
              <div className="flex gap-2">
                <button type="button" onClick={seleccionarTodasLasColumnas} className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-2 rounded-lg text-xs font-semibold">Mostrar todas</button>
                <button type="button" onClick={ocultarTodasLasColumnas} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold">Ocultar todas</button>
              </div>
            </div>

            {columnasDelMapeo.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1 text-xs">
                {columnasDelMapeo.map((colInfo) => (
                  <label key={colInfo.campo} className="flex items-start gap-2.5 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer border border-slate-100 transition">
                    <input
                      type="checkbox"
                      checked={columnasVisibles[colInfo.campo] || false}
                      onChange={() => cambiarVisibilidadColumna(colInfo.campo)}
                      className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-slate-700">{colInfo.etiqueta}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        📄 Excel: <span className="font-mono text-slate-600">{colInfo.original}</span>
                      </div>
                      <div className="text-[10px] text-blue-600 mt-0.5 capitalize">
                        🗄️ Tabla: {colInfo.tabla}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">
                No se encontró configuración de mapeo. Ve a "Relación campos" o configura la importación primero.
              </div>
            )}

            <div className="pt-3 border-t flex justify-end">
              <button type="button" onClick={() => setModalConfigColumnas(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Aplicar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Relación (sin cambios mayores, solo asegura que lea la config) */}
      {modalRelacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">🔗 Relación completa de campos del Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">Cruces configurados desde Configuración de Tablas.</p>
              </div>
              <button type="button" onClick={() => setModalRelacion(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-sm transition-all">✕ Cerrar</button>
            </div>

            {configuracionMapeo?.asignacion ? (
              <div className="space-y-4">
                <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100 font-medium">
                  ✅ Mapeo activo. Total de columnas procesadas: <strong>{Object.keys(configuracionMapeo.asignacion).length}</strong>
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                      <tr>
                        <th className="p-3 border-b">Columna Excel original</th>
                        <th className="p-3 border-b">Tabla Supabase destino</th>
                        <th className="p-3 border-b">Campo mapeado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(configuracionMapeo.asignacion).map(([columnaOriginal, informacion]) => {
                        const campoFinal = informacion.esManual ? informacion.campoManual : informacion.campoDestino;
                        return (
                          <tr key={columnaOriginal} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-800">{columnaOriginal}</td>
                            <td className="p-3">
                              {informacion.tablaDestino ? (
                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold capitalize">{informacion.tablaDestino}</span>
                              ) : (
                                <span className="text-gray-400 italic">Omitida</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {informacion.esManual ? (
                                <span className="text-blue-700 font-bold">✏️ Manual: {informacion.campoManual}</span>
                              ) : (
                                campoFinal || <span className="text-gray-400 italic">Sin definir</span>
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
                <p className="text-xs mt-1">Visita primero Configuración de Tablas para guardar el mapeo.</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t flex justify-end">
              <button type="button" onClick={() => setModalRelacion(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all">Cerrar ventana</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición Rápida (se mantiene igual que tu original) */}
      {modalEdicionRapida.abierto && modalEdicionRapida.datos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarEdicionRapida} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="border-b pb-3 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">✏️ Editar empleado y atributos</h3>
              <button type="button" onClick={() => setModalEdicionRapida({ abierto: false, datos: null })} className="text-gray-400 font-bold">✕</button>
            </div>
            <p className="text-xs text-gray-500">Colaborador: <strong className="text-gray-800">{modalEdicionRapida.datos?.nombre_completo || "S/D"}</strong></p>
            <div className="space-y-4 text-xs md:text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Departamento</label>
                <select value={modalEdicionRapida.datos?.departamento_id || ""} onChange={(evento) => setModalEdicionRapida((estadoAnterior) => ({ ...estadoAnterior, datos: { ...estadoAnterior.datos, departamento_id: evento.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="">-- Seleccionar departamento --</option>
                  {departamentosLista.map((departamento) => (<option key={departamento.id} value={departamento.id}>{departamento.nombre}</option>))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Puesto</label>
                <select value={modalEdicionRapida.datos?.puesto_id || ""} onChange={(evento) => setModalEdicionRapida((estadoAnterior) => ({ ...estadoAnterior, datos: { ...estadoAnterior.datos, puesto_id: evento.target.value } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="">-- Seleccionar puesto --</option>
                  {puestosLista.map((puesto) => (<option key={puesto.id} value={puesto.id}>{puesto.nombre}</option>))}
                </select>
              </div>
              {esPuestoSupervisor(modalEdicionRapida.datos?.puesto_id) && (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <label className="block font-bold text-blue-900 mb-1">👥 Supervisor o responsable relacionado</label>
                  <select value={modalEdicionRapida.datos?.supervisor_id || ""} onChange={(evento) => setModalEdicionRapida((estadoAnterior) => ({ ...estadoAnterior, datos: { ...estadoAnterior.datos, supervisor_id: evento.target.value } }))} className="w-full border p-2 rounded-lg bg-white text-xs">
                    <option value="">-- Sin supervisor asociado --</option>
                    {empleados.filter((empleado) => empleado.id !== modalEdicionRapida.datos?.id).map((empleado) => (<option key={empleado.id} value={empleado.id}>{empleado.nombre_completo} ({empleado.puestos?.nombre || "Sin puesto"})</option>))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Estatus</label>
                <select value={modalEdicionRapida.datos?.activo ? "ACTIVO" : "INACTIVO"} onChange={(evento) => setModalEdicionRapida((estadoAnterior) => ({ ...estadoAnterior, datos: { ...estadoAnterior.datos, activo: evento.target.value === "ACTIVO" } }))} className="w-full border p-2.5 rounded-lg outline-none bg-white">
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Baja / Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Sueldo base semanal</label>
                <input type="number" step="0.01" min="0" value={modalEdicionRapida.datos?.sueldo_base ?? 0} onChange={(evento) => setModalEdicionRapida((estadoAnterior) => ({ ...estadoAnterior, datos: { ...estadoAnterior.datos, sueldo_base: evento.target.value } }))} className="w-full border p-2.5 rounded-lg font-bold text-green-700 outline-none" />
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