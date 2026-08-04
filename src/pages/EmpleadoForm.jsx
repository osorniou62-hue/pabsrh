import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useNavigate, useParams } from "react-router-dom";

export default function EmpleadoForm() {

  const navigate = useNavigate();
  const { id } = useParams();

  const editando = Boolean(id);

  const [departamentos, setDepartamentos] = useState([]);
  const [puestos, setPuestos] = useState([]);

  const [form, setForm] = useState({
    numero_empleado: "",
    nombre_completo: "",
    curp: "",
    rfc: "",
    nss: "",
    sueldo_base: 0,
    fecha_ingreso: "",
    departamento_id: "",
    puesto_id: "",
    activo: true,
  });

  useEffect(() => {

    cargarDepartamentos();
    cargarPuestos();

    if (editando) {
      cargarEmpleado();
    }

  }, []);

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

  const cargarPuestos = async () => {

    const { data, error } = await supabase
      .from("puestos")
      .select("*")
      .eq("activo", true)
      .order("nombre");

    if (error) {
      console.error(error);
      return;
    }

    setPuestos(data || []);

  };

  const cargarEmpleado = async () => {

    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setForm(data);

  };

  const guardarEmpleado = async (e) => {

    e.preventDefault();

    if (editando) {

      const { error } = await supabase
        .from("empleados")
        .update({
          numero_empleado: form.numero_empleado,
          nombre_completo: form.nombre_completo,
          curp: form.curp,
          rfc: form.rfc,
          nss: form.nss,
          sueldo_base: Number(form.sueldo_base),
          fecha_ingreso: form.fecha_ingreso,
          departamento_id: Number(form.departamento_id),
          puesto_id: Number(form.puesto_id),
        })
        .eq("id", id);

      if (error) {

        alert(error.message);
        return;

      }

      await supabase
        .from("historial_empleado")
        .insert([
          {
            empleado_id: Number(id),
            movimiento: "Actualización de datos",
          },
        ]);

      alert("Empleado actualizado");

    } else {

      const { data, error } = await supabase
        .from("empleados")
        .insert([
          {
            numero_empleado: form.numero_empleado,
            nombre_completo: form.nombre_completo,
            curp: form.curp,
            rfc: form.rfc,
            nss: form.nss,
            sueldo_base: Number(form.sueldo_base),
            fecha_ingreso: form.fecha_ingreso,
            departamento_id: Number(form.departamento_id),
            puesto_id: Number(form.puesto_id),
            activo: true,
          },
        ])
        .select()
        .single();

      if (error) {

        alert(error.message);
        return;

      }

      await supabase
        .from("historial_empleado")
        .insert([
          {
            empleado_id: data.id,
            movimiento: "Alta de empleado",
          },
        ]);

      alert("Empleado creado");

    }

    navigate("/empleados");

  };

  const actualizarCampo = (campo, valor) => {

    setForm((prev) => ({
      ...prev,
      valor,
    }));

  };

  return (

    <div className="max-w-4xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">

        {editando
          ? "Editar Empleado"
          : "Nuevo Empleado"}

      </h1>

      <form
        onSubmit={guardarEmpleado}
        className="bg-white shadow rounded p-6"
      >

        <div className="grid md:grid-cols-2 gap-4">

          <input
            type="text"
            placeholder="Número empleado"
            value={form.numero_empleado}
            onChange={(e) =>
              actualizarCampo(
                "numero_empleado",
                e.target.value
              )
            }
            className="border p-2 rounded"
            required
          />

          <input
            type="text"
            placeholder="Nombre completo"
            value={form.nombre_completo}
            onChange={(e) =>
              actualizarCampo(
                "nombre_completo",
                e.target.value
              )
            }
            className="border p-2 rounded"
            required
          />

          <input
            type="text"
            placeholder="CURP"
            value={form.curp}
            onChange={(e) =>
              actualizarCampo(
                "curp",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="text"
            placeholder="RFC"
            value={form.rfc}
            onChange={(e) =>
              actualizarCampo(
                "rfc",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="text"
            placeholder="NSS"
            value={form.nss}
            onChange={(e) =>
              actualizarCampo(
                "nss",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            step="0.01"
            placeholder="Sueldo Base"
            value={form.sueldo_base}
            onChange={(e) =>
              actualizarCampo(
                "sueldo_base",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={form.fecha_ingreso}
            onChange={(e) =>
              actualizarCampo(
                "fecha_ingreso",
                e.target.value
              )
            }
            className="border p-2 rounded"
          />

          <select
            value={form.departamento_id}
            onChange={(e) =>
              actualizarCampo(
                "departamento_id",
                e.target.value
              )
            }
            className="border p-2 rounded"
            required
          >
            <option value="">
              Seleccionar departamento
            </option>

            {departamentos.map((departamento) => (

              <option
                key={departamento.id}
                value={departamento.id}
              >
                {departamento.nombre}
              </option>

            ))}

          </select>

          <select
            value={form.puesto_id}
            onChange={(e) =>
              actualizarCampo(
                "puesto_id",
                e.target.value
              )
            }
            className="border p-2 rounded"
            required
          >
            <option value="">
              Seleccionar puesto
            </option>

            {puestos
              .filter(
                (puesto) =>
                  puesto.departamento_id ==
                  form.departamento_id
              )
              .map((puesto) => (

                <option
                  key={puesto.id}
                  value={puesto.id}
                >
                  {puesto.nombre}
                </option>

              ))}

          </select>

        </div>

        <div className="flex gap-3 mt-6">

          <button
            type="submit"
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            {editando
              ? "Actualizar"
              : "Guardar"}
          </button>

          <button
            type="button"
            onClick={() =>
              navigate("/empleados")
            }
            className="
              bg-gray-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Cancelar
          </button>

        </div>

      </form>

    </div>

  );

}