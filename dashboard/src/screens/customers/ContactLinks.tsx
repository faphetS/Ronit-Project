import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useCopy } from "../../content/locale";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import { telHref, whatsappHref } from "./customer-helpers";

// The shared Button links only inside the app, so calls get this look-alike. WhatsApp opens in a new window
// through GooButton's href.

/** "הודעה בוואטסאפ": the joined pill and circle, opening a WhatsApp chat in a new window. */
export function WhatsAppLink({ phone, children, size = "md", className }: { phone: string; children: ReactNode; size?: "md" | "sm"; className?: string }) {
  const { customersCopy: copy } = useCopy();
  return (
    <GooButton href={whatsappHref(phone)} icon="chat" size={size} className={className}>
      {children}
      <span className="sr-only"> {copy.profile.newWindow}</span>
    </GooButton>
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
