import { motion } from "motion/react";
import { useCopy } from "../../content/locale";
import { cardVariants } from "../../motion/variants";
import { Headline } from "../../ui/Headline";
import { Segmented } from "../../ui/Segmented";

type GreetingKind = "holidays" | "birthdays";

/** Phones: the ברכות tab's title, and the switch between holidays and birthdays. */
export function GreetingsSwitch({ current }: { current: GreetingKind }) {
  const { greetingsCopy } = useCopy();
  const copy = greetingsCopy.tab;
  return (
    <>
      <Headline title={copy.title} size="display-2" className="px-0.5" />
      <motion.div variants={cardVariants}>
        <Segmented<GreetingKind>
          id="greetings-kind"
          label={copy.label}
          value={current}
          className="w-full"
          options={[
            { value: "holidays", label: copy.holidays, to: "/greetings/holidays" },
            { value: "birthdays", label: copy.birthdays, to: "/greetings/birthdays" },
          ]}
        />
      </motion.div>
    </>
  );
}
