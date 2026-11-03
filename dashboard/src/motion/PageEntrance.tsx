import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EntranceContext } from "./entrance";

/** A page's content: built up on the visit's first page, in place on the others. The page itself moves either way. */
export function PageEntrance({ entrance, children }: { entrance: boolean; children: ReactNode }) {
  return (
    <EntranceContext value={entrance}>
      {entrance ? (
        children
      ) : (
        // The cards inside start where they settle. "contents" keeps it out of the layout.
        <motion.div initial={false} animate="enter" className="contents">
          {children}
        </motion.div>
      )}
    </EntranceContext>
  );
}
