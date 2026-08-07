import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../api/health";

function HomePage() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">JobTracker</h1>

        <p className="mt-4 text-gray-600">
          Votre assistant de recherche d'emploi
        </p>

        <div className="mt-8">
          {healthQuery.isPending && (
            <p className="text-gray-500">🟡 Connexion à l'API...</p>
          )}

          {healthQuery.isError && (
            <p className="text-red-600">🔴 API Backend — Déconnectée</p>
          )}

          {healthQuery.isSuccess && (
            <div>
              <p className="text-green-600">🟢 API Backend — Connectée</p>

              <p className="mt-2 text-sm text-gray-500">
                {healthQuery.data.service} — v{healthQuery.data.version}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default HomePage;

// function HomePage() {
//   return (
//     <main className="flex min-h-screen items-center justify-center">
//       <div className="text-center">
//         <h1 className="text-4xl font-bold">JobTracker</h1>
//         <p className="mt-4 text-gray-600">
//           Votre assistant de recherche d'emploi
//         </p>
//       </div>
//     </main>
//   );
// }

// export default HomePage;
