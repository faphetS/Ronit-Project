import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useCopy } from "../content/locale";
import { useSession } from "../data/queries";
import { LoadingBlock } from "../ui/states";

/** On every screen of a demo account, so nobody takes the sample data for Ronit's. At the top on phones, above the tab bar's way. */
function DemoBadge() {
  const { common } = useCopy();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4 lg:top-auto lg:bottom-4">
      <p role="status" className="rounded-full bg-ink/90 px-3.5 py-1.5 text-[12.5px] font-medium text-cream shadow-lg">
        {common.demoBadge}
      </p>
    </div>
  );
}

/** Sends visitors without a session to sign in, and back to where they were going afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingBlock className="mx-auto max-w-md p-10" />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (session.data.user.demo) {
    return (
      <>
        {children}
        <DemoBadge />
      </>
    );
  }
  return children;
}
