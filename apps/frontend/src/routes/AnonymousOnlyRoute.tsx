import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import StatusMessage from "../components/StatusMessage";

function AnonymousOnlyRoute() {
  const { status, retryInitialization } = useAuth();

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

  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default AnonymousOnlyRoute;
