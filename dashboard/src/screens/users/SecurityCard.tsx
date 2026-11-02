import { useCopy } from "../../content/locale";
import { useSecuritySettings } from "../../data/queries";
import { SECURITY_SWITCHES, type SecuritySwitch } from "../../data/types";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import { ListRow } from "../../ui/ListRow";
import { SectionHeader } from "../../ui/SectionHeader";
import { ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { Switch } from "../../ui/Switch";
import { LoadingRows } from "./LoadingRows";
import { PHONE_SWITCHES, switchLabel } from "./users-format";
import { useSecurityToggle } from "./useSecurityToggle";

/**
 * The black security card: one switch per rule, flipped at once and confirmed with a toast.
 * Phones show the three switches of the phone board, with smaller text.
 */
export function SecurityCard({ phone, className }: { phone: boolean; className?: string }) {
  const { usersCopy } = useCopy();
  const copy = usersCopy.security;
  const security = useSecuritySettings();
  const toggle = useSecurityToggle();
  const settings = security.data;
  const keys: readonly SecuritySwitch[] = phone ? PHONE_SWITCHES : SECURITY_SWITCHES;

  return (
    <Surface variant="ink" compact={phone} aria-label={copy.title} className={cx(phone && "pt-4 pb-1.5", className)}>
      <SectionHeader
        surface="ink"
        title={copy.title}
        trailing={<Icon name="shield" className="text-gold" />}
        flush={phone}
        className={phone ? "mb-0.5" : undefined}
      />
      {settings ? (
        <ul>
          {keys.map((key) => {
            const label = switchLabel(key, settings, copy, phone);
            return (
              <ListRow
                key={key}
                as="li"
                surface="ink"
                titleTone="body"
                title={label}
                titleClassName={phone ? "text-small" : undefined}
                className={phone ? "py-px" : "py-0.5"}
                trailing={<Switch onDark checked={settings[key]} label={label} onChange={(checked) => toggle(key, checked, label)} />}
              />
            );
          })}
        </ul>
      ) : security.isError ? (
        <ErrorState onDark onRetry={() => void security.refetch()} />
      ) : (
        <LoadingRows shape="switch" count={keys.length} onDark />
      )}
    </Surface>
  );
}
