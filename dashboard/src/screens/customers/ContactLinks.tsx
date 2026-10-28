import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useCopy, useDirection } from "../../content/locale";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Icon } from "../../ui/Icon";
import { telHref, whatsappHref } from "./customer-helpers";

// The shared GooButton and Button link only inside the app, so WhatsApp (a new window) and calls get these look-alikes.

// On hover the circle leans forward: to the left in Hebrew, to the right in English (as GooButton does).
const CIRCLE_MOTION = {
  rtl: { rest: { x: 0 }, hover: { x: -4 } },
  ltr: { rest: { x: 0 }, hover: { x: 4 } },
};

const FILL = "bg-ink text-cream group-hover:bg-black";

/** "הודעה בוואטסאפ": the joined pill and circle, opening a WhatsApp chat in a new window. */
export function WhatsAppLink({ phone, children, size = "md", className }: { phone: string; children: ReactNode; size?: "md" | "sm"; className?: string }) {
  const direction = useDirection();
  const { customersCopy: copy } = useCopy();
  return (
    <motion.a
      href={whatsappHref(phone)}
      target="_blank"
      rel="noreferrer"
      initial="rest"
      whileHover="hover"
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx("group inline-flex items-center gap-2 font-medium leading-none whitespace-nowrap", size === "md" ? "text-[15px]" : "text-[14px]", className)}
    >
      <span className={cx("inline-flex items-center rounded-full transition-colors", size === "md" ? "h-[46px] px-[22px]" : "h-[38px] px-4", FILL)}>
        {children}
        <span className="sr-only"> {copy.profile.newWindow}</span>
      </span>
      <motion.span
        variants={CIRCLE_MOTION[direction]}
        transition={springs.ui}
        className={cx("goo-neck grid shrink-0 place-items-center rounded-full transition-colors", size === "md" ? "size-[52px]" : "size-11", FILL)}
      >
        <Icon name="chat" size={16} />
      </motion.span>
    </motion.a>
  );
}

/** "שיחה": an outline pill that dials the number. The hit area reaches 44px tall around the 38px pill. */
export function CallLink({ phone, children }: { phone: string; children: ReactNode }) {
  return (
    <motion.a
      href={telHref(phone)}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className="relative inline-flex h-[38px] items-center justify-center gap-2 rounded-full px-4 text-[14px] font-medium leading-none whitespace-nowrap text-ink ring-1 ring-ink/28 ring-inset transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] hover:bg-white/65"
    >
      <Icon name="phone" size={16} />
      {children}
    </motion.a>
  );
}
