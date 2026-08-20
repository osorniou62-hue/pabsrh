import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Link } from "react-router-dom";

export default function Puestos() {
  const [puestos, setPuestos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [nombre, setNombre] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [limpiando, setLimpiando] = useState(false);

  // --- ESTADOS DE VALIDACIÓN Y DUPLICADOS ---
  const [modalDuplicado, setModalDuplicado] = useState({
    abierto: false,
    puestoExistente: null,
    nombreIngresado: "",
    departamentoDestino: "",
  });

  // Modal para Crear Departamento
  const [mostrarModalDepto, setMostrarModalDepto] = useState(false);
  const [nuevoDeptoNombre, setNuevoDeptoNombre] = useState("");

  // --- ESTADO PARA PUESTOS DESDE LA RELACIÓN DE CAMPOS ---
  const [mostrarModalConfigurados, setMostrarModalConfigurados] = useState(false);
  const [puestosConfiguradosLista, setPuestosConfiguradosLista] = useState([]);

  // --- NUEVO: ESTADOS PARA HERRAMIENTAS DE LIMPIEZA ---
  const [mostrarLimpiador, setMostrarLimpiador] = useState(false);
  const [duplicados, setDuplicados] = useState([]);

  // Modal para Perfil/Detalle del Puesto
  const [puestoSeleccionado, setPuestoSeleccionado] = useState(null);
  const [detallePerfil, setDetallePerfil] = useState({
    horarios: "",
    turnos: "",
    acciones: "",
    comentarios: "",
    totalEmpleados: 0,
  });

  useEffect(() => {
    cargarPuestos();
    cargarDepartamentos();
    cargarPuestosDesdeRelacionCampos();
  }, []);

  const cargarPuestos = async () => {
    const { data, error } = await supabase
      .from("puestos")
      .select(`
        *,
        departamentos:departamento_id (
          id,
          nombre
        ),
        empleados (count)
      `)
      .order("nombre");

    if (error) {
      console.error("Error al cargar puestos:", error.message);
      return;
    }

    setPuestos(data || []);
  };

  const cargarDepartamentos = async () => {
    const { data, error } = await supabase
      .from("departamentos")
      .select("*")
      .eq("activo", true)
      .order("nombre");

    if (error) {
      console.error("Error al cargar departamentos:", error.message);
      return;
    }

    setDepartamentos(data || []);
  };

  const cargarPuestosDesdeRelacionCampos = async () => {
    try {
      let listaExtraida = [];
      const { data: dataConfig, error } = await supabase.from("configuracion_tablas").select("*");

      if (!error && dataConfig && dataConfig.length > 0) {
        dataConfig.forEach((fila) => {
          Object.entries(fila).forEach(([key, value]) => {
            let objAnalizar = value;
            if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
              try { objAnalizar = JSON.parse(value); } catch (e) {}
            }

            const extraerMapeosColumnas = (elemento) => {
              if (!elemento || typeof elemento !== "object") return;
              Object.entries(elemento).forEach(([subKey, subVal]) => {
                if (subVal && typeof subVal === "object") {
                  const destino = String(subVal.campoDestino || subVal.destino || "").toLowerCase();
                  if (subVal.tablaDestino === "empleados" || subVal.tabla === "empleados" || destino.includes("puesto") || destino.includes("bono_puesto")) {
                    if (subKey.trim() !== "" && subKey !== subKey.toLowerCase()) {
                      listaExtraida.push({ puesto: String(subKey).trim(), departamento: subVal.campoDestino || subVal.tablaDestino || "Mapeo Activo" });
                    }
                  }
                  extraerMapeosColumnas(subVal);
                } else if (typeof subVal === "string" && subVal.trim() !== "") {
                  const valLower = subVal.toLowerCase();
                  if (valLower === "puesto" || valLower === "bono_puesto") {
                    if (subKey.trim() !== "" && subKey !== subKey.toLowerCase()) {
                      listaExtraida.push({ puesto: String(subKey).trim(), departamento: String(subVal).trim() });
                    }
                  }
                }
              });
            };
            extraerMapeosColumnas(objAnalizar);
          });
        });
      }

      const { data: empleadosData, error: errorEmp } = await supabase.from("empleados").select("puesto, departamento");
      if (!errorEmp && empleadosData && empleadosData.length > 0) {
        empleadosData.forEach((emp) => {
          if (emp.puesto) {
            listaExtraida.push({ puesto: String(emp.puesto).trim(), departamento: emp.departamento ? String(emp.departamento).trim() : "Sin Departamento" });
          }
        });
      }

      const mapaUnicos = new Map();
      listaExtraida.forEach((item) => {
        const nombreLimpio = item.puesto;
        const claveUnica = nombreLimpio.toLowerCase();
        if (nombreLimpio && nombreLimpio !== claveUnica && !["columnas", "configuracion", "ignorada"].includes(claveUnica)) {
          if (!mapaUnicos.has(claveUnica)) {
            mapaUnicos.set(claveUnica, { puesto: nombreLimpio, departamento: item.departamento });
          }
        }
      });

      setPuestosConfiguradosLista(Array.from(mapaUnicos.values()));
    } catch (e) {
      console.error("Error al cargar puestos desde relación de campos:", e);
    }
  };

  // --- 🔥 NUEVAS HERRAMIENTAS DE LIMPIEZA ---

  const analizarDuplicados = () => {
    const grupos = {};
    puestos.forEach(p => {
      // Normalizar nombre: minúsculas, sin espacios extra
      const nombreNorm = p.nombre.toLowerCase().trim().replace(/\s+/g, ' ');
      if (!grupos[nombreNorm]) grupos[nombreNorm] = [];
      grupos[nombreNorm].push(p);
    });
    
    // Filtrar solo los que tienen más de 1 registro (duplicados)
    const listaDuplicados = Object.entries(grupos)
      .filter(([_, lista]) => lista.length > 1)
      .map(([nombre, lista]) => ({ nombre, puestos: lista }));
      
    setDuplicados(listaDuplicados);
    setMostrarLimpiador(true);
  };

  const unificarGrupoPuestos = async (grupo, idMaestro) => {
    if (!window.confirm(`⚠️ ¿Unificar estos puestos?\n\nSe reasignarán todos los empleados al puesto seleccionado y se eliminarán los duplicados permanentemente.`)) {
      return;
    }

    setLimpiando(true);
    const idsAEliminar = grupo.puestos.filter(p => p.id !== idMaestro).map(p => p.id);

    if (idsAEliminar.length === 0) {
      setLimpiando(false);
      return;
    }

    // 1. Reasignar empleados al puesto maestro
    const { error: errUpdate } = await supabase
      .from("empleados")
      .update({ puesto_id: idMaestro })
      .in("puesto_id", idsAEliminar);

    if (errUpdate) {
      alert("Error al reasignar empleados: " + errUpdate.message);
      setLimpiando(false);
      return;
    }

    // 2. Eliminar los puestos duplicados
    const { error: errDelete } = await supabase
      .from("puestos")
      .delete()
      .in("id", idsAEliminar);

    if (errDelete) {
      alert("Error al eliminar puestos duplicados: " + errDelete.message);
      setLimpiando(false);
      return;
    }

    alert("✅ Puestos unificados y limpiados correctamente.");
    setMostrarLimpiador(false);
    await cargarPuestos();
    setLimpiando(false);
  };

  const purgarInactivosSinEmpleados = async () => {
    const inactivos = puestos.filter(p => !p.activo && (p.empleados?.[0]?.count || 0) === 0);
    
    if (inactivos.length === 0) {
      alert("ℹ️ No hay puestos inactivos sin empleados para eliminar.");
      return;
    }

    if (!window.confirm(`⚠️ ¿Estás seguro de eliminar permanentemente ${inactivos.length} puestos INACTIVOS que NO tienen empleados asignados?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    setLimpiando(true);
    const ids = inactivos.map(p => p.id);
    const { error } = await supabase.from("puestos").delete().in("id", ids);
    
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert(`✅ Se eliminaron ${ids.length} puestos inactivos sin empleados.`);
      await cargarPuestos();
    }
    setLimpiando(false);
  };

  // --- FIN HERRAMIENTAS DE LIMPIEZA ---

  const crearDepartamento = async () => {
    if (!nuevoDeptoNombre.trim()) {
      alert("Ingresa el nombre del departamento");
      return;
    }

    const { data, error } = await supabase
      .from("departamentos")
      .insert([{ nombre: nuevoDeptoNombre.trim(), activo: true }])
      .select();

    if (error) {
      alert("Error al crear departamento: " + error.message);
      return;
    }

    alert("Departamento creado exitosamente");
    setNuevoDeptoNombre("");
    setMostrarModalDepto(false);
    await cargarDepartamentos();

    if (data && data.length > 0) {
      setDepartamentoId(data[0].id);
    }
  };

  const guardarPuesto = async () => {
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio || !departamentoId) {
      alert("Completa todos los campos obligatorios");
      return;
    }

    const { data: puestoExistente, error: errBusqueda } = await supabase
      .from("puestos")
      .select("id, nombre, departamento_id, activo")
      .ilike("nombre", nombreLimpio)
      .maybeSingle();

    if (!errBusqueda && puestoExistente) {
      if (!editandoId || puestoExistente.id !== editandoId) {
        setModalDuplicado({
          abierto: true,
          puestoExistente: puestoExistente,
          nombreIngresado: nombreLimpio,
          departamentoDestino: departamentoId,
        });
        return;
      }
    }

    await ejecutarGuardadoEnBD(nombreLimpio, departamentoId, editandoId);
  };

  const ejecutarGuardadoEnBD = async (nombrePuesto, deptoId, idEdicion) => {
    if (idEdicion) {
      const { error } = await supabase
        .from("puestos")
        .update({ nombre: nombrePuesto, departamento_id: Number(deptoId) })
        .eq("id", idEdicion);

      if (error) {
        alert("Error al actualizar: " + error.message);
        return;
      }
      alert("Puesto actualizado correctamente");
    } else {
      const { error } = await supabase.from("puestos").insert([{ nombre: nombrePuesto, departamento_id: Number(deptoId), activo: true }]);

      if (error) {
        alert("Error al crear: " + error.message);
        return;
      }
      alert("Puesto creado correctamente");
    }

    cancelarEdicion();
    setModalDuplicado({ abierto: false, puestoExistente: null, nombreIngresado: "", departamentoDestino: "" });
    await cargarPuestos();
  };

  const fusionarPuestoExistente = async () => {
    const { puestoExistente } = modalDuplicado;
    if (!puestoExistente) return;

    const { error } = await supabase
      .from("puestos")
      .update({ departamento_id: Number(modalDuplicado.departamentoDestino), activo: true })
      .eq("id", puestoExistente.id);

    if (error) {
      alert("Error al fusionar puesto: " + error.message);
      return;
    }

    alert(`¡Puesto sincronizado correctamente! Se reutilizó "${puestoExistente.nombre}".`);
    setModalDuplicado({ abierto: false, puestoExistente: null, nombreIngresado: "", departamentoDestino: "" });
    cancelarEdicion();
    await cargarPuestos();
  };

  const editarPuesto = (puesto) => {
    setEditandoId(puesto.id);
    setNombre(puesto.nombre);
    setDepartamentoId(puesto.departamento_id || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicion = () => {
    setNombre("");
    setDepartamentoId("");
    setEditandoId(null);
  };

  const desactivarPuesto = async (id) => {
    const confirmar = window.confirm("¿Deseas desactivar este puesto?");
    if (!confirmar) return;

    const { error } = await supabase.from("puestos").update({ activo: false }).eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }
    await cargarPuestos();
  };

  const eliminarPuestoDefinitivo = async (puestoItem) => {
    if (puestoItem.activo) {
      alert("⚠️ No puedes eliminar un puesto activo. Primero debes desactivarlo.");
      return;
    }

    const confirmar = window.confirm(`¿Estás COMPLETAMENTE seguro de eliminar el puesto "${puestoItem.nombre}" de forma definitiva?`);
    if (!confirmar) return;

    const { error } = await supabase.from("puestos").delete().eq("id", puestoItem.id);

    if (error) {
      alert("Error al eliminar puesto: " + error.message);
      return;
    }

    alert("Puesto eliminado permanentemente del sistema.");
    await cargarPuestos();
  };

  const abrirPerfilPuesto = async (puestoItem) => {
    setPuestoSeleccionado(puestoItem);

    const { count, error: errCount } = await supabase
      .from("empleados")
      .select("*", { count: "exact", head: true })
      .eq("puesto_id", puestoItem.id)
      .eq("activo", true);

    setDetallePerfil({
      horarios: puestoItem.horarios || "",
      turnos: puestoItem.turnos || "",
      acciones: puestoItem.acciones || "",
      comentarios: puestoItem.comentarios || "",
      totalEmpleados: errCount ? 0 : count || 0,
    });
  };

  const guardarPerfilPuesto = async () => {
    if (!puestoSeleccionado) return;

    const { error } = await supabase
      .from("puestos")
      .update({
        horarios: detallePerfil.horarios,
        turnos: detallePerfil.turnos,
        acciones: detallePerfil.acciones,
        comentarios: detallePerfil.comentarios,
      })
      .eq("id", puestoSeleccionado.id);

    if (error) {
      alert("Error al guardar el perfil: " + error.message);
      return;
    }

    alert("Perfil de puesto actualizado correctamente");
    setPuestoSeleccionado(null);
    await cargarPuestos();
  };

  const puestosFiltrados = puestos.filter((puestoItem) => {
    if (!busqueda.trim()) return true;
    const termino = busqueda.trim().toLowerCase();

    const coincidePuesto = puestoItem.nombre ? puestoItem.nombre.toLowerCase().includes(termino) : false;
    const deptoNombre = Array.isArray(puestoItem.departamentos) ? puestoItem.departamentos[0]?.nombre : puestoItem.departamentos?.nombre;
    const coincideDepto = deptoNombre ? deptoNombre.toLowerCase().includes(termino) : false;

    return coincidePuesto || coincideDepto;
  });

  const puestoEnEdicion = puestos.find((p) => p.id === editandoId);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">💼 Puestos y Departamentos</h1>
          <p className="text-xs text-gray-500 mt-1">Gestión unificada sincronizada con configuración_tablas</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard" className="bg-slate-600 text-white px-4 py-2 rounded hover:bg-slate-700 font-medium text-sm">
            ← Regresar
          </Link>
        </div>
      </div>

      {/* 🔥 BARRA DE HERRAMIENTAS DE LIMPIEZA */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧹</span>
          <div>
            <h3 className="font-bold text-amber-900">Herramientas de Limpieza</h3>
            <p className="text-xs text-amber-700">Unifica duplicados y elimina puestos inservibles de forma segura.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={analizarDuplicados}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            🔗 Unificar Duplicados
          </button>
          <button
            onClick={purgarInactivosSinEmpleados}
            disabled={limpiando}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            🗑️ Purgar Inactivos (0 empleados)
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl p-4 mb-6 border border-slate-200">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
          <h2 className="text-xl font-bold text-slate-800">
            {editandoId ? `✏️ Editando Puesto #${editandoId}` : "➕ Nuevo Puesto"}
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                cargarPuestosDesdeRelacionCampos();
                setMostrarModalConfigurados(true);
              }}
              className="bg-slate-700 text-white px-3 py-1.5 rounded text-sm hover:bg-slate-800 font-semibold shadow-sm transition-all"
            >
              📋 Relación de Campos
            </button>
            <button
              onClick={() => setMostrarModalDepto(true)}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700 font-medium shadow-sm transition-all"
            >
              + Crear Departamento
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Nombre del puesto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
          <select
            value={departamentoId}
            onChange={(e) => setDepartamentoId(e.target.value)}
            className="border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          >
            <option value="">Selecciona departamento</option>
            {departamentos.map((departamento) => (
              <option key={departamento.id} value={departamento.id}>
                {departamento.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={guardarPuesto}
            className={`text-white rounded-lg px-4 py-2.5 font-semibold text-sm transition-all ${
              editandoId ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {editandoId ? "Actualizar" : "Guardar"}
          </button>
          {editandoId && (
            <button onClick={cancelarEdicion} className="bg-gray-400 text-white rounded-lg px-4 py-2.5 hover:bg-gray-500 font-medium text-sm">
              Cancelar
            </button>
          )}
        </div>

        {editandoId && puestoEnEdicion && (
          <div className="mt-4 pt-3 border-t flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-900">⚙️ Opciones extendidas:</span>
              <button
                onClick={() => abrirPerfilPuesto(puestoEnEdicion)}
                className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 font-medium shadow-sm transition-all"
              >
                👁️ Modificar Perfil (Horarios, Turnos, Funciones)
              </button>
            </div>
            <span className="text-xs text-blue-700 italic">Editando: <strong>{puestoEnEdicion.nombre}</strong></span>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-xl p-4 mb-6 border border-slate-200">
        <input
          type="text"
          placeholder="🔍 Buscar por puesto o por departamento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="bg-white shadow rounded-xl p-4 overflow-x-auto border border-slate-200">
        <table className="w-full border text-left text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border p-3 text-center">ID</th>
              <th className="border p-3">Puesto</th>
              <th className="border p-3">Departamento</th>
              <th className="border p-3 text-center">Empleados</th>
              <th className="border p-3 text-center">Estatus</th>
              <th className="border p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {puestosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center p-8 text-gray-500">
                  No se encontraron puestos ni departamentos coincidentes.
                </td>
              </tr>
            ) : (
              puestosFiltrados.map((puestoItem) => {
                const deptoNombre = Array.isArray(puestoItem.departamentos)
                  ? puestoItem.departamentos[0]?.nombre
                  : puestoItem.departamentos?.nombre;
                const totalEmp = puestoItem.empleados?.[0]?.count || 0;

                return (
                  <tr key={puestoItem.id} className="hover:bg-slate-50 transition">
                    <td className="border p-3 text-center text-gray-500 font-mono text-xs">{puestoItem.id}</td>
                    <td className="border p-3 font-medium text-slate-800">{puestoItem.nombre}</td>
                    <td className="border p-3">
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-semibold">
                        {deptoNombre || "Sin Departamento"}
                      </span>
                    </td>
                    <td className="border p-3 text-center font-bold text-slate-700">{totalEmp}</td>
                    <td className="border p-3 text-center">
                      {puestoItem.activo ? (
                        <span className="text-green-700 font-bold text-xs bg-green-50 px-2.5 py-1 rounded-full border border-green-200">✅ Activo</span>
                      ) : (
                        <span className="text-red-700 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-full border border-red-200">🚫 Inactivo</span>
                      )}
                    </td>
                    <td className="border p-3 text-center">
                      <div className="flex justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => abrirPerfilPuesto(puestoItem)}
                          className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600 font-medium transition"
                          title="Ver o editar perfil completo"
                        >
                          👁️ Perfil
                        </button>
                        <button
                          onClick={() => editarPuesto(puestoItem)}
                          className="bg-amber-500 text-white px-3 py-1.5 rounded text-xs hover:bg-amber-600 font-medium transition"
                          title="Editar puesto"
                        >
                          ✏️ Editar
                        </button>
                        {puestoItem.activo ? (
                          <button
                            onClick={() => desactivarPuesto(puestoItem.id)}
                            className="bg-red-500 text-white px-3 py-1.5 rounded text-xs hover:bg-red-600 font-medium transition"
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            onClick={() => eliminarPuestoDefinitivo(puestoItem)}
                            className="bg-slate-800 text-white px-3 py-1.5 rounded text-xs hover:bg-black font-bold shadow-sm transition"
                            title="Eliminar permanentemente puesto inactivo"
                          >
                            🗑️ Borrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 🔥 MODAL DE LIMPIEZA Y UNIFICACIÓN */}
      {mostrarLimpiador && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-amber-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">🔗 Unificar Puestos Duplicados</h3>
                <p className="text-xs text-gray-500">Selecciona el puesto "Maestro" que deseas conservar. Los empleados se reasignarán automáticamente.</p>
              </div>
              <button onClick={() => setMostrarLimpiador(false)} className="text-gray-400 hover:text-gray-700 font-bold text-xl">✕</button>
            </div>

            {duplicados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-semibold">¡Excelente! No se encontraron puestos duplicados.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {duplicados.map((grupo, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-bold">
                        {grupo.puestos.length} duplicados
                      </span>
                      "{grupo.nombre}"
                    </h4>
                    
                    <div className="space-y-2 mb-4">
                      {grupo.puestos.map((p) => {
                        const deptoNombre = Array.isArray(p.departamentos) ? p.departamentos[0]?.nombre : p.departamentos?.nombre;
                        const totalEmp = p.empleados?.[0]?.count || 0;
                        
                        return (
                          <label key={p.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-amber-400 transition">
                            <input
                              type="radio"
                              name={`grupo_${idx}`}
                              value={p.id}
                              defaultChecked={totalEmp > 0} // Marcar por defecto el que tiene empleados
                              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                            />
                            <div className="flex-1">
                              <div className="font-semibold text-sm text-slate-800">
                                ID: {p.id} {p.activo ? "✅" : "🚫"}
                              </div>
                              <div className="text-xs text-slate-500 flex gap-3 mt-1">
                                <span>🏢 {deptoNombre || "Sin Depto"}</span>
                                <span className="font-bold text-blue-600">👥 {totalEmp} empleados</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => {
                        const seleccionado = document.querySelector(`input[name="grupo_${idx}"]:checked`);
                        if (seleccionado) {
                          unificarGrupoPuestos(grupo, Number(seleccionado.value));
                        } else {
                          alert("Por favor, selecciona un puesto maestro para conservar.");
                        }
                      }}
                      disabled={limpiando}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white py-2 rounded-lg text-sm font-bold transition shadow-sm"
                    >
                      {limpiando ? "Procesando..." : "🔗 Unificar y Eliminar Duplicados"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-3 border-t flex justify-end">
              <button
                onClick={() => setMostrarLimpiador(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DUPLICADO AL CREAR */}
      {modalDuplicado.abierto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-amber-200">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Puesto ya existente</h3>
                <p className="text-xs text-amber-600 font-medium">Validación cruzada de catálogos</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Ya se encuentra registrado un puesto con el nombre <strong className="text-slate-800">"{modalDuplicado.nombreIngresado}"</strong> con el ID <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded font-bold">#{modalDuplicado.puestoExistente?.id}</span>.
            </p>
            <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-700 mb-5 border border-slate-200 space-y-1">
              <p>💡 <strong>¿Qué deseas hacer?</strong></p>
              <p>Puedes cancelar la creación o fusionar/vincular el registro actual con este puesto ya existente.</p>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setModalDuplicado({ abierto: false, puestoExistente: null, nombreIngresado: "", departamentoDestino: "" })}
                className="px-4 py-2.5 border rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={fusionarPuestoExistente}
                className="px-4 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm transition-all"
              >
                🔄 Fusionar / Usar Existente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR DEPARTAMENTO */}
      {mostrarModalDepto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl border border-slate-200">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Añadir Nuevo Departamento</h3>
            <input
              type="text"
              placeholder="Nombre del departamento"
              value={nuevoDeptoNombre}
              onChange={(e) => setNuevoDeptoNombre(e.target.value)}
              className="w-full border rounded-lg p-2.5 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setMostrarModalDepto(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-100 font-medium text-sm">
                Cancelar
              </button>
              <button onClick={crearDepartamento} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm">
                Guardar Departamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RELACIÓN DE CAMPOS */}
      {mostrarModalConfigurados && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 border-b mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">📋 Puestos por Relación de Campos</h3>
                <p className="text-xs text-gray-500">Listado sincronizado desde configuración_tablas (Sin Duplicados)</p>
              </div>
              <button onClick={() => setMostrarModalConfigurados(false)} className="text-gray-400 hover:text-gray-700 font-bold text-sm">✕</button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {puestosConfiguradosLista.length > 0 ? (
                puestosConfiguradosLista.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 hover:bg-slate-100 p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{item.puesto}</p>
                      <p className="text-gray-500 mt-0.5">Destino: <span className="text-blue-600 font-semibold">{item.departamento}</span></p>
                    </div>
                    <span className="bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold">Único</span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500 text-xs">⚠️ No se encontraron puestos en la relación de campos activa.</div>
              )}
            </div>
            <div className="mt-5 pt-3 border-t flex justify-end">
              <button onClick={() => setMostrarModalConfigurados(false)} className="bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-slate-900 transition-all">
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PERFIL DE PUESTO */}
      {puestoSeleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 my-8">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-800">{puestoSeleccionado.nombre}</h3>
                <p className="text-sm text-gray-500">
                  Departamento:{" "}
                  <span className="font-semibold text-blue-600">
                    {(Array.isArray(puestoSeleccionado.departamentos) ? puestoSeleccionado.departamentos[0]?.nombre : puestoSeleccionado.departamentos?.nombre) || "Sin Asignar"}
                  </span>
                </p>
              </div>
              <div className="bg-green-100 text-green-800 text-center px-4 py-2 rounded-lg border border-green-200">
                <span className="block text-2xl font-bold">{detallePerfil.totalEmpleados}</span>
                <span className="text-xs font-semibold uppercase">Empleados Registrados</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <label className="block text-sm font-semibold mb-1">Horarios:</label>
                <input
                  type="text"
                  placeholder="Ej. 08:00 AM - 05:00 PM"
                  value={detallePerfil.horarios}
                  onChange={(e) => setDetallePerfil({ ...detallePerfil, horarios: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Turnos:</label>
                <input
                  type="text"
                  placeholder="Ej. Matutino / Mixto"
                  value={detallePerfil.turnos}
                  onChange={(e) => setDetallePerfil({ ...detallePerfil, turnos: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="mb-4 text-sm">
              <label className="block text-sm font-semibold mb-1">Acciones / Responsabilidades:</label>
              <textarea
                rows="3"
                placeholder="Describe las tareas y funciones de este puesto..."
                value={detallePerfil.acciones}
                onChange={(e) => setDetallePerfil({ ...detallePerfil, acciones: e.target.value })}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              ></textarea>
            </div>

            <div className="mb-6 text-sm">
              <label className="block text-sm font-semibold mb-1">Comentarios / Observaciones:</label>
              <textarea
                rows="2"
                placeholder="Notas o requerimientos adicionales..."
                value={detallePerfil.comentarios}
                onChange={(e) => setDetallePerfil({ ...detallePerfil, comentarios: e.target.value })}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              ></textarea>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button onClick={() => setPuestoSeleccionado(null)} className="px-4 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-100 font-medium text-sm">
                Cerrar
              </button>
              <button onClick={guardarPerfilPuesto} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">
                Guardar Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}