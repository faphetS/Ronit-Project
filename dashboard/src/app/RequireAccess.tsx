import type { ReactNode } from "react";
import { useCopy } from "../content/locale";
import { useMaySee } from "../data/queries";
import type { PermissionArea } from "../data/types";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { ScreenFrame } from "../ui/ScreenFrame";
import { Surface } from "../ui/Surface";

/**
 * A section that only some roles open: its screen, or a calm page saying the role doesn't include it. While the
 * role table loads, the screen shows; the server decides either way.
 */
export function RequireAccess({ area, children }: { area: PermissionArea; children: ReactNode }) {
  return useMaySee(area) ? children : <NoAccessScreen />;
}

function NoAccessScreen() {
  const { states, nav } = useCopy();
  return (
    <ScreenFrame>
      <Surface variant="card" className="mx-auto mt-6 flex w-full max-w-[520px] flex-col items-center gap-3 text-center lg:mt-16">
        <Headline title={states.noAccessTitle} size="display-3" />
        <p className="text-body text-mute">{states.noAccess}</p>
        <Button variant="outline" size="sm" to="/" className="mt-2">
          {nav.items.overview}
        </Button>
      </Surface>
    </ScreenFrame>
  );
}
