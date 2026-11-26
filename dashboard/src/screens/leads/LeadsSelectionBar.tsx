import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCopy } from "../../content/locale";
import { useAddNoteToLeads, useUsers } from "../../data/queries";
import type { Lead, NoteCategory } from "../../data/types";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/toast-context";
import { NoteKindPicker } from "./LeadNotes";
import { STATUS_CHOICES, type DropTarget } from "./leads-model";
import { MentionTextArea } from "./MentionTextArea";
import { tagsToSave, withTag } from "./mentions";
import { useMoveLeads } from "./useMoveLeads";

interface LeadsSelectionBarProps {
  /** The leads picked on the board now. */
  leads: Lead[];
  /** Keeps just these picked: the ones a move or a note didn't reach. */
  onKeep: (ids: string[]) => void;
  /** Stops picking. */
  onDone: () => void;
}

/** Controls on the dark bar: a soft cream fill, and a cream focus ring the dark would hide otherwise. */
const ON_DARK =
  "h-10 rounded-full bg-cream/12 text-[14px] font-medium whitespace-nowrap text-cream transition-colors hover:bg-cream/20 focus-visible:outline-cream disabled:cursor-default disabled:opacity-45 disabled:hover:bg-cream/12";

/**
 * While picking cards on the board: a dark bar low on the screen with how many are picked, a menu that moves them all
 * to one column, a button that writes one note tagging someone on all of them, and "סיום". It's drawn on the page's
 * body, like the dragged card, so the screens' transforms don't carry it off.
 */
export function LeadsSelectionBar({ leads, onKeep, onDone }: LeadsSelectionBarProps) {
  const { leadsCopy: copy } = useCopy();
  const moveLeads = useMoveLeads();
  const [moving, setMoving] = useState(false);
  const [tagging, setTagging] = useState(false);
  const count = leads.length;
  const move = async (target: DropTarget) => {
    setMoving(true);
    try {
      const failed = await moveLeads(leads, target);
      onKeep(failed.map((lead) => lead.id));
    } finally {
      setMoving(false);
    }
  };
  return createPortal(
    <motion.section
      aria-label={copy.select.bar}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24, transition: { duration: 0.16 } }}
      transition={springs.surface}
      className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-ink py-2 ps-5 pe-2 text-cream shadow-float"
    >
      <p aria-live="polite" className="me-1 min-w-[9.5rem] text-[14px] font-medium whitespace-nowrap tabular-nums">
        {copy.select.count(count)}
      </p>
      <MoveMenu disabled={count === 0 || moving} onMove={(target) => void move(target)} />
      <BarButton icon="at" disabled={count === 0} onClick={() => setTagging(true)}>
        {copy.select.tag}
      </BarButton>
      <BarButton onClick={onDone} quiet>
        {copy.select.done}
      </BarButton>
      <TagSheet open={tagging} leads={leads} onClose={() => setTagging(false)} onKeep={onKeep} />
    </motion.section>,
    document.body,
  );
}

/** "העברה לעמודה ▾": the board's five columns. A native select, so the keyboard and screen readers work as everywhere else. */
function MoveMenu({ disabled, onMove }: { disabled: boolean; onMove: (target: DropTarget) => void }) {
  const { leadsCopy: copy } = useCopy();
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-label={copy.select.move}
        value=""
        disabled={disabled}
        onChange={(event) => {
          const choice = STATUS_CHOICES.find((option) => option.target === event.target.value);
          if (choice) onMove(choice.target);
        }}
        className={cx(ON_DARK, "cursor-pointer appearance-none ps-4 pe-9")}
      >
        <option value="" disabled hidden>
          {copy.select.move}
        </option>
        {STATUS_CHOICES.map((option) => (
          // Options keep their own colors: some systems paint the open list with the select's colors.
          <option key={option.target} value={option.target} className="bg-paper text-ink">
            {copy.board.columns[option.target]}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-cream/80">
        <Icon name="chevronDown" size={14} />
      </span>
    </span>
  );
}

function BarButton({ icon, disabled, quiet = false, onClick, children }: { icon?: IconName; disabled?: boolean; quiet?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx(ON_DARK, "inline-flex shrink-0 items-center gap-1.5 px-4", quiet && "bg-transparent text-cream/85 hover:bg-cream/10 hover:text-cream")}
    >
      {icon ? <Icon name={icon} size={16} className="text-gold" /> : null}
      {children}
    </motion.button>
  );
}

interface TagSheetProps {
  open: boolean;
  leads: Lead[];
  onClose: () => void;
  onKeep: (ids: string[]) => void;
}

/** One note, written once and saved on every lead picked: "@" tags the team as in a lead's own notes, with its kind. */
function TagSheet({ open, leads, onClose, onKeep }: TagSheetProps) {
  const { leadsCopy: copy } = useCopy();
  const toast = useToast();
  const team = useUsers().data?.users;
  const add = useAddNoteToLeads();
  const [text, setText] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [kind, setKind] = useState<NoteCategory>("note");
  const field = useRef<HTMLTextAreaElement>(null);
  const count = leads.length;

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed || add.isPending || count === 0) return;
    try {
      const failed = await add.mutateAsync({ ids: leads.map((lead) => lead.id), text: trimmed, mentions: tagsToSave(trimmed, tagged, team), category: kind });
      const saved = count - failed.length;
      if (saved === 0) {
        toast.show({ message: copy.detail.noteFailed, tone: "warning" });
        return;
      }
      toast.show(failed.length > 0 ? { message: copy.select.taggedSome(saved, count), tone: "warning" } : { message: copy.select.tagged(saved) });
      setText("");
      setTagged([]);
      setKind("note");
      onClose();
      onKeep(failed);
    } catch {
      toast.show({ message: copy.detail.noteFailed, tone: "warning" });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.select.tagTitle(count)}
      description={copy.select.tagBody}
      initialFocus={field}
      actions={
        <>
          <Button onClick={() => void save()} disabled={!text.trim() || add.isPending || count === 0}>
            {copy.select.tagSave(count)}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {copy.select.tagCancel}
          </Button>
        </>
      }
    >
      <MentionTextArea
        ref={field}
        label={copy.select.tagLabel}
        name="bulk-note"
        value={text}
        onChange={setText}
        onTag={(userId) => setTagged(withTag(userId))}
        placeholder={copy.select.tagPlaceholder}
        onPaper
        leading={<NoteKindPicker id="note-kind-bulk" value={kind} onChange={setKind} />}
        actions={null}
      />
    </Sheet>
  );
}
