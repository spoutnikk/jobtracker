import { NavLink, Outlet } from "react-router-dom";

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-8 py-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Accueil
          </NavLink>
          <NavLink
            to="/companies"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Entreprises
          </NavLink>
          <NavLink
            to="/applications"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Candidatures
          </NavLink>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}

export default AppLayout;
