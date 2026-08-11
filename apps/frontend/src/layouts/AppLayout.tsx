import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "../api/auth";
import { setAnonymousAuthState } from "../auth/auth-cache";

function AppLayout() {
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setAnonymousAuthState(queryClient);
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setAnonymousAuthState(queryClient);
      }
    },
  });

  const logoutError =
    logoutMutation.isError &&
    !(
      axios.isAxiosError(logoutMutation.error) &&
      logoutMutation.error.response?.status === 401
    );

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
            to="/job-offers"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Offres
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
          <NavLink
            to="/calendar"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Calendrier
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Tableau de Bord
          </NavLink>
          <NavLink
            to="/documents"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }
          >
            Documents
          </NavLink>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="ml-auto text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {logoutMutation.isPending ? "Déconnexion..." : "Déconnexion"}
          </button>
        </nav>
        {logoutError && (
          <p className="mx-auto max-w-5xl px-8 pb-4 text-sm text-red-600">
            Impossible de se déconnecter.
          </p>
        )}
      </header>

      <Outlet />
    </div>
  );
}

export default AppLayout;
