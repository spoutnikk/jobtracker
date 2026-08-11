import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const authMeQueryKey = ["auth", "me"] as const;

function isAuthMeQueryKey(queryKey: QueryKey): boolean {
  return (
    queryKey.length === authMeQueryKey.length &&
    queryKey[0] === authMeQueryKey[0] &&
    queryKey[1] === authMeQueryKey[1]
  );
}

export function clearSensitiveQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => !isAuthMeQueryKey(query.queryKey),
  });
}

export function setAnonymousAuthState(queryClient: QueryClient): void {
  clearSensitiveQueries(queryClient);
  queryClient.setQueryData(authMeQueryKey, null);
}
