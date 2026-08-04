import { supabase } from "./supabase";

export async function registrarHistorial(
  empleadoId,
  movimiento,
  observaciones = ""
) {

  await supabase
    .from("historial_empleado")
    .insert([
      {
        empleado_id: empleadoId,
        movimiento,
        observaciones,
      },
    ]);

}
