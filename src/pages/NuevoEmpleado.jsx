import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";

export default function NuevoEmpleado() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [departamentos, setDepartamentos] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [supervisores, setSupervisores] = useState([]);

  // 🔥 Estado únicamente con los campos de la tabla 'empleados'
  const [datos, setDatos] = useState({
    numero_empleado: "",
    nombre_completo: "",
    curp: "",
    rfc: "",
    nss: "",
    departamento_id: "",
    puesto_id: "",
    supervisor_id: "",
    fecha_ingreso: "",
    sueldo_base: 0,
    activo: true,
  });

  useEffect(() => {
    cargarCatalogos();
  }, []);

  const cargarCatalogos = async () => {
    const [resDepts, resPuestos, resSupervisores] = await Promise.all([
      supabase.from("departamentos").select("*").order("nombre"),
      supabase.from("puestos").select("*").order("nombre"),
      supabase.from("empleados").select("id, nombre_completo, puestos(nombre)").eq("activo", true).order("nombre_completo"),
    ]);
    setDepartamentos(resDepts.data || []);
    setPuestos(resPuestos.data || []);
    setSupervisores(resSupervisores.data || []);
  };

  const handleChange = (campo, valor) => {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!datos.nombre_completo || !datos.numero_empleado) {
      alert("⚠️ Completa al menos el nombre y número de empleado");
      return;
    }

    setLoading(true);

    try {
      // 🔥 ÚNICA ACCIÓN: Insertar directamente en la tabla 'empleados'
      const payloadEmpleado = {
        numero_empleado: datos.numero_empleado,
        nombre_completo: datos.nombre_completo,
        curp: datos.curp || null,
        rfc: datos.rfc || null,
        nss: datos.nss || null,
        departamento_id: datos.departamento_id || null,
        puesto_id: datos.puesto_id || null,
        supervisor_id: datos.supervisor_id || null,
        fecha_ingreso: datos.fecha_ingreso || null,
        sueldo_base: Number(datos.sueldo_base) || 0,
        activo: datos.activo,
      };

      const { data: empleadoCreado, error: empleadoError } = await supabase
        .from("empleados")
        .insert([payloadEmpleado])
        .select()
        .single();

      if (empleadoError) throw empleadoError;

      alert("✅ Empleado creado exitosamente en el sistema.");
      navigate("/empleados");

    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al crear empleado: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-slate-800">➕ Nuevo Empleado</h1>
            <p className="text-gray-500 mt-2">Registra un nuevo colaborador en el sistema</p>
          </div>
          <button
            onClick={() => navigate("/empleados")}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl font-semibold text-sm transition"
          >
            ← Volver a la lista
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* DATOS PERSONALES Y FISCALES */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-2xl">👤</span> Datos Personales y Fiscales
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Número de Empleado *</label>
                <input 
                  type="text" 
                  value={datos.numero_empleado} 
                  onChange={(e) => handleChange("numero_empleado", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Nombre Completo *</label>
                <input 
                  type="text" 
                  value={datos.nombre_completo} 
                  onChange={(e) => handleChange("nombre_completo", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">CURP</label>
                <input 
                  type="text" 
                  value={datos.curp} 
                  onChange={(e) => handleChange("curp", e.target.value.toUpperCase())} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 uppercase" 
                  maxLength={18} 
                  placeholder="AAAA000000XXXXXXXX" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">RFC</label>
                <input 
                  type="text" 
                  value={datos.rfc} 
                  onChange={(e) => handleChange("rfc", e.target.value.toUpperCase())} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 uppercase" 
                  maxLength={13} 
                  placeholder="XXXX000000XXX" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">NSS (Seguro Social)</label>
                <input 
                  type="text" 
                  value={datos.nss} 
                  onChange={(e) => handleChange("nss", e.target.value.replace(/\D/g, ''))} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                  maxLength={11} 
                  placeholder="00000000000" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha de Ingreso</label>
                <input 
                  type="date" 
                  value={datos.fecha_ingreso} 
                  onChange={(e) => handleChange("fecha_ingreso", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
            </div>
          </div>

          {/* DATOS LABORALES */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-2xl">💼</span> Datos Laborales
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Departamento</label>
                <select 
                  value={datos.departamento_id} 
                  onChange={(e) => handleChange("departamento_id", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Seleccionar departamento --</option>
                  {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Puesto</label>
                <select 
                  value={datos.puesto_id} 
                  onChange={(e) => handleChange("puesto_id", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Seleccionar puesto --</option>
                  {puestos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Supervisor Asignado</label>
                <select 
                  value={datos.supervisor_id} 
                  onChange={(e) => handleChange("supervisor_id", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Sin supervisor --</option>
                  {supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Sueldo Base Semanal ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  value={datos.sueldo_base} 
                  onChange={(e) => handleChange("sueldo_base", e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-green-700" 
                  placeholder="0.00" 
                />
              </div>
              <div className="md:col-span-2 flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={datos.activo} 
                    onChange={(e) => handleChange("activo", e.target.checked)} 
                    className="w-5 h-5 text-blue-600 rounded" 
                  />
                  <span className="text-sm font-semibold text-slate-700">Empleado Activo</span>
                </label>
              </div>
            </div>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onClick={() => navigate("/empleados")} 
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-xl font-semibold transition"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md flex items-center gap-2"
            >
              {loading ? (
                <><span className="animate-spin">⏳</span> Guardando...</>
              ) : (
                <>💾 Guardar Empleado</>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}