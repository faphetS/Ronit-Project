import { motion } from "motion/react";
import { useCopy } from "../../content/locale";
import type { Customer } from "../../data/types";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { maskPhone } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Headline } from "../../ui/Headline";
import { IconButton } from "../../ui/IconButton";
import { Ltr } from "../../ui/Ltr";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { TextLink } from "../../ui/TextLink";
import { CallLink, WhatsAppLink } from "./ContactLinks";
import { fullName, initialOf, passportState, yearOf } from "./customer-helpers";

/** Desktop: back to the list, then where you are. */
export function Breadcrumb({ name }: { name: string | null }) {
  const { customersCopy: copy } = useCopy();
  return (
    <motion.nav variants={cardVariants} aria-label={copy.profile.breadcrumb} className="flex items-center gap-2.5 text-small">
      <IconButton icon="back" label={copy.profile.back} to="/customers" size="sm" />
      <TextLink to="/customers">{copy.list.title}</TextLink>
      <span aria-hidden="true" className="text-mute">
        /
      </span>
      {name ? (
        <span aria-current="page" className="text-mute">
          {name}
        </span>
      ) : null}
    </motion.nav>
  );
}

/** The card's status tags: the passport, WhatsApp, and (on desktop) since when. */
function ProfileTags({ customer, withSince, className }: { customer: Customer; withSince: boolean; className?: string }) {
  const { customersCopy: copy } = useCopy();
  const state = passportState(customer.passport, now());
  return (
    <ul aria-label={copy.profile.tags.label} className={cx("flex flex-wrap", className)}>
      <li>
        <StatusTag tone={state === "valid" ? "registered" : "warning"}>{copy.profile.tags.passport[state]}</StatusTag>
      </li>
      <li>
        <StatusTag tone={customer.whatsappConnected ? "registered" : "neutral"}>
          {customer.whatsappConnected ? copy.profile.tags.whatsappConnected : copy.profile.tags.whatsappOff}
        </StatusTag>
      </li>
      {withSince ? (
        <li>
          <StatusTag>{copy.profile.tags.since(yearOf(customer.since))}</StatusTag>
        </li>
      ) : null}
    </ul>
  );
}

interface HeaderProps {
  customer: Customer;
  /** The customer's groups, "ללא קבוצה", or "…" while groups load. Empty to leave the line out. */
  groupLabel: string;
}

/** Desktop: the big avatar and name over the group, tags, and the edit (disabled) and WhatsApp actions. */
export function ProfileHeader({ customer, groupLabel }: HeaderProps) {
  const { customersCopy: copy } = useCopy();
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1.5">
      <div className="flex min-w-0 items-end gap-5">
        <motion.div variants={cardVariants} className="shrink-0">
          <Avatar initial={initialOf(customer.firstName)} size="xl" tone="paper" />
        </motion.div>
        <Headline title={fullName(customer)} soft={groupLabel || undefined} size="display" className="min-w-0" />
      </div>
      <motion.div variants={cardVariants} className="flex flex-col items-end gap-3 pb-1.5">
        <ProfileTags customer={customer} withSince className="justify-end gap-2" />
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {/* Editing a customer has no service yet. */}
          <Button variant="outline" icon="edit" disabled>
            {copy.profile.edit}
          </Button>
          <WhatsAppLink phone={customer.phone}>{copy.profile.whatsapp}</WhatsAppLink>
        </div>
      </motion.div>
    </div>
  );
}

/** Phone: the glass card at the top of the pushed profile, with WhatsApp and call. */
export function PhoneProfileHeader({ customer, groupLabel }: HeaderProps) {
  const { customersCopy: copy } = useCopy();
  return (
    <Surface variant="glass" compact aria-label={copy.profile.label} className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        <Avatar initial={initialOf(customer.firstName)} size="lg" tone="paper" />
        <h1 className="min-w-0 flex-1 text-display-3 font-light text-ink">
          {fullName(customer)}
          {groupLabel ? (
            <>
              <br />
              {/* 24px keeps the soft tone readable (faint is for 24px and up). */}
              <span className="text-[24px] leading-tight text-faint">{groupLabel}</span>
            </>
          ) : null}
        </h1>
      </div>
      <ProfileTags customer={customer} withSince={false} className="gap-1.5" />
      <p className="text-small text-mute">
        <Ltr>{maskPhone(customer.phone)}</Ltr> · {copy.profile.tags.since(yearOf(customer.since))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <WhatsAppLink phone={customer.phone} size="sm">
          {copy.profile.whatsappShort}
        </WhatsAppLink>
        <CallLink phone={customer.phone}>{copy.profile.call}</CallLink>
      </div>
    </Surface>
  );
}
