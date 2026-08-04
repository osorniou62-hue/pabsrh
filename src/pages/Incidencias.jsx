import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Incidencias() {

  const [empleados, setEmpleados] =
    useState([]);

  const [periodos, setPeriodos] =
    useState([]);

  const [incidencias, setIncidencias] =
    useState([]);

  const [form, setForm] =
    useState({
      empleado_id: "",
      periodo_id: "",
      horas_extra: 0,
      faltas: 0,
      permisos: 0,
      vacaciones: 0,
      incapacidades: 0,
      observaciones: "",
    });

  useEffect(() => {

    cargarEmpleados();
    cargarPeriodos();
    cargarIncidencias();

  }, []);

  const cargarEmpleados =
    async () => {

      const { data } =
        await supabase
          .from("empleados")
          .select("*")
          .eq("activo", true)
          .order(
            "nombre_completo"
          );

      setEmpleados(data || []);

    };

  const cargarPeriodos =
    async () => {

      const { data } =
        await supabase
          .from("periodos_nomina")
          .select("*")
          .eq(
            "estatus",
            "ABIERTO"
          );

      setPeriodos(data || []);

    };

  const cargarIncidencias =
    async () => {

      const { data } =
        await supabase
          .from("incidencias")
          .select(`
            *,
            empleados (
              nombre_completo
            ),
            periodos_nomina (
              descripcion
            )
          `)
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      setIncidencias(data || []);

    };

  const actualizarCampo =
    (campo, valor) => {

      setForm({
        ...form,
        valor,
      });

    };

  const guardarIncidencia =
    async () => {

      const { error } =
        await supabase
          .from("incidencias")
          .insert([
            {
              ...form,
              empleado_id:
                Number(
                  form.empleado_id
                ),
              periodo_id:
                Number(
                  form.periodo_id
                ),
            }
          ]);

      if (error) {

        alert(error.message);
        return;

      }

      alert(
        "Incidencia guardada"
      );

      setForm({
        empleado_id: "",
        periodo_id: "",
        horas_extra: 0,
        faltas: 0,
        permisos: 0,
        vacaciones: 0,
        incapacidades: 0,
        observaciones: "",
      });

      cargarIncidencias();

    };

  return (

    <div className="max-w-7xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        📋 Incidencias
      </h1>

      <div className="bg-white p-6 rounded shadow mb-6">

        <div className="grid md:grid-cols-2 gap-4">

          <select
            value={form.empleado_id}
            onChange={(e) =>
              actualizarCampo(
                "empleado_id",
                e.target.value
              )
            }
            className="border p-2 rounded"
          >

            <option value="">
              Seleccionar empleado
            </option>

            {empleados.map(
              (empleado) => (

                <option
                  key={empleado.id}
                  value={empleado.id}
                >
                  {empleado.nombre_completo}
                </option>

              )
            )}

          </select>

          <select
            value={form.periodo_id}
            onChange={(e) =>
              actualizarCampo(
                "periodo_id",
                e.target.value
              )
            }
            className="border p-2 rounded"
          >

            <option value="">
              Seleccionar periodo
            </option>

            {periodos.map(
              (periodo) => (

                <option
                  key={periodo.id}
                  value={periodo.id}
                >
                  {periodo.descripcion}
                </option>

              )
            )}

          </select>

          <input
            type="number"
            placeholder="Horas Extra"
            value={form.horas_extra}
            onChange={(e) =>
              actualizarCampo(
                "horas_extra",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            placeholder="Faltas"
            value={form.faltas}
            onChange={(e) =>
              actualizarCampo(
                "faltas",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            placeholder="Permisos"
            value={form.permisos}
            onChange={(e) =>
              actualizarCampo(
                "permisos",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            placeholder="Vacaciones"
            value={form.vacaciones}
            onChange={(e) =>
              actualizarCampo(
                "vacaciones",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            placeholder="Incapacidades"
            value={form.incapacidades}
            onChange={(e) =>
              actualizarCampo(
                "incapacidades",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <textarea
            placeholder="Observaciones"
            value={form.observaciones}
            onChange={(e) =>
              actualizarCampo(
                "observaciones",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

        </div>

        <button
          onClick={guardarIncidencia}
          className="
            mt-4
            bg-green-600
            text-white
            px-4
            py-2
            rounded
          "
        >
          Guardar
        </button>

      </div>

    </div>

  );

}