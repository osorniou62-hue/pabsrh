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

  // Datos del empleado
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

  // Opción de crear cuenta de supervisor
  const [crearCuenta, setCrearCuenta] = useState(false);
  const [cuentaSupervisor, setCuentaSupervisor] = useState({
    correo: "",
    password: "",
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

    if (crearCuenta && (!cuentaSupervisor.correo || !cuentaSupervisor.password)) {
      alert("⚠️ Completa el correo y contraseña para la cuenta de supervisor");
      return;
    }

    setLoading(true);

    try {
      let empleadoId = null;

      // 🔥 PASO 1: Si se va a crear cuenta de supervisor, crear primero el usuario en Auth
      if (crearCuenta) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cuentaSupervisor.correo,
          password: cuentaSupervisor.password,
          options: {
            data: { nombre: datos.nombre_completo, rol: "SUPERVISOR" },
          },
        });

        if (authError) throw authError;
        empleadoId = authData.user?.id;

        if (!empleadoId) throw new Error("No se pudo obtener el ID del usuario");

        // Crear o actualizar el perfil
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: empleadoId,
          nombre: datos.nombre_completo,
          correo: cuentaSupervisor.correo,
          rol: "SUPERVISOR",
          activo: true,
        }, { onConflict: "id" });

        if (profileError) throw profileError;
      }

      // 🔥 PASO 2: Crear el empleado en la tabla empleados
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

      // Si creamos cuenta de supervisor, usar ese ID como ID del empleado
      if (empleadoId) {
        payloadEmpleado.id = empleadoId;
      }

      const { data: empleadoCreado, error: empleadoError } = await supabase
        .from("empleados")
        .insert([payloadEmpleado])
        .select()
        .single();

      if (empleadoError) throw empleadoError;

      // 🔥 ÉXITO
      if (crearCuenta) {
        alert(`✅ Empleado creado y cuenta de Supervisor generada.\n\nCorreo: ${cuentaSupervisor.correo}\n\nEl supervisor ya puede iniciar sesión.`);
        await supabase.auth.signOut(); // Cerrar sesión por seguridad
        navigate("/login");
      } else {
        alert("✅ Empleado creado exitosamente");
        navigate("/empleados");
      }

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
                <input type="text" value={datos.numero_empleado} onChange={(e) => handleChange("numero_empleado", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Nombre Completo *</label>
                <input type="text" value={datos.nombre_completo} onChange={(e) => handleChange("nombre_completo", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">CURP</label>
                <input type="text" value={datos.curp} onChange={(e) => handleChange("curp", e.target.value.toUpperCase())} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 uppercase" maxLength={18} placeholder="AAAA000000XXXXXXXX" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">RFC</label>
                <input type="text" value={datos.rfc} onChange={(e) => handleChange("rfc", e.target.value.toUpperCase())} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 uppercase" maxLength={13} placeholder="XXXX000000XXX" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">NSS (Seguro Social)</label>
                <input type="text" value={datos.nss} onChange={(e) => handleChange("nss", e.target.value.replace(/\D/g, ''))} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" maxLength={11} placeholder="00000000000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha de Ingreso</label>
                <input type="date" value={datos.fecha_ingreso} onChange={(e) => handleChange("fecha_ingreso", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
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
                <select value={datos.departamento_id} onChange={(e) => handleChange("departamento_id", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">-- Seleccionar departamento --</option>
                  {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Puesto</label>
                <select value={datos.puesto_id} onChange={(e) => handleChange("puesto_id", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">-- Seleccionar puesto --</option>
                  {puestos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Supervisor Asignado</label>
                <select value={datos.supervisor_id} onChange={(e) => handleChange("supervisor_id", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">-- Sin supervisor --</option>
                  {supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Sueldo Base Semanal ($)</label>
                <input type="number" step="0.01" min="0" value={datos.sueldo_base} onChange={(e) => handleChange("sueldo_base", e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-green-700" placeholder="0.00" />
              </div>
              <div className="md:col-span-2 flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={datos.activo} onChange={(e) => handleChange("activo", e.target.checked)} className="w-5 h-5 text-blue-600 rounded" />
                  <span className="text-sm font-semibold text-slate-700">Empleado Activo</span>
                </label>
              </div>
            </div>
          </div>

          {/* 🔥 CREAR CUENTA DE SUPERVISOR */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-sm border-2 border-blue-200 p-6">
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input type="checkbox" checked={crearCuenta} onChange={(e) => setCrearCuenta(e.target.checked)} className="w-5 h-5 text-blue-600 rounded mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-slate-800 flex items-center gap-2">👷 Crear también cuenta de Supervisor</div>
                <p className="text-xs text-slate-600 mt-1">Al activar esta opción, se generará un usuario y contraseña para que este empleado pueda acceder al Portal de Supervisores y capturar incidencias de su equipo.</p>
              </div>
            </label>

            {crearCuenta && (
              <div className="bg-white rounded-xl p-4 border border-blue-200 space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  💡 El empleado usará este correo y contraseña para iniciar sesión en el sistema.
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Correo Electrónico *</label>
                  <input type="email" value={cuentaSupervisor.correo} onChange={(e) => setCuentaSupervisor(prev => ({ ...prev, correo: e.target.value }))} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" placeholder="supervisor@empresa.com" required={crearCuenta} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Contraseña *</label>
                  <input type="password" value={cuentaSupervisor.password} onChange={(e) => setCuentaSupervisor(prev => ({ ...prev, password: e.target.value }))} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Mínimo 6 caracteres" minLength={6} required={crearCuenta} />
                </div>
              </div>
            )}
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => navigate("/empleados")} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-xl font-semibold transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md flex items-center gap-2">
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