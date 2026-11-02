import { useParams } from "react-router";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useCustomer, useGroups, usePassportIntakes, useSession } from "../../data/queries";
import { NotFoundError } from "../../data/services";
import { Button } from "../../ui/Button";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { fullName, groupNames, intakeFor } from "./customer-helpers";
import { PassportCard } from "./PassportCard";
import { AccessLogCard, DetailsCard, MessagesCard, NotesCard } from "./ProfileCards";
import { Breadcrumb, PhoneProfileHeader, ProfileHeader } from "./ProfileHeader";
import { DesktopProfileSkeleton, PhoneProfileSkeleton } from "./Skeletons";

/** One customer: passport, access log, messages and notes. A page on desktop, a pushed screen on phones. */
export function CustomerProfileScreen() {
  const { customerId = "" } = useParams();
  const phone = useShell() === "phone";
  const { customersCopy: copy } = useCopy();
  const customer = useCustomer(customerId);
  const groups = useGroups();
  const intakes = usePassportIntakes();
  const session = useSession();
  const data = customer.data;
  const canView = session.data?.user.passportAccess ?? false;
  // The groups line: their names, "ללא קבוצה", "…" while groups load, or nothing if they failed.
  const groupLabel = !data
    ? ""
    : groups.data
      ? groupNames(data.groupIds, groups.data).join(", ") || copy.profile.noGroup
      : groups.isError
        ? ""
        : copy.list.pending;
  const intake = data ? intakeFor(data.id, intakes.data) : undefined;

  const problem = customer.isError && !data ? (
    <Surface variant="card" compact={phone}>
      {customer.error instanceof NotFoundError ? (
        <EmptyState
          message={copy.profile.notFound}
          action={
            <Button variant="outline" size="sm" to="/customers">
              {copy.profile.toList}
            </Button>
          }
        />
      ) : (
        <ErrorState onRetry={() => void customer.refetch()} />
      )}
    </Surface>
  ) : null;

  if (phone) {
    return (
      <ScreenFrame>
        <PhoneTopBar title={copy.profile.title} />
        {customer.isPending ? <PhoneProfileSkeleton /> : null}
        {problem}
        {data ? (
          <>
            <PhoneProfileHeader customer={data} groupLabel={groupLabel} />
            <PassportCard key={data.id} compact customer={data} groupLabel={groupLabel} intake={intake} canView={canView} />
            <MessagesCard compact customerId={data.id} />
            <NotesCard compact customer={data} />
          </>
        ) : null}
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <Breadcrumb name={data ? fullName(data) : null} />
      {customer.isPending ? <DesktopProfileSkeleton /> : null}
      {problem}
      {data ? (
        <>
          <ProfileHeader customer={data} groupLabel={groupLabel} />
          <div className="grid gap-5 lg:grid-cols-12">
            <PassportCard key={data.id} customer={data} groupLabel={groupLabel} intake={intake} canView={canView} className="lg:col-span-12 xl:col-span-8" />
            <AccessLogCard customerId={data.id} className="lg:col-span-6 xl:col-span-4" />
            <MessagesCard customerId={data.id} className="lg:col-span-6 xl:col-span-4" />
            <DetailsCard customer={data} groupLabel={groupLabel} className="lg:col-span-6 xl:col-span-4" />
            <NotesCard customer={data} className="lg:col-span-6 xl:col-span-4" />
          </div>
        </>
      ) : null}
    </ScreenFrame>
  );
}
