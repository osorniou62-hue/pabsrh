import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function Layout({
  children,
}) {

  return (

    <div
      className="
        flex
        bg-slate-100
        min-h-screen
      "
    >

      <Sidebar />

      <main className="flex-1">

        <Navbar />

        <div className="p-6">

          {children}

        </div>

      </main>

    </div>

  );

}