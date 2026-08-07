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

  // Estados para Modal de Crear Departamento
  const [mostrarModalDepto, setMostrarModalDepto] = useState(false);
  const [nuevoDeptoNombre, setNuevoDeptoNombre] = useState("");

  // Estados para Modal de Detalle/Perfil de Puesto
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
  }, []);

  const cargarPuestos = async () => {
    const { data, error } = await supabase
      .from("puestos")
      .select(`
        *,
        departamentos (
          id,
          nombre
        ),
        empleados (count)
      `)
      .order("nombre");

    if (error) {
      console.error(error);
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
      console.error(error);
      return;
    }

    setDepartamentos(data || []);
  };

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
      alert(error.message);
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
    if (!nombre.trim() || !departamentoId) {
      alert("Completa todos los campos principales");
      return;
    }

    if (editandoId) {
      const { error } = await supabase
        .from("puestos")
        .update({
          nombre,
          departamento_id: Number(departamentoId),
        })
        .eq("id", editandoId);

      if (error) {
        alert(error.message);
        return;
      }
      alert("Puesto actualizado");
    } else {
      const { error } = await supabase.from("puestos").insert([
        {
          nombre,
          departamento_id: Number(departamentoId),
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }
      alert("Puesto creado");
    }

    setNombre("");
    setDepartamentoId("");
    setEditandoId(null);
    await cargarPuestos();
  };

  const editarPuesto = (puesto) => {
    setEditandoId(puesto.id);
    setNombre(puesto.nombre);
    setDepartamentoId(puesto.departamento_id);
  };

  const desactivarPuesto = async (id) => {
    const confirmar = window.confirm("¿Deseas desactivar este puesto?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("puestos")
      .update({ activo: false })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }
    await cargarPuestos();
  };

  // Abrir Modal de Perfil Extendido del Puesto
  const abrirPerfilPuesto = async (puesto) => {
    setPuestoSeleccionado(puesto);

    // Contar total de empleados registrados en este puesto
    const { count, error: errCount } = await supabase
      .from("empleados")
      .select("*", { count: "exact", head: true })
      .eq("puesto_id", puesto.id)
      .eq("activo", true);

    setDetallePerfil({
      horarios: puesto.horarios || "",
      turnos: puesto.turnos || "",
      acciones: puesto.acciones || "",
      comentarios: puesto.comentarios || "",
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

  // Filtro inteligente por Nombre de Puesto O Nombre de Departamento
  const puestosFiltrados = puestos.filter((puesto) => {
    const termino = busqueda.toLowerCase();
    const coincideNombre = puesto.nombre?.toLowerCase().includes(termino);
    const coincideDepto = puesto.departamentos?.nombre
      ?.toLowerCase()
      .includes(termino);
    return coincideNombre || coincideDepto;
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">💼 Puestos y Departamentos</h1>
        <Link
          to="/dashboard"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Regresar
        </Link>
      </div>

      {/* SECCIÓN CREAR / EDITAR PUESTO */}
      <div className="bg-white shadow rounded p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {editandoId ? "Editar Puesto" : "Nuevo Puesto"}
          </h2>
          <button
            onClick={() => setMostrarModalDepto(true)}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700"
          >
            + Crear Departamento
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Nombre del puesto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded p-2"
          />

          <select
            value={departamentoId}
            onChange={(e) => setDepartamentoId(e.target.value)}
            className="border rounded p-2"
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
            className="bg-green-600 text-white rounded px-4 py-2 font-semibold hover:bg-green-700"
          >
            {editandoId ? "Actualizar" : "Guardar"}
          </button>
        </div>
      </div>

      {/* BUSCADOR GENERAL */}
      <div className="bg-white shadow rounded p-4 mb-6">
        <input
          type="text"
          placeholder="🔍 Buscar por puesto o por departamento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* TABLA DE PUESTOS */}
      <div className="bg-white shadow rounded p-4 overflow-x-auto">
        <table className="w-full border text-left">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-center">ID</th>
              <th className="border p-2">Puesto</th>
              <th className="border p-2">Departamento</th>
              <th className="border p-2 text-center">Empleados</th>
              <th className="border p-2 text-center">Estatus</th>
              <th className="border p-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {puestosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center p-4 text-gray-500">
                  No se encontraron resultados
                </td>
              </tr>
            ) : (
              puestosFiltrados.map((puesto) => {
                const totalEmp = puesto.empleados?.[0]?.count || 0;
                return (
                  <tr key={puesto.id} className="hover:bg-gray-50">
                    <td className="border p-2 text-center">{puesto.id}</td>
                    <td className="border p-2 font-medium">{puesto.nombre}</td>
                    <td className="border p-2">
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-semibold">
                        {puesto.departamentos?.nombre || "Sin Asignar"}
                      </span>
                    </td>
                    <td className="border p-2 text-center font-semibold">
                      {totalEmp}
                    </td>
                    <td className="border p-2 text-center">
                      {puesto.activo ? "✅ Activo" : "🚫 Inactivo"}
                    </td>
                    <td className="border p-2 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => abrirPerfilPuesto(puesto)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                          title="Ver perfil completo"
                        >
                          👁️ Perfil
                        </button>
                        <button
                          onClick={() => editarPuesto(puesto)}
                          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                        >
                          Editar
                        </button>
                        {puesto.activo && (
                          <button
                            onClick={() => desactivarPuesto(puesto.id)}
                            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                          >
                            Desactivar
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

      {/* POP-UP / MODAL: CREAR DEPARTAMENTO */}
      {mostrarModalDepto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-4">Añadir Nuevo Departamento</h3>
            <input
              type="text"
              placeholder="Nombre del departamento"
              value={nuevoDeptoNombre}
              onChange={(e) => setNuevoDeptoNombre(e.target.value)}
              className="w-full border rounded p-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMostrarModalDepto(false)}
                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={crearDepartamento}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Guardar Departamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP / MODAL: PERFIL COMPLETO Y DETALLES DEL PUESTO */}
      {puestoSeleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-800">
                  {puestoSeleccionado.nombre}
                </h3>
                <p className="text-sm text-gray-500">
                  Departamento:{" "}
                  <span className="font-semibold text-blue-600">
                    {puestoSeleccionado.departamentos?.nombre || "Sin Asignar"}
                  </span>
                </p>
              </div>
              <div className="bg-green-100 text-green-800 text-center px-4 py-2 rounded-lg border border-green-200">
                <span className="block text-2xl font-bold">
                  {detallePerfil.totalEmpleados}
                </span>
                <span className="text-xs font-semibold uppercase">
                  Empleados Activos
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1">
                  Horarios:
                </label>
                <input
                  type="text"
                  placeholder="Ej. 08:00 AM - 05:00 PM"
                  value={detallePerfil.horarios}
                  onChange={(e) =>
                    setDetallePerfil({
                      ...detallePerfil,
                      horarios: e.target.value,
                    })
                  }
                  className="w-full border rounded p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">
                  Turnos:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Matutino / Mixto"
                  value={detallePerfil.turnos}
                  onChange={(e) =>
                    setDetallePerfil({
                      ...detallePerfil,
                      turnos: e.target.value,
                    })
                  }
                  className="w-full border rounded p-2"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">
                Acciones y Responsabilidades:
              </label>
              <textarea
                rows="3"
                placeholder="Describe las tareas y funciones del puesto..."
                value={detallePerfil.acciones}
                onChange={(e) =>
                  setDetallePerfil({
                    ...detallePerfil,
                    acciones: e.target.value,
                  })
                }
                className="w-full border rounded p-2"
              ></textarea>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-1">
                Comentarios / Observaciones:
              </label>
              <textarea
                rows="2"
                placeholder="Notas adicionales..."
                value={detallePerfil.comentarios}
                onChange={(e) =>
                  setDetallePerfil({
                    ...detallePerfil,
                    comentarios: e.target.value,
                  })
                }
                className="w-full border rounded p-2"
              ></textarea>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                onClick={() => setPuestoSeleccionado(null)}
                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-100"
              >
                Cerrar
              </button>
              <button
                onClick={guardarPerfilPuesto}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
              >
                Guardar Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}