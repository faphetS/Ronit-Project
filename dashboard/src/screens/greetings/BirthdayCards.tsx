import { Fragment, useId } from "react";
import { useCopy, useLocale } from "../../content/locale";
import type { BirthdaySettingsPatch } from "../../data/services";
import { useBirthdays, useBirthdaySettings, useUpdateBirthdaySettings } from "../../data/queries";
import type { BirthdayEntry, ShabbatRule } from "../../data/types";
import { dayAt, daysBetween, today } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatNumber, formatTime, formatWeekday } from "../../lib/format";
import { Avatar } from "../../ui/Avatar";
import { BigNumber } from "../../ui/BigNumber";
import { GooButton } from "../../ui/GooButton";
import { Icon } from "../../ui/Icon";
import { KeyValue, type KeyValueItem } from "../../ui/KeyValue";
import { ListRow } from "../../ui/ListRow";
import { OrbCard } from "../../ui/OrbCard";
import { SectionHeader } from "../../ui/SectionHeader";
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { Surface } from "../../ui/Surface";
import { Switch } from "../../ui/Switch";
import { TextLink } from "../../ui/TextLink";
import { useToast } from "../../ui/toast-context";
import { FitHeadline } from "./FitHeadline";
import { BIRTHDAY_ORB, DELIVERY_TONE, SHABBAT_RULES, fullName, sentCount, shabbatRuleOf, todayState } from "./greetings-model";

interface CardProps {
  phone: boolean;
  className?: string;
}

/** Today as an orb card: the date, how many birthdays, whether the greetings went out, and who. */
export function TodayOrbCard({ phone, className }: CardProps) {
  const { greetingsCopy } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.birthdays.today;
  const overview = useBirthdays();
  const settings = useBirthdaySettings();
  const entries = overview.data?.today;
  const minHeight = phone ? "min-h-[240px]" : "min-h-[330px]";

  if (!entries) {
    return (
      <Surface variant="card" compact={phone} aria-label={copy.label} className={cx(minHeight, className)}>
        {overview.isPending ? <LoadingBlock lines={4} /> : <ErrorState onRetry={() => void overview.refetch()} />}
      </Surface>
    );
  }

  const count = entries.length;
  const date = formatDayMonth(today(), locale);
  const first = entries[0];
  const time = first ? formatTime(new Date(first.sendAt)) : settings.data?.sendTime;
  const state = todayState(entries);
  const statusLine = {
    none: null,
    "all-sent": phone ? copy.allSentPhone(count) : copy.allSent(count),
    paused: copy.paused,
    pending: copy.pending(count),
    "some-sent": copy.someSent(sentCount(entries), count),
  }[state];
  // Up to three names fit the white side; past that, two names and "ועוד".
  const named = count > 3 ? entries.slice(0, 2) : entries;

  return (
    <OrbCard
      label={copy.label}
      compact={phone}
      orb={phone ? BIRTHDAY_ORB.phone : BIRTHDAY_ORB.desktop}
      stripBasis={phone ? "50%" : "55%"}
      className={cx(minHeight, className)}
      strip={
        <>
          <FitHeadline size={phone ? 44 : 60} fitKey={`${copy.day}|${date}`}>
            {copy.day}
            <br />
            <span className="text-faint">{date}</span>
          </FitHeadline>
          {!phone || count === 0 ? <p className={cx("mt-2 text-mute-2", phone ? "text-caption" : "text-small")}>{copy.count(count)}</p> : null}
          <span className="flex-1" />
          {statusLine ? <p className={cx("font-medium text-ink", phone && "text-small")}>{statusLine}</p> : null}
          {count > 0 && time ? <p className={cx("text-mute-2", phone ? "text-caption" : "text-small")}>{copy.via(time)}</p> : null}
        </>
      }
      side={
        <>
          <p className="text-caption text-mute">
            {named.map((entry, index) => (
              <Fragment key={entry.customerId}>
                {index > 0 ? <br /> : null}
                {fullName(entry)}
              </Fragment>
            ))}
            {count > named.length ? (
              <>
                <br />
                {copy.more(count - named.length)}
              </>
            ) : null}
          </p>
          <GooButton size="sm" to="#template">
            {phone ? copy.toTemplatePhone : copy.toTemplate}
          </GooButton>
        </>
      }
    />
  );
}

interface ShabbatRuleSelectProps {
  value: ShabbatRule;
  labelledBy: string;
  onChange: (rule: ShabbatRule) => void;
}

/** The Shabbat rule's value on the black card, as a quiet menu that reads like the other values. */
function ShabbatRuleSelect({ value, labelledBy, onChange }: ShabbatRuleSelectProps) {
  const { greetingsCopy } = useCopy();
  const rules = greetingsCopy.birthdays.automation.shabbatRules;
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-labelledby={labelledBy}
        value={value}
        onChange={(event) => {
          const rule = SHABBAT_RULES.find((option) => option === event.target.value);
          if (rule && rule !== value) onChange(rule);
        }}
        className="cursor-pointer appearance-none rounded-md bg-transparent py-0.5 pe-5 font-medium text-cream focus-visible:outline-cream"
      >
        {SHABBAT_RULES.map((rule) => (
          // Options keep their own colors: some systems paint the open list with the select's colors.
          <option key={rule} value={rule} className="bg-paper text-ink">
            {rules[rule]}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} className="pointer-events-none absolute end-0 text-ink-mute" />
    </span>
  );
}

/** The black card: the automation switch, its settings with the Shabbat rule, and the year's count. */
export function AutomationCard({ phone, className }: CardProps) {
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.birthdays.automation;
  const settings = useBirthdaySettings();
  const overview = useBirthdays();
  const update = useUpdateBirthdaySettings();
  const toast = useToast();
  const shabbatLabelId = useId();
  const data = settings.data;

  // Changes show at once and roll back if the call fails; the toast offers to undo.
  const change = (patch: BirthdaySettingsPatch, message: string, undo: BirthdaySettingsPatch) =>
    update.mutate(patch, {
      onSuccess: () => toast.show({ message, onUndo: () => update.mutate(undo) }),
      onError: () => toast.show({ message: copy.failed, tone: "warning" }),
    });

  const items: KeyValueItem[] = data
    ? [
        { key: "time", label: copy.sendTime, value: data.sendTime },
        { key: "channel", label: copy.channel, value: copy.channels[data.channel] },
        ...(phone
          ? []
          : [
              { key: "source", label: copy.birthDate, value: copy.birthDateSources[data.birthDateSource] },
              {
                key: "shabbat",
                label: <span id={shabbatLabelId}>{copy.shabbat}</span>,
                value: (
                  <ShabbatRuleSelect
                    value={data.shabbatRule}
                    labelledBy={shabbatLabelId}
                    onChange={(rule) => change({ shabbatRule: rule }, copy.shabbatSaved[rule], { shabbatRule: data.shabbatRule })}
                  />
                ),
              },
            ]),
      ]
    : [];

  return (
    <Surface variant="ink" compact={phone} aria-label={copy.title} className={cx("flex flex-col", phone ? "gap-2.5" : "gap-3.5", className)}>
      <SectionHeader
        title={copy.title}
        subtitle={phone ? copy.source : data ? (data.enabled ? copy.on : copy.off) : undefined}
        trailing={
          data ? (
            <Switch
              checked={data.enabled}
              onChange={(enabled) => change({ enabled }, enabled ? copy.turnedOn : copy.turnedOff, { enabled: !enabled })}
              label={copy.switchLabel}
              onDark
            />
          ) : undefined
        }
        surface="ink"
        flush
      />
      {settings.isPending ? <LoadingBlock lines={3} onDark /> : null}
      {settings.isError && data === undefined ? <ErrorState onDark onRetry={() => void settings.refetch()} /> : null}
      {data ? <KeyValue items={items} surface="ink" /> : null}
      {overview.data ? (
        <div className={cx("mt-auto flex items-end", phone ? "gap-2.5" : "gap-3")}>
          <BigNumber value={overview.data.sentThisYear} size={phone ? 44 : 56} surface="ink" countUp />
          <p className={cx("text-small text-ink-mute", phone ? "pb-1" : "pb-1.5")}>{copy.sentThisYear}</p>
        </div>
      ) : overview.isPending ? (
        <Skeleton onDark className="mt-auto h-12 w-40" />
      ) : null}
    </Surface>
  );
}

/** A birthday's day at the start of its row: "מחר" or the weekday, over the date. */
function DateColumn({ entry, phone }: { entry: BirthdayEntry; phone: boolean }) {
  const { greetingsCopy } = useCopy();
  const { locale } = useLocale();
  const day = dayAt(entry.day);
  const label = daysBetween(today(), day) === 1 ? greetingsCopy.birthdays.week.tomorrow : formatWeekday(day, locale);
  // English day names run longer ("Tomorrow").
  const width = locale === "en" ? (phone ? "w-16" : "w-[68px]") : phone ? "w-[50px]" : "w-[54px]";
  return (
    <span className={cx("flex shrink-0 flex-col items-center text-center", width)}>
      <span className={cx("font-medium text-ink", phone && "text-small")}>{label}</span>
      <span className="text-caption text-mute">{formatDayMonth(day, locale)}</span>
    </span>
  );
}

/** The coming week's birthdays, each with its day; a Shabbat birthday says when its greeting goes out. */
export function WeekCard({ phone, className }: CardProps) {
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.birthdays;
  const overview = useBirthdays();
  const entries = overview.data?.upcoming;

  const describe = (entry: BirthdayEntry) => {
    const age = formatNumber(entry.age);
    if (!entry.onShabbat) return copy.age(age);
    const note = copy.week.shabbatNote[shabbatRuleOf(entry)];
    return phone ? note : copy.ageWith(age, note);
  };
  const tag = (entry: BirthdayEntry) => {
    if (entry.status === "paused") return <StatusTag tone={DELIVERY_TONE.paused}>{greetingsCopy.delivery.paused}</StatusTag>;
    if (entry.onShabbat) return <StatusTag tone="new">{copy.week.shabbatTag[shabbatRuleOf(entry)]}</StatusTag>;
    return undefined;
  };

  return (
    <Surface variant="glass" compact={phone} aria-label={copy.week.title} className={cx(phone && "pt-4 pb-2", className)}>
      <SectionHeader
        title={copy.week.title}
        trailing={entries ? copy.week.count(entries.length) : undefined}
        surface="glass"
        flush
        className={phone ? "mb-1" : "mb-3"}
      />
      {overview.isPending ? <LoadingBlock lines={4} /> : null}
      {overview.isError && entries === undefined ? <ErrorState onRetry={() => void overview.refetch()} /> : null}
      {entries && entries.length === 0 ? <EmptyState message={copy.week.empty} /> : null}
      {entries && entries.length > 0 ? (
        <ul>
          {entries.map((entry) => (
            <ListRow
              key={`${entry.customerId}-${entry.day}`}
              as="li"
              surface="glass"
              leading={<DateColumn entry={entry} phone={phone} />}
              title={fullName(entry)}
              description={describe(entry)}
              trailing={tag(entry)}
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

/** Phones: today's birthdays as a list, with each greeting's status. */
export function TodayList({ className }: { className?: string }) {
  const { greetingsCopy } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.birthdays;
  const overview = useBirthdays();
  const entries = overview.data?.today;
  const sent = entries ? sentCount(entries) : 0;

  return (
    <Surface variant="card" compact aria-label={copy.today.label} className={cx("pt-4 pb-2", className)}>
      <SectionHeader
        title={copy.today.listTitle(formatDayMonth(today(), locale))}
        trailing={sent > 0 ? <StatusTag tone="registered">{copy.today.sentTag(sent)}</StatusTag> : undefined}
        flush
        className="mb-1"
      />
      {overview.isPending ? <LoadingBlock lines={2} /> : null}
      {overview.isError && entries === undefined ? <ErrorState onRetry={() => void overview.refetch()} /> : null}
      {entries && entries.length === 0 ? <EmptyState message={copy.today.empty} /> : null}
      {entries && entries.length > 0 ? (
        <ul>
          {entries.map((entry) => (
            <ListRow
              key={entry.customerId}
              as="li"
              leading={<Avatar initial={entry.firstName.charAt(0)} />}
              title={fullName(entry)}
              description={copy.ageWith(
                formatNumber(entry.age),
                entry.status === "failed" && entry.failure ? greetingsCopy.failure[entry.failure] : formatTime(new Date(entry.sendAt)),
              )}
              trailing={<StatusTag tone={DELIVERY_TONE[entry.status]}>{greetingsCopy.delivery[entry.status]}</StatusTag>}
            />
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

/** Desktop: the latest birthday greetings that went out, failures with their reason. */
export function RecentCard({ className }: { className?: string }) {
  const { greetingsCopy } = useCopy();
  const { locale } = useLocale();
  const copy = greetingsCopy.birthdays.recent;
  const overview = useBirthdays();
  const entries = overview.data?.recent;

  return (
    <Surface variant="card" aria-label={copy.title} className={className}>
      <SectionHeader title={copy.title} trailing={<TextLink to="/greetings/holidays#history">{copy.all}</TextLink>} />
      {overview.isPending ? <LoadingBlock lines={4} /> : null}
      {overview.isError && entries === undefined ? <ErrorState onRetry={() => void overview.refetch()} /> : null}
      {entries && entries.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {entries && entries.length > 0 ? (
        <ul>
          {entries.map((entry) => {
            const at = new Date(entry.sendAt);
            const detail = entry.status === "failed" && entry.failure ? greetingsCopy.failure[entry.failure] : formatTime(at);
            return (
              <ListRow
                key={`${entry.customerId}-${entry.sendAt}`}
                as="li"
                title={fullName(entry)}
                description={copy.when(formatDayMonth(at, locale), detail)}
                trailing={<StatusTag tone={DELIVERY_TONE[entry.status]}>{greetingsCopy.delivery[entry.status]}</StatusTag>}
              />
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}
