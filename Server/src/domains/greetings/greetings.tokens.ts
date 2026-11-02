/**
 * Placeholders a greeting can hold, written the way Ronit writes them in the dashboard's
 * editor (dashboard/src/data/messages.ts holds the same list). Each message stores the
 * filled text, so the history shows exactly what went out.
 */
export const MESSAGE_TOKENS = {
  firstName: "{שם פרטי}",
  groupName: "{שם הקבוצה}",
  age: "{גיל}",
} as const;

export type MessageToken = keyof typeof MESSAGE_TOKENS;

/** Fills the placeholders for one recipient. Tokens without a value stay as they are. */
export function fillMessage(template: string, values: Partial<Record<MessageToken, string | number>>): string {
  let text = template;
  for (const key of Object.keys(MESSAGE_TOKENS) as MessageToken[]) {
    const value = values[key];
    if (value !== undefined) text = text.replaceAll(MESSAGE_TOKENS[key], String(value));
  }
  return text;
}
