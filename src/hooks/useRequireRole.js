import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

/**
 * Hook para verificar roles de usuario y controlar acceso a rutas
 * 
 * @param {string|string[]} rolesPermitidos - Rol o array de roles permitidos
 * @param {string} rutaRedireccion - Ruta a la que se redirige si no tiene acceso (default: "/login")
 * @returns {object} - { usuario, perfil, cargando, tieneAcceso }
 * 
 * @example
 * // Solo administradores
 * const { usuario, perfil, cargando } = useRequireRole("ADMIN");
 * 
 * // Administradores y RH
 * const { usuario, perfil, cargando } = useRequireRole(["ADMIN", "RH"]);
 * 
 * // Solo supervisores (redirige a su portal)
 * const { usuario, perfil, cargando } = useRequireRole("SUPERVISOR", "/incidencias/supervisor");
 */
export default function useRequireRole(rolesPermitidos, rutaRedireccion = "/login") {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tieneAcceso, setTieneAcceso] = useState(false);

  useEffect(() => {
    const verificarAcceso = async () => {
      setCargando(true);
      try {
        // 1. Verificar sesión
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          navigate(rutaRedireccion, { replace: true });
          return;
        }

        setUsuario(user);

        // 2. Consultar perfil
        const { data: perfilData, error: perfilError } = await supabase
          .from("profiles")
          .select("id, nombre, rol, activo")
          .eq("id", user.id)
          .single();

        if (perfilError || !perfilData) {
          console.error("No se encontró perfil para el usuario");
          await supabase.auth.signOut();
          navigate("/login", { replace: true });
          return;
        }

        // 3. Verificar si está activo
        if (!perfilData.activo) {
          alert("⛔ Tu cuenta está inactiva. Contacta al administrador.");
          await supabase.auth.signOut();
          navigate("/login", { replace: true });
          return;
        }

        setPerfil(perfilData);

        // 4. Verificar rol
        const rolesArray = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
        
        if (!rolesArray.includes(perfilData.rol)) {
          console.warn(`Acceso denegado. Rol actual: ${perfilData.rol}. Roles permitidos: ${rolesArray.join(", ")}`);
          
          // Redirección inteligente según el rol
          if (perfilData.rol === "SUPERVISOR" || perfilData.rol === "VISOR") {
            navigate("/incidencias/supervisor", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
          return;
        }

        // ✅ Tiene acceso
        setTieneAcceso(true);

      } catch (error) {
        console.error("Error verificando acceso:", error);
        navigate("/login", { replace: true });
      } finally {
        setCargando(false);
      }
    };

    verificarAcceso();
  }, [navigate, rolesPermitidos, rutaRedireccion]);

  return { usuario, perfil, cargando, tieneAcceso };
}