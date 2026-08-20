import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../services/supabase";
import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

// 🔥 MENSAJE PROFESIONAL (no revela información interna del sistema)
const MENSAJE_SIN_PERFIL = 
  "No hemos podido asociar tu cuenta con un perfil activo.\n\n" +
  "Esto puede deberse a que tu registro aún está en proceso de validación.\n\n" +
  "Por favor, contacta a soporte técnico indicando tu correo electrónico registrado.";

export default function Dashboard() {
  const navigate = useNavigate();
  const [activos, setActivos] = useState(0);
  const [bajas, setBajas] = useState(0);
  const [departamentos, setDepartamentos] = useState(0);
  const [puestos, setPuestos] = useState(0);
  const [rolUsuario, setRolUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verificarAcceso();
  }, [navigate]);

  useEffect(() => {
    if (rolUsuario) {
      cargarIndicadores();
    }
  }, [rolUsuario]);

  const verificarAcceso = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const { data: perfil, error } = await supabase
        .from("profiles")
        .select("rol, nombre, activo")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !perfil) {
        console.warn("⚠️ No se encontró perfil para el usuario:", user.id);
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      if (perfil.activo === false) {
        alert(MENSAJE_SIN_PERFIL);
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      setRolUsuario(perfil.rol);

      // 🔒 Redirección automática para roles específicos
      if (perfil.rol === "SUPERVISOR" || perfil.rol === "VISOR") {
        navigate("/incidencias/supervisor", { replace: true });
        return; // Salir para no seguir cargando el dashboard de administrador
      }

    } catch (err) {
      console.error("Error verificando acceso:", err);
      navigate("/login", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const cargarIndicadores = async () => {
    try {
      const [resActivos, resBajas, resDepts, resPuestos] = await Promise.all([
        supabase.from("empleados").select("*", { count: "exact", head: true }).eq("activo", true),
        supabase.from("empleados").select("*", { count: "exact", head: true }).eq("activo", false),
        supabase.from("departamentos").select("*", { count: "exact", head: true }),
        supabase.from("puestos").select("*", { count: "exact", head: true })
      ]);

      setActivos(resActivos.count || 0);
      setBajas(resBajas.count || 0);
      setDepartamentos(resDepts.count || 0);
      setPuestos(resPuestos.count || 0);
    } catch (error) {
      console.error("Error cargando indicadores:", error);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true }); // 🔥 Forma correcta en React Router (evita recarga completa)
  };

  const Modulo = ({ titulo, descripcion, ruta, icono }) => (
    <Link to={ruta} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-100">
      <div className="text-4xl mb-3">{icono}</div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">{titulo}</h3>
      <p className="text-sm text-gray-500">{descripcion}</p>
    </Link>
  );

  if (loading || rolUsuario === null) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin text-6xl mb-4">⏳</div>
            <p className="text-slate-600 font-semibold">Verificando acceso...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-gray-500 mt-2">Bienvenido al Sistema RH y Nómina</p>
          <div className="mt-3">
            <span className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
              🔐 Rol: {rolUsuario}
            </span>
          </div>
        </div>

        <button
          onClick={cerrarSesion}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition font-semibold shadow-sm flex items-center gap-2"
        >
          🚪 Cerrar Sesión
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-6 mb-10">
        <KpiCard titulo="Activos" valor={activos} icono="👥" color="text-green-600" />
        <KpiCard titulo="Bajas" valor={bajas} icono="🚫" color="text-red-600" />
        <KpiCard titulo="Departamentos" valor={departamentos} icono="🏢" color="text-blue-600" />
        <KpiCard titulo="Puestos" valor={puestos} icono="💼" color="text-purple-600" />
      </div>

      <h2 className="text-2xl font-bold text-slate-800 mb-6">Módulos del Sistema</h2>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        <Modulo icono="👥" titulo="Empleados" descripcion="Altas, bajas y consultas." ruta="/empleados" />
        <Modulo icono="🏢" titulo="Departamentos" descripcion="Administración de departamentos." ruta="/departamentos" />
        <Modulo icono="💼" titulo="Puestos" descripcion="Administración de puestos." ruta="/puestos" />
        <Modulo icono="📅" titulo="Periodos" descripcion="Periodos de nómina." ruta="/periodos" />
       