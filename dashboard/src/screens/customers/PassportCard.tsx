import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useLogPassportView } from "../../data/queries";
import type { PassportPart } from "../../data/services";
import type { Customer, Passport, PassportIntake } from "../../data/types";
import { daysBetween, now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDate, formatTime, maskPassport, maskPhone } from "../../lib/format";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconCircle } from "../../ui/IconCircle";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { Ltr } from "../../ui/Ltr";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { useToast } from "../../ui/toast-context";
import { calendarDay, fullName, initialOf, passportState, yearOf } from "./customer-helpers";

/** The small eye beside the masked passport number. Its hit area reaches past the 28px circle. */
function RevealToggle({ shown, pending, onShow, onHide }: { shown: boolean; pending: boolean; onShow: () => void; onHide: () => void }) {
  const { customersCopy: copy } = useCopy();
  return (
    <motion.button
      type="button"
      onClick={shown ? onHide : onShow}
      disabled={pending}
      aria-label={shown ? copy.passport.hideNumber : copy.passport.showNumber}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className="relative grid size-7 shrink-0 place-items-center rounded-full bg-sand-light text-ink transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-sand disabled:opacity-50"
    >
      <Icon name={shown ? "lock" : "eye"} size={14} />
    </motion.button>
  );
}

/**
 * The passport photo once "הצגה" is pressed. The data layer has no image yet, so this draws the passport page
 * from the stored fields until the API serves the scan.
 */
function PassportPage({ customer, passport }: { customer: Customer; passport: Passport }) {
  const { customersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const fields = copy.passport.fields;
  return (
    <motion.figure
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springs.ui}
      aria-label={copy.passport.photo}
      className="w-full rounded-[14px] bg-paper p-3 text-start shadow-button ring-1 ring-ink/8 ring-inset"
    >
      <span aria-hidden="true" className="block h-1 rounded-full bg-gold" />
      <div className="mt-2.5 flex gap-2.5">
        <span aria-hidden="true" className="grid h-14 w-11 shrink-0 place-items-center rounded-lg bg-sand text-[22px] font-light text-ink">
          {initialOf(customer.firstName)}
        </span>
        <div className="min-w-0 flex-1 text-caption">
          <p className="truncate font-medium text-ink">{fullName(customer)}</p>
          <dl className="mt-0.5 flex flex-col">
            <div>
              <dt className="sr-only">{fields.number}</dt>
              <dd className="font-medium text-ink">
                <Ltr>{passport.number}</Ltr>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-mute">{fields.expiryDate}</dt>
              <dd className="text-ink">{formatDate(calendarDay(passport.expiryDate), locale)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <span aria-hidden="true" className="mt-3 block h-1.5 rounded-full bg-ink/10" />
      <span aria-hidden="true" className="mt-1 block h-1.5 w-4/5 rounded-full bg-ink/10" />
    </motion.figure>
  );
}

interface PhotoPanelProps {
  customer: Customer;
  passport: Passport;
  shown: boolean;
  pending: boolean;
  canView: boolean;
  compact: boolean;
  onShow: () => void;
  onHide: () => void;
}

/** The passport photo, hidden behind "הצגה". A column beside the fields on desktop, a row under them on phones. */
function PhotoPanel({ customer, passport, shown, pending, canView, compact, onShow, onHide }: PhotoPanelProps) {
  const { customersCopy: copy } = useCopy();
  const button = (
    <Button variant="outline" size="sm" icon={compact ? undefined : shown ? "lock" : "eye"} disabled={!canView || pending} onClick={shown ? onHide : onShow}>
      {shown ? copy.passport.hide : copy.passport.show}
      <span className="sr-only">{copy.passport.ofPhoto}</span>
    </Button>
  );
  const noAccess = canView ? null : <p className="text-caption text-mute">{copy.passport.noAccess}</p>;

  if (compact) {
    return (
      <div className="mt-4 rounded-[20px] bg-sand-light px-3.5 py-3">
        <div className="flex items-center gap-3">
          <IconCircle icon={shown ? "eye" : "lock"} tone="paper" size="md" />
          <p className="min-w-0 flex-1 text-small text-copy">{shown ? copy.passport.photo : copy.passport.photoHidden}</p>
          {button}
        </div>
        {shown ? (
          <div className="mt-3">
            <PassportPage customer={customer} passport={passport} />
          </div>
        ) : null}
        {noAccess ? <div className="mt-2">{noAccess}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex w-[210px] shrink-0 flex-col items-center justify-center gap-3 rounded-[24px] bg-sand-light p-5 text-center">
      {shown ? (
        <PassportPage customer={customer} passport={passport} />
      ) : (
        <>
          <IconCircle icon="lock" tone="paper" />
          <p className="text-small text-copy">{copy.passport.photoHidden}</p>
        </>
      )}
      {button}
      {noAccess}
    </div>
  );
}

interface PassportCardProps {
  customer: Customer;
  /** The customer's groups for the "קבוצה" field. */
  groupLabel: string;
  /** The WhatsApp intake that put the passport on the card, for the line about how it matched. */
  intake: PassportIntake | undefined;
  /** The signed-in user may open passports. */
  canView: boolean;
  /** Phone layout: two columns of fields, the photo row under them. */
  compact?: boolean;
  className?: string;
}

/** The passport: its fields with the number masked, the hidden photo, and how it reached the card. Revealing either is logged. */
export function PassportCard({ customer, groupLabel, intake, canView, compact = false, className }: PassportCardProps) {
  const { customersCopy: copy } = useCopy();
  const { locale } = useLocale();
  const toast = useToast();
  const logDetails = useLogPassportView();
  const logPhoto = useLogPassportView();
  const [numberShown, setNumberShown] = useState(false);
  const [photoShown, setPhotoShown] = useState(false);
  const reference = now();
  const passport = customer.passport;
  const state = passportState(passport, reference);

  /** Logs the view first, and shows the passport only once the log has it. */
  const reveal = (part: PassportPart, show: () => void) =>
    (part === "photo" ? logPhoto : logDetails).mutate(
      { id: customer.id, part },
      {
        onSuccess: (entry) => {
          show();
          // Null when the access log is switched off: nothing was recorded, so nothing to say.
          if (entry) toast.show({ message: copy.passport.viewLogged });
        },
        onError: () => toast.show({ message: copy.passport.viewFailed, tone: "warning" }),
      },
    );

  const date = (day: string) => formatDate(calendarDay(day), locale);
  const receivedAt = (moment: Date) => {
    const days = daysBetween(moment, reference);
    if (days === 0) return copy.passport.at.today(formatTime(moment));
    if (days === 1) return copy.passport.at.yesterday(formatTime(moment));
    return copy.passport.at.date(formatDate(moment, locale));
  };

  let tag: ReactNode;
  if (!passport) tag = <StatusTag tone="warning">{copy.profile.tags.passport.missing}</StatusTag>;
  else if (state === "valid") tag = <StatusTag tone="registered">{copy.passport.validUntil(yearOf(passport.expiryDate))}</StatusTag>;
  else if (state === "expiring") tag = <StatusTag tone="warning">{copy.passport.validUntilDate(date(passport.expiryDate))}</StatusTag>;
  else tag = <StatusTag tone="warning">{copy.passport.expiredOn(date(passport.expiryDate))}</StatusTag>;

  const received = passport ? copy.passport.received[passport.receivedVia](receivedAt(new Date(passport.receivedAt))) : null;
  const match = intake ? (compact ? copy.passport.matchPhone : copy.passport.match)[intake.result](intake.reason) : null;

  const header = compact ? (
    <>
      <SectionHeader title={copy.passport.title} trailing={tag} />
      {received ? <p className="-mt-1 mb-3.5 text-caption text-mute">{received}</p> : null}
    </>
  ) : (
    <SectionHeader title={copy.passport.title} titleAddon={tag} trailing={received ?? undefined} flush className="mb-5" />
  );

  if (!passport) {
    return (
      <Surface variant="card" compact={compact} aria-label={copy.passport.label} className={cx(!compact && "lg:px-7 lg:py-[26px]", className)}>
        {header}
        <div className={cx("flex items-start gap-3.5 bg-sand-light", compact ? "rounded-[20px] p-4" : "rounded-[24px] p-5")}>
          <IconCircle icon="customers" tone="paper" size={compact ? "md" : "lg"} />
          <div className="min-w-0">
            <p className="font-medium text-ink">{copy.passport.missingTitle}</p>
            <p className="mt-0.5 text-small text-mute">{copy.passport.missingBody}</p>
          </div>
        </div>
      </Surface>
    );
  }

  const fields = copy.passport.fields;
  const number = (
    <span className="inline-flex items-center gap-2">
      <Ltr>{numberShown ? passport.number : maskPassport(passport.number)}</Ltr>
      {canView ? (
        <RevealToggle shown={numberShown} pending={logDetails.isPending} onShow={() => reveal("details", () => setNumberShown(true))} onHide={() => setNumberShown(false)} />
      ) : null}
    </span>
  );
  const field = {
    firstName: { key: "firstName", label: fields.firstName, value: customer.firstName },
    lastName: { key: "lastName", label: fields.lastName, value: customer.lastName },
    number: { key: "number", label: fields.number, value: number },
    birthDate: { key: "birthDate", label: fields.birthDate, value: date(passport.birthDate) },
    nationality: { key: "nationality", label: fields.nationality, value: passport.nationality },
    group: { key: "group", label: fields.group, value: groupLabel || "·" },
    issueDate: { key: "issueDate", label: fields.issueDate, value: date(passport.issueDate) },
    expiryDate: { key: "expiryDate", label: fields.expiryDate, value: date(passport.expiryDate) },
    whatsapp: { key: "whatsapp", label: fields.whatsapp, value: <Ltr>{maskPhone(customer.phone)}</Ltr> },
  } satisfies Record<string, KeyValueItem>;
  // The boards order the fields differently on the phone, and leave the WhatsApp number to the header there.
  const items: KeyValueItem[] = compact
    ? [field.firstName, field.lastName, field.number, field.birthDate, field.nationality, field.expiryDate, field.issueDate, field.group]
    : [field.firstName, field.lastName, field.number, field.birthDate, field.nationality, field.group, field.issueDate, field.expiryDate, field.whatsapp];

  const photo = (
    <PhotoPanel
      customer={customer}
      passport={passport}
      shown={photoShown}
      pending={logPhoto.isPending}
      canView={canView}
      compact={compact}
      onShow={() => reveal("photo", () => setPhotoShown(true))}
      onHide={() => setPhotoShown(false)}
    />
  );

  return (
    <Surface variant="card" compact={compact} aria-label={copy.passport.label} className={cx(!compact && "lg:px-7 lg:py-[26px]", className)}>
      {header}
      {compact ? (
        <>
          <KeyValue layout="grid" columns={2} items={items} />
          {photo}
          {match ? <p className="mt-3 text-caption text-mute">{match}</p> : null}
        </>
      ) : (
        <>
          <div className="flex items-stretch gap-[26px]">
            <KeyValue layout="grid" columns={3} items={items} className="min-w-0 flex-1 content-start" />
            {photo}
          </div>
          {match ? <p className="mt-5 border-t border-line pt-4 text-small text-mute">{match}</p> : null}
        </>
      )}
    </Surface>
  );
}
