import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";

import Layout from "../components/Layout";
import KpiCard from "../components/KpiCard";

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

    <Layout>

      <div>

        <div className="mb-8">

          <h1 className="text-4xl font-bold">
            📊 Reportes
          </h1>

          <p className="text-gray-500 mt-2">
            Centro de exportación y análisis
          </p>

        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">

          <KpiCard
            titulo="Reporte Empleados"
            valor="Excel"
            icono="👥"
            color="text-blue-600"
          />

          <KpiCard
            titulo="Reporte Nómina"
            valor="Excel"
            icono="🧮"
            color="text-green-600"
          />

          <KpiCard
            titulo="Reporte Vacaciones"
            valor="Excel"
            icono="🏖"
            color="text-orange-600"
          />

          <KpiCard
            titulo="Reporte Préstamos"
            valor="Excel"
            icono="💳"
            color="text-purple-600"
          />

        </div>

        <div className="grid md:grid-cols-2 gap-6">

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <div className="text-5xl mb-4">
              👥
            </div>

            <h2 className="text-2xl font-bold mb-2">
              Empleados
            </h2>

            <p className="text-gray-500 mb-4">
              Exporta el catálogo completo de empleados.
            </p>

            <button
              onClick={exportarEmpleados}
              className="
                bg-green-600
                hover:bg-green-700
                text-white
                px-5
                py-3
                rounded-xl
              "
            >
              Exportar Excel
            </button>

          </div>

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <div className="text-5xl mb-4">
              🧮
            </div>

            <h2 className="text-2xl font-bold mb-2">
              Nómina
            </h2>

            <p className="text-gray-500 mb-4">
              Exporta información de nómina generada.
            </p>

            <button
              onClick={exportarNomina}
              className="
                bg-green-600
                hover:bg-green-700
                text-white
                px-5
                py-3
                rounded-xl
              "
            >
              Exportar Excel
            </button>

          </div>

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <div className="text-5xl mb-4">
              🏖
            </div>

            <h2 className="text-2xl font-bold mb-2">
              Vacaciones
            </h2>

            <p className="text-gray-500 mb-4">
              Exporta solicitudes y periodos vacacionales.
            </p>

            <button
              onClick={exportarVacaciones}
              className="
                bg-green-600
                hover:bg-green-700
                text-white
                px-5
                py-3
                rounded-xl
              "
            >
              Exportar Excel
            </button>

          </div>

          <div
            className="
              bg-white
              rounded-2xl
              shadow-lg
              p-6
            "
          >

            <div className="text-5xl mb-4">
              💳
            </div>

            <h2 className="text-2xl font-bold mb-2">
              Préstamos
            </h2>

            <p className="text-gray-500 mb-4">
              Exporta préstamos, saldos y estatus.
            </p>

            <button
              onClick={exportarPrestamos}
              className="
                bg-green-600
                hover:bg-green-700
                text-white
                px-5
                py-3
                rounded-xl
              "
            >
              Exportar Excel
            </button>

          </div>

        </div>

      </div>

    </Layout>

  );

}