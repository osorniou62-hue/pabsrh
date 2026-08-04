export default function KpiCard({
  titulo,
  valor,
  icono,
  color = "text-blue-600",
}) {

  return (

    <div
      className="
        bg-white
        rounded-2xl
        shadow-lg
        p-6
        hover:shadow-xl
        transition
      "
    >

      <div
        className={`text-4xl ${color}`}
      >
        {icono}
      </div>

      <p className="text-gray-500 mt-3">
        {titulo}
      </p>

      <h2
        className="
          text-3xl
          font-bold
          mt-2
        "
      >
        {valor}
      </h2>

    </div>

  );

}