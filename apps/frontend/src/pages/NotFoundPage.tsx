import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";

function NotFoundPage() {
  return (
    <PageShell width="narrow">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Erreur 404
        </p>
        <h1 className="mt-2 text-3xl font-bold">Page introuvable</h1>
        <p className="mt-3 text-gray-600">
          La page demandée n’existe pas ou n’est plus disponible.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Retour à l’accueil
        </Link>
      </section>
    </PageShell>
  );
}

export default NotFoundPage;
