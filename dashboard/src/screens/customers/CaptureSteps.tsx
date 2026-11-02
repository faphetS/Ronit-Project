import { useId } from "react";
import { useCopy } from "../../content/locale";
import { SectionHeader } from "../../ui/SectionHeader";
import { Steps } from "../../ui/Steps";
import { Surface } from "../../ui/Surface";

/** Desktop: how a passport gets captured from WhatsApp, in four plain steps. */
export function CaptureSteps({ className }: { className?: string }) {
  const { customersCopy: copy } = useCopy();
  const headingId = useId();
  return (
    <Surface variant="glass" aria-labelledby={headingId} className={className}>
      <SectionHeader id={headingId} title={copy.capture.title} trailing={copy.capture.automatic} />
      <Steps
        orientation="vertical"
        label={copy.capture.stepsLabel}
        steps={copy.capture.steps.map((label, index) => ({ key: String(index), label, state: "upcoming" as const }))}
      />
      <p className="mt-3 text-caption text-mute">{copy.capture.note}</p>
    </Surface>
  );
}
