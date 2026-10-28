import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../data/queries";
import { LoadingBlock } from "../ui/states";

/** Sends visitors without a session to sign in, and back to where they were going afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingBlock className="mx-auto max-w-md p-10" />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}
