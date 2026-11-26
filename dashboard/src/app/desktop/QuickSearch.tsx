import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useCopy } from "../../content/locale";
import { QUICK_SEARCH_MIN, useQuickSearch } from "../../data/queries";
import { cx } from "../../lib/cx";
import { formatPhone } from "../../lib/format";
import { springs } from "../../motion/springs";
import { STATUS_TONE } from "../../screens/leads/leads-model";
import { useCloseOnOutsidePress } from "../../screens/leads/useCloseOnOutsidePress";
import { Icon } from "../../ui/Icon";
import { Ltr } from "../../ui/Ltr";
import { StatusTag } from "../../ui/StatusTag";

/** The wait after the last key before the search asks. */
const TYPING_PAUSE_MS = 250;
/** How many leads and groups show; a section that found more says how many. */
const LEADS_SHOWN = 5;
const GROUPS_SHOWN = 3;

interface Row {
  key: string;
  to: string;
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
}

interface Section {
  key: string;
  title: string;
  total: number;
  rows: Row[];
}

/**
 * The top bar's search: a name or phone number finds leads and customers, and a name finds groups, in a list under the
 * field. Arrow keys move through it, Enter or a click opens the one picked, and Escape, a press outside, leaving the
 * field or a new page closes it. Ctrl+K (⌘K) jumps to the field from anywhere.
 */
export function QuickSearch() {
  const { nav, leadsCopy } = useCopy();
  const copy = nav.quickSearch;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  // Open on the page it was opened on, so going anywhere else closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ term: "", index: 0 });
  const found = useQuickSearch(term);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(draft.trim()), TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const jump = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", jump);
    return () => window.removeEventListener("keydown", jump);
  }, []);

  const typedEnough = draft.trim().length >= QUICK_SEARCH_MIN;
  const open = openAt === pathname && typedEnough;
  const close = () => setOpenAt(null);
  useCloseOnOutsidePress(rootRef, close, open);

  const leads = found.leads ?? [];
  const customers = found.customers;
  const sections: Section[] = [
    {
      key: "leads",
      title: copy.leads,
      total: leads.length,
      rows: leads.slice(0, LEADS_SHOWN).map((lead) => ({
        key: `lead-${lead.id}`,
        to: `/leads/${encodeURIComponent(lead.id)}`,
        title: lead.name,
        detail: <Ltr>{formatPhone(lead.phone)}</Ltr>,
        trailing: <StatusTag tone={STATUS_TONE[lead.status]}>{leadsCopy.status[lead.status]}</StatusTag>,
      })),
    },
    {
      key: "customers",
      title: copy.customers,
      total: customers?.total ?? 0,
      rows: (customers?.items ?? []).map((customer) => ({
        key: `customer-${customer.id}`,
        to: `/customers/${encodeURIComponent(customer.id)}`,
        title: `${customer.firstName} ${customer.lastName}`.trim(),
        detail: customer.phone ? <Ltr>{customer.phone}</Ltr> : undefined,
      })),
    },
    {
      key: "groups",
      title: copy.groups,
      total: found.groups.length,
      rows: found.groups.slice(0, GROUPS_SHOWN).map((group) => ({ key: `group-${group.id}`, to: `/groups/${encodeURIComponent(group.id)}`, title: group.name })),
    },
  ].filter((section) => section.rows.length > 0);
  const rows = sections.flatMap((section) => section.rows);
  // The highlighted row goes back to the first whenever the results are for a new search.
  const active = cursor.term === term ? Math.min(cursor.index, Math.max(rows.length - 1, 0)) : 0;
  const optionId = (row: Row) => `${listId}-${row.key}`;

  const go = (to: string) => {
    close();
    setDraft("");
    setTerm("");
    inputRef.current?.blur();
    navigate(to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (rows.length === 0) return;
      event.preventDefault();
      setOpenAt(pathname);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setCursor({ term, index: (active + step + rows.length) % rows.length });
    } else if (event.key === "Enter") {
      const row = rows[active];
      if (!open || !row) return;
      event.preventDefault();
      go(row.to);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (open) close();
      else setDraft("");
    }
  };

  let status: string | null = null;
  if (rows.length === 0) {
    if (found.failed) status = copy.failed;
    else if (found.loading || draft.trim() !== term) status = copy.searching;
    else status = copy.none(term);
  }

  return (
    <div ref={rootRef} className="relative w-[340px]">
      <div className="flex h-12 items-center gap-2.5 rounded-full bg-white/45 px-1.5 ring-1 ring-white/80 ring-inset focus-within:ring-2 focus-within:ring-ink">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/75 text-ink">
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          role="combobox"
          aria-label={nav.search}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? optionId(rows[active]) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.placeholder}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpenAt(pathname);
          }}
          onFocus={() => setOpenAt(pathname)}
          onBlur={close}
          onKeyDown={onKeyDown}
          // The browser's blue clear cross doesn't fit the look; Escape clears the field.
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: springs.ui }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            // Pressing a row mustn't take the focus from the field: leaving the field closes the list.
            onMouseDown={(event) => event.preventDefault()}
            className="account-panel absolute start-0 top-full z-40 mt-3 w-[440px] origin-top overflow-clip rounded-[28px] p-2.5"
          >
            <div id={listId} role="listbox" aria-label={nav.search} className="max-h-[min(70dvh,520px)] overflow-y-auto rounded-[20px] bg-white/90 p-1.5 ring-1 ring-black/[0.04] [scrollbar-width:thin]">
              {sections.map((section) => (
                <div key={section.key} role="group" aria-labelledby={`${listId}-${section.key}`}>
                  <div id={`${listId}-${section.key}`} className="flex items-center justify-between px-3 pt-2.5 pb-1 text-[12.5px] font-medium text-mute">
                    <span>{section.title}</span>
                    <span>{section.total > section.rows.length ? copy.more(section.rows.length, section.total) : section.rows.length}</span>
                  </div>
                  {section.rows.map((row) => {
                    const selected = rows[active] === row;
                    return (
                      <Link
                        key={row.key}
                        id={optionId(row)}
                        to={row.to}
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        onClick={(event) => {
                          event.preventDefault();
                          go(row.to);
                        }}
                        onMouseMove={() => {
                          if (!selected) setCursor({ term, index: rows.indexOf(row) });
                        }}
                        className={cx("flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors", selected ? "bg-sand-light" : "hover:bg-sand-light/60")}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium text-ink">{row.title}</span>
                          {row.detail ? <span className="block truncate text-caption text-mute">{row.detail}</span> : null}
                        </span>
                        {row.trailing}
                      </Link>
                    );
                  })}
                </div>
              ))}
              {status ? (
                <p role="status" className="px-3 py-4 text-center text-small text-mute">
                  {status}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
