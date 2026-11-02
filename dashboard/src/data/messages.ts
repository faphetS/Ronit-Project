/**
 * Placeholders a greeting can hold. They are part of the stored message text, written the way Ronit writes her
 * messages, and the sender replaces them for each recipient. A "+ שם פרטי" chip inserts MESSAGE_TOKENS.firstName.
 */
export const MESSAGE_TOKENS = {
  firstName: "{שם פרטי}",
  groupName: "{שם הקבוצה}",
  age: "{גיל}",
} as const;

export type MessageToken = keyof typeof MESSAGE_TOKENS;

/** Fills the placeholders for one recipient, as the WhatsApp preview shows it. Tokens without a value stay as they are. */
export function fillMessage(template: string, values: Partial<Record<MessageToken, string | number>>): string {
  let text = template;
  for (const key of Object.keys(MESSAGE_TOKENS) as MessageToken[]) {
    const value = values[key];
    if (value !== undefined) text = text.replaceAll(MESSAGE_TOKENS[key], String(value));
  }
  return text;
}
