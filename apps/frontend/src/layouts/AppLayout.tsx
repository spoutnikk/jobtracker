import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useId, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "../api/auth";
import { setAnonymousAuthState } from "../auth/auth-cache";

const navigationItems = [
  { to: "/", label: "Accueil", end: true },
  { to: "/companies", label: "Entreprises" },
  { to: "/job-offers", label: "Offres" },
  { to: "/applications", label: "Candidatures" },
  { to: "/calendar", label: "Calendrier" },
  { to: "/dashboard", label: "Tableau de bord" },
  { to: "/documents", label: "Documents" },
  { to: "/profile", label: "Profil" },
];

function AppLayout() {
  const queryClient = useQueryClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigationId = useId();

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

  const navigationLinkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-blue-50 text-blue-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    ].join(" ");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <NavLink
              to="/"
              end
              className="text-lg font-bold tracking-tight text-gray-900"
              onClick={() => setIsMenuOpen(false)}
            >
              JobTracker
            </NavLink>

            <button
              type="button"
              aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMenuOpen}
              aria-controls={navigationId}
              onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden"
            >
              {isMenuOpen ? "Fermer" : "Menu"}
            </button>
          </div>

          <nav
            id={navigationId}
            aria-label="Navigation principale"
            className={`${isMenuOpen ? "flex" : "hidden"} mt-3 flex-col gap-1 border-t border-gray-100 pt-3 md:mt-0 md:flex md:flex-row md:items-center md:gap-1 md:border-0 md:pt-0`}
          >
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setIsMenuOpen(false)}
                className={navigationLinkClassName}
              >
                {item.label}
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="mt-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 md:mt-0 md:ml-auto"
            >
              {logoutMutation.isPending ? "Déconnexion..." : "Déconnexion"}
            </button>
          </nav>

          {logoutError && (
            <p className="mt-3 text-sm text-red-600">
              Impossible de se déconnecter.
            </p>
          )}
        </div>
      </header>

      <Outlet />
    </div>
  );
}

export default AppLayout;
