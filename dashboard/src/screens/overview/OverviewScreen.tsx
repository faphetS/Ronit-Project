import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useMaySee, useOverview } from "../../data/queries";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { ActivityCard } from "./ActivityCard";
import { CalendarCard } from "./CalendarCard";
import { GroupsCard, GroupsCarousel } from "./GroupsCards";
import { KeyNumbers } from "./KeyNumbers";
import { OverviewTodayCard } from "./OverviewTodayCard";
import { PassportsCard } from "./PassportsCard";
import { RecentLeadsCard } from "./RecentLeadsCard";
import { WeekCard } from "./WeekCard";

/**
 * The overview, as on the Main and Mobile-Home boards. Desktop: the greeting with three key numbers over a bento
 * grid (5/4/3, 8/4, 4/8 columns from xl; two columns between lg and xl, packed densely so no card stands alone).
 * Phones: stacked cards with the groups as a sideways carousel; no key numbers, leads table or passports, as designed.
 * Cards from areas the role table closes to the person are left out.
 */
export function OverviewScreen() {
  const { overview: copy } = useCopy();
  const phone = useShell() === "phone";
  const stats = useOverview();
  const customers = useMaySee("customers");
  const leads = useMaySee("leads");
  const passports = useMaySee("passports");

  if (phone) {
    return (
      <ScreenFrame>
        <PhoneTopBar />
        <Headline title={copy.title} soft={copy.softPhone} size="display-2" className="mx-0.5 mt-1.5 mb-1" />
        <OverviewTodayCard phone />
        <WeekCard phone />
        <CalendarCard phone />
        {customers ? <GroupsCarousel /> : null}
        <ActivityCard phone />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1.5 pb-0.5">
        <Headline title={copy.title} soft={copy.soft} size="display" />
        <KeyNumbers stats={stats.data} loading={stats.isPending} />
      </div>
      <div className="grid grid-cols-12 grid-flow-dense gap-5">
        <WeekCard phone={false} className="col-span-7 xl:col-span-5" />
        <OverviewTodayCard phone={false} className="col-span-5 xl:col-span-4" />
        <CalendarCard phone={false} className="col-span-5 xl:col-span-3" />
        {leads ? <RecentLeadsCard className="col-span-12 xl:col-span-8" /> : null}
        {customers ? <GroupsCard className="col-span-7 xl:col-span-4" /> : null}
        {passports ? <PassportsCard className="col-span-5 xl:col-span-4" /> : null}
        <ActivityCard phone={false} className="col-span-7 xl:col-span-8" />
      </div>
    </ScreenFrame>
  );
}
