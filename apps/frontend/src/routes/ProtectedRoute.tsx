import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

function ProtectedRoute() {
  const { status, retryInitialization } = useAuth();
  const location = useLocation();

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

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
