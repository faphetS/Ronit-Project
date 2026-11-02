import { motion } from "motion/react";
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { useCopy } from "../../content/locale";
import { useImportRun } from "../../data/queries";
import { cardVariants } from "../../motion/variants";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { BoardsCard, MappingCard, MondayCard, ResultCard, ScheduleCard } from "./ImportCards";

/** The copy from Monday.com: how it stands, when it runs, the boards, what goes where, and that Monday stays the work tool. */
export function ImportScreen() {
  const { importCopy: copy } = useCopy();
  const phone = useShell() === "phone";
  const query = useImportRun();
  const data = query.data;

  // One service feeds every card, so a failure shows once, in the result card's place.
  const failed = !data && query.isError ? (
    <Surface variant="ink" compact={phone} aria-label={copy.result.label}>
      <ErrorState onDark onRetry={() => void query.refetch()} />
    </Surface>
  ) : null;

  if (phone) {
    // A pushed screen: the top bar carries the title and the way back; the board shows no mapping here.
    return (
      <ScreenFrame>
        <PhoneTopBar title={copy.phoneTitle} />
        {failed ?? (
          <>
            <ResultCard copy={data} phone />
            <ScheduleCard copy={data} phone />
            <BoardsCard copy={data} phone />
            <MondayCard phone />
          </>
        )}
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <Headline title={copy.title} soft={copy.soft} size="display" />
        <motion.p variants={cardVariants} className="max-w-[440px] pb-2 text-[16px] leading-[1.55] text-mute">
          {copy.intro}
        </motion.p>
      </div>
      {failed ?? (
        <div className="grid gap-5 lg:grid-cols-12">
          <ResultCard copy={data} phone={false} className="lg:col-span-12 xl:col-span-8" />
          <ScheduleCard copy={data} phone={false} className="lg:col-span-6 xl:col-span-4" />
          <BoardsCard copy={data} phone={false} className="lg:col-span-6 xl:col-span-4" />
          <MappingCard className="lg:col-span-6 xl:col-span-5" />
          <MondayCard phone={false} className="lg:col-span-6 xl:col-span-3" />
        </div>
      )}
    </ScreenFrame>
  );
}
