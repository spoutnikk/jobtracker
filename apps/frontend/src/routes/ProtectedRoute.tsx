import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import StatusMessage from "../components/StatusMessage";

function ProtectedRoute() {
  const { status, retryInitialization } = useAuth();
  const location = useLocation();

  if (status === "initializing") {
    return <p className="p-8">Vérification de la session...</p>;
  }

  if (status === "error") {
    return (
      <main className="p-8">
        <StatusMessage variant="error">
          Impossible de vérifier la session.
        </StatusMessage>
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
