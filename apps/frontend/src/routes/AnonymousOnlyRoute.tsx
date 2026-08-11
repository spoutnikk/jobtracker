import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

function AnonymousOnlyRoute() {
  const { status, retryInitialization } = useAuth();

  if (status === "initializing") {
    return <p className="p-8">Vérification de la session...</p>;
  }

  if (status === "error") {
    return (
      <main className="p-8">
        <p className="text-red-600">Impossible de vérifier la session.</p>
        <button type="button" onClick={retryInitialization}>
          Réessayer
        </button>
      </main>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default AnonymousOnlyRoute;
