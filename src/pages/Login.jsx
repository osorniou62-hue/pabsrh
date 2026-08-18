import { useState } from "react";
import { supabase } from "../services/supabase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [registro, setRegistro] = useState({
    nombre: "",
    correo: "",
    telefono: "",
    password: "",
  });

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. Autenticar con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password,
    });

    if (error) {
      setLoading(false);
      alert("Credenciales incorrectas: " + error.message);
      return;
    }

    const usuario = data?.user;
    if (!usuario) {
      setLoading(false);
      alert("No fue posible iniciar sesión");
      return;
    }

    // 2. Buscar el perfil del usuario en la base de datos
    // ⚠️ IMPORTANTE: Si tu tabla de usuarios se llama "empleados" en lugar de "profiles", 
    // cambia "profiles" por "empleados" en la siguiente línea.
    const { data: perfil, error: perfilError } = await supabase
      .from("profiles") 
      .select("*")
      .eq("id", usuario.id)
      .single();

    if (perfilError || !perfil) {
      setLoading(false);
      alert("No se encontró un perfil asociado a este correo. Contacta al administrador.");
      await supabase.auth.signOut();
      return;
    }

    // 3. Verificar que el usuario esté activo
    if (!perfil.activo) {
      setLoading(false);
      alert("Tu cuenta está inactiva o pendiente de aprobación.");
      await supabase.auth.signOut();
      return;
    }

    // 4. 🔥 REDIRECCIÓN INTELIGENTE SEGÚN EL ROL 🔥
    if (perfil.rol === "supervisor") {
      // Si es supervisor, va directo a su portal simplificado
      navigate("/incidencias/supervisor");
    } else {
      // Si es admin, rh, o cualquier otro rol, va al dashboard principal
      navigate("/dashboard");
    }
    
    setLoading(false);
  };

  const solicitarRegistro = async () => {
    if (!registro.nombre || !registro.correo || !registro.password) {
      alert("Completa al menos el nombre, correo y contraseña.");
      return;
    }

    const { error } = await supabase.from("solicitudes_usuario").insert([
      {
        nombre: registro.nombre,
        correo: registro.correo,
        telefono: registro.telefono,
        password: registro.password,
        estatus: "PENDIENTE",
      },
    ]);

    if (error) {
      alert("Error al enviar: " + error.message);
      return;
    }

    alert("✅ Solicitud enviada. Un administrador deberá aprobarla.");
    setRegistro({ nombre: "", correo: "", telefono: "", password: "" });
    setMostrarRegistro(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            👥
          </div>
          <h1 className="text-2xl font-black text-slate-800">Sistema de Nómina</h1>
          <p className="text-slate-500 mt-2 text-sm">Ingresa tus credenciales para continuar</p>
        </div>

        <form onSubmit={iniciarSesion} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Correo Electrónico</label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="correo@empresa.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition shadow-md disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span> Ingresando...
              </>
            ) : (
              "Iniciar Sesión"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setMostrarRegistro(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-semibold hover:underline"
          >
            ¿No tienes cuenta? Solicitar acceso de Supervisor
          </button>
        </div>
      </div>

      {/* Modal de Solicitud de Registro */}
      {mostrarRegistro && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h2 className="text-xl font-bold mb-1 text-slate-800">Solicitud de Acceso</h2>
            <p className="text-sm text-slate-500 mb-5">Un administrador revisará y aprobará tu cuenta.</p>
            
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre completo"
                value={registro.nombre}
                onChange={(e) => setRegistro({ ...registro, nombre: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={registro.correo}
                onChange={(e) => setRegistro({ ...registro, correo: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Teléfono (Opcional)"
                value={registro.telefono}
                onChange={(e) => setRegistro({ ...registro, telefono: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                placeholder="Crea una contraseña"
                value={registro.password}
                onChange={(e) => setRegistro({ ...registro, password: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={solicitarRegistro}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold transition"
              >
                Enviar Solicitud
              </button>
              <button
                onClick={() => setMostrarRegistro(false)}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}