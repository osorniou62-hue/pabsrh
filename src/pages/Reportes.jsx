import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";

export default function Reportes() {

  const exportarEmpleados =
    async () => {

      const { data, error } =
        await supabase
          .from("empleados")
          .select(`
            *,
            departamentos(nombre),
            puestos(nombre)
          `);

      if (error) {

        alert(error.message);
        return;

      }

      const registros =
        data.map((item) => ({
          NumeroEmpleado:
            item.numero_empleado,
          Nombre:
            item.nombre_completo,
          CURP:
            item.curp,
          RFC:
            item.rfc,
          NSS:
            item.nss,
          Departamento:
            item.departamentos?.nombre,
          Puesto:
            item.puestos?.nombre,
          SueldoBase:
            item.sueldo_base,
          Activo:
            item.activo
              ? "SI"
              : "NO",
        }));

      exportarExcel(
        registros,
        "Empleados"
      );

    };

  const exportarNomina =
    async () => {

      const { data, error } =
        await supabase
          .from("nomina")
          .select(`
            *,
            empleados(
              nombre_completo,
              numero_empleado
            )
          `);

      if (error) {

        alert(error.message);
        return;

      }

      const registros =
        data.map((item) => ({
          NumeroEmpleado:
            item.empleados
              ?.numero_empleado,

          Empleado:
            item.empleados
              ?.nombre_completo,

          Sueldo:
            item.sueldo_base,

          Bonos:
            item.total_bonos,

          HorasExtra:
            item.total_horas_extra,

          Descuentos:
            item.total_descuentos,

          Percepciones:
            item.total_percepciones,

          Neto:
            item.neto_pagar,
        }));

      exportarExcel(
        registros,
        "Nomina"
      );

    };

  const exportarVacaciones =
    async () => {

      const { data, error } =
        await supabase
          .from("vacaciones")
          .select(`
            *,
            empleados(
              nombre_completo
            )
          `);

      if (error) {

        alert(error.message);
        return;

      }

      const registros =
        data.map((item) => ({
          Empleado:
            item.empleados
              ?.nombre_completo,

          FechaInicio:
            item.fecha_inicio,

          FechaFin:
            item.fecha_fin,

          Dias:
            item.dias,

          Estatus:
            item.estatus,
        }));

      exportarExcel(
        registros,
        "Vacaciones"
      );

    };

  const exportarPrestamos =
    async () => {

      const { data, error } =
        await supabase
          .from("prestamos")
          .select(`
            *,
            empleados(
              nombre_completo
            )
          `);

      if (error) {

        alert(error.message);
        return;

      }

      const registros =
        data.map((item) => ({
          Empleado:
            item.empleados
              ?.nombre_completo,

          Importe:
            item.importe_total,

          Saldo:
            item.saldo_actual,

          Descuento:
            item.descuento_periodo,

          Estatus:
            item.estatus,
        }));

      exportarExcel(
        registros,
        "Prestamos"
      );

    };

  const exportarExcel =
    (datos, nombreArchivo) => {

      const hoja =
        XLSX.utils.json_to_sheet(
          datos
        );

      const libro =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        libro,
        hoja,
        nombreArchivo
      );

      const excelBuffer =
        XLSX.write(
          libro,
          {
            bookType: "xlsx",
            type: "array",
          }
        );

      const archivo =
        new Blob(
          [excelBuffer],
          {
            type:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }
        );

      saveAs(
        archivo,
        `${nombreArchivo}.xlsx`
      );

    };

  return (

    <div className="max-w-6xl mx-auto p-6">

      <h1 className="text-3xl font-bold mb-6">
        📊 Reportes
      </h1>

      <div className="grid md:grid-cols-2 gap-6">

        <div className="bg-white shadow rounded p-6">

          <h2 className="text-xl font-bold mb-3">
            👥 Empleados
          </h2>

          <button
            onClick={
              exportarEmpleados
            }
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Exportar Excel
          </button>

        </div>

        <div className="bg-white shadow rounded p-6">

          <h2 className="text-xl font-bold mb-3">
            🧮 Nómina
          </h2>

          <button
            onClick={
              exportarNomina
            }
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Exportar Excel
          </button>

        </div>

        <div className="bg-white shadow rounded p-6">

          <h2 className="text-xl font-bold mb-3">
            🏖 Vacaciones
          </h2>

          <button
            onClick={
              exportarVacaciones
            }
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Exportar Excel
          </button>

        </div>

        <div className="bg-white shadow rounded p-6">

          <h2 className="text-xl font-bold mb-3">
            💳 Préstamos
          </h2>

          <button
            onClick={
              exportarPrestamos
            }
            className="
              bg-green-600
              text-white
              px-4
              py-2
              rounded
            "
          >
            Exportar Excel
          </button>

        </div>

      </div>

    </div>

  );

}