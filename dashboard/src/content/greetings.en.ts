import type { greetingsCopy as he } from "./greetings.he";
import type { Widen } from "./types";

/** "A minute ago" reads "a minute ago" inside a sentence. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export const greetingsCopy: Widen<typeof he> = {
  tab: {
    title: "Greetings",
    label: "Greeting type",
    holidays: "Holidays",
    birthdays: "Birthdays",
  },

  campaignStatus: {
    draft: "Draft",
    "in-review": "In WhatsApp review",
    "awaiting-approval": "Awaiting approval",
    scheduled: "Scheduled",
    sending: "Sending",
    completed: "Completed",
  },

  delivery: {
    "awaiting-approval": "Awaiting approval",
    scheduled: "Scheduled",
    paused: "Paused",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed",
  },

  failure: {
    "invalid-number": "Invalid number",
    blocked: "Number blocked",
  },

  holidays: {
    title: "Holiday greetings",
    campaignName: (holiday, year) => `${holiday} ${year}`,
    stagesLabel: "Greeting steps",
    stages: { write: "Write", review: "Review", approve: "Approve and send", track: "Track" },
    stagesShort: { write: "Write", review: "Review", approve: "Approve", track: "Track" },
    newGreeting: "New greeting",
    audienceAll: "All customers",
    noCampaign: "No greeting is being prepared right now",
    create: {
      done: (holiday) => `A greeting for ${holiday} is open`,
      none: "There's no holiday ahead without a greeting.",
      failed: "The greeting wasn't opened. Please try again.",
    },
    review: {
      submit: "Send for WhatsApp review",
      submitPhone: "WhatsApp review",
      submitted: "The text went to WhatsApp for review. The answer usually comes within minutes, at most a day.",
      waiting: "WhatsApp is reviewing the text. Once it approves, you can send yourself a test and approve the send.",
      rejected: (reason) =>
        reason ? `WhatsApp didn't approve the text (${reason}). Fix it and send it again.` : "WhatsApp didn't approve the text. Fix it and send it again.",
      notConnected: "WhatsApp isn't connected yet. You can write and save the greeting, and send it for review once it's connected.",
      notSending: "WhatsApp is connected, but sending to customers is still off. An approved greeting goes out once it's on.",
      failed: "It didn't go for review. Please try again.",
      problems: {
        "empty-message": "An empty greeting can't go for review.",
        "too-long": "WhatsApp takes up to 1,024 characters in a greeting like this.",
        "starts-with-placeholder": "WhatsApp doesn't approve a greeting that starts with a field like {שם פרטי}. Start with a word, like \"שלום {שם פרטי}\".",
        "ends-with-placeholder": "WhatsApp doesn't approve a greeting that ends with a field. End with a word or a sign, like \"!\".",
        "placeholder-not-allowed": "A field that doesn't fit this greeting: the trip's name only goes in a greeting to one trip.",
        "holiday-passed": "The holiday has passed.",
      },
    },

    next: {
      label: "Next holiday",
      countdown: (days) => (days <= 0 ? "Tonight" : days === 1 ? "Tomorrow" : `In ${days} days`),
      when: (countdown, time) => `${countdown} · Holiday eve ${time}`,
      evePhone: (date, time) => `Holiday eve · ${date} · ${time}`,
      recipients: (count) => `${count} recipients`,
      status: {
        draft: "Draft",
        "in-review": "WhatsApp is reviewing it",
        "awaiting-approval": "Awaiting your approval",
        scheduled: "Approved to send",
        sending: "Sending now",
        completed: "Sent",
      },
      toApprove: "Approve",
      toApprovePhone: "Approve",
      toDetails: "Details",
      toDetailsPhone: "Details",
    },

    editor: {
      title: "Greeting text",
      saved: (relative) => `Saved ${lowerFirst(relative)}`,
      label: "Message",
      tokens: { firstName: "First name", groupName: "Group name" },
      length: (characters, limit) => `${characters} of ${limit} characters`,
      save: "Save draft",
      savedToast: "Draft saved",
      savedBackToApproval: "Text saved. The greeting is back waiting for your approval.",
      unchanged: "No changes to save",
      empty: "A greeting can’t be empty",
      alreadySent: "This greeting already went out and can’t be changed",
      failed: "The draft wasn’t saved. Please try again.",
    },

    preview: { title: "Preview" },

    send: {
      title: "Sending",
      recipients: "Recipients",
      audienceLabel: "Who it goes to",
      when: "When",
      whenValue: (time) => `Holiday eve · ${time}`,
      rate: "Rate",
      rateValue: (messages, minutes) => `${messages} messages every ${minutes} minutes`,
      duration: "Estimated time",
      durationValue: (minutes) => {
        if (minutes < 60) return `About ${minutes} minutes`;
        const halfHours = Math.round(minutes / 30);
        const hours = Math.floor(halfHours / 2);
        const half = halfHours % 2 === 1;
        if (hours === 1) return half ? "About an hour and a half" : "About an hour";
        return half ? `About ${hours} and a half hours` : `About ${hours} hours`;
      },
      approve: "Approve and send",
      test: "Send me a test",
      testPhone: "Test to me",
      approvedNote: (date, time) => `Approved. It goes out on ${date} at ${time}.`,
      audienceSaved: (label) => `Recipients updated: ${label}`,
      audienceBackToApproval: (label) => `Recipients updated: ${label}. The greeting is back waiting for your approval.`,
      audienceFailed: "The recipients weren’t updated. Please try again.",
      confirmTitle: (holiday, count) => `Send the ${holiday} greeting to ${count} customers?`,
      confirmBody: (date, time, rate) => `It goes out on the holiday eve, ${date} at ${time}, ${rate}.`,
      confirmSavesDraft: "Your unsaved changes to the text are saved before it’s approved.",
      approved: (holiday, date, time) => `${holiday} greeting approved. It goes out on ${date} at ${time}.`,
      approveFailed: "The approval didn’t go through. Please try again.",
      testTitle: "Send yourself a test?",
      testBody: "The greeting arrives on your WhatsApp exactly as customers will see it.",
      testUnsaved: "It sends the saved text. To test your changes, save them first.",
      testConfirm: "Send test",
      testSent: "Test sent to your WhatsApp",
      testFailed: "The test wasn’t sent. Please try again.",
      testNoNumber: "To get a test, add your WhatsApp number in your personal details.",
      testNotAllowed: "Your number isn't open for WhatsApp sends on the system yet.",
      testTooSoon: "A test just went out. You can send another in half a minute.",
    },

    last: {
      title: (holiday) => `Last greeting · ${holiday}`,
      titleNone: "Last greeting",
      summary: (date, sent) => `${date} · ${sent} sent`,
      parts: { read: "Read", delivered: "Delivered", failed: "Failed" },
      failedNote: (count, shown) => (count === 1 ? "1 number is invalid or blocked" : `${shown} numbers are invalid or blocked`),
      resend: "Resend",
      none: "No holiday greetings have gone out yet",
    },

    history: {
      title: "History",
      note: "Every greeting is kept here",
      table: "Greeting history",
      columns: { holiday: "Holiday", date: "Date", sent: "Sent", delivered: "Delivered", read: "Read", status: "Status" },
      eve: "Holiday eve",
      blank: "·",
      notYet: "Not sent yet",
      phoneLine: (date, sent, read) => `${date} · ${sent} sent · ${read} read`,
      empty: "No greetings in the history yet",
    },
  },

  birthdays: {
    title: "Birthdays",
    soft: "An automatic WhatsApp greeting",
    lead: "On the birthday itself, by the birth date in the passport. Nothing to do by hand.",
    age: (age) => `Age ${age}`,
    ageWith: (age, detail) => `Age ${age} · ${detail}`,

    today: {
      label: "Birthdays today",
      day: "Today",
      count: (count) => (count === 0 ? "No birthdays today" : count === 1 ? "1 birthday" : `${count} birthdays`),
      allSent: (count) => (count === 1 ? "The greeting went out" : count === 2 ? "Both greetings went out" : `All ${count} greetings went out`),
      allSentPhone: (count) => (count === 1 ? "1 greeting went out" : `${count} greetings went out`),
      someSent: (sent, count) => `${sent} of ${count} greetings went out`,
      pending: (count) => (count === 1 ? "The greeting goes out today" : "The greetings go out today"),
      paused: "Automatic sending is off",
      via: (time) => `At ${time} on WhatsApp`,
      more: (count) => `and ${count} more`,
      toTemplate: "Template",
      toTemplatePhone: "Template",
      listTitle: (date) => `Today · ${date}`,
      sentTag: (count) => `${count} sent`,
      empty: "No birthdays today",
    },

    automation: {
      title: "Automatic sending",
      on: "On",
      off: "Off",
      source: "By the birth date in the passport",
      switchLabel: "Send birthday greetings automatically",
      sendTime: "Send time",
      channel: "Channel",
      channels: { whatsapp: "WhatsApp" },
      birthDate: "Birth date",
      birthDateSources: { passport: "From the passport" },
      shabbat: "Birthday on Shabbat",
      shabbatRules: { "after-shabbat": "After Shabbat ends", "before-shabbat": "On Friday" },
      sentThisYear: "greetings sent this year",
      turnedOn: "Automatic sending is on",
      turnedOff: "Automatic sending is off. Birthday greetings won’t go out until you turn it back on.",
      shabbatSaved: {
        "after-shabbat": "Shabbat birthdays: the greeting goes out after Shabbat ends",
        "before-shabbat": "Shabbat birthdays: the greeting goes out on Friday",
      },
      failed: "The setting wasn’t saved. Please try again.",
    },

    week: {
      title: "The coming week",
      count: (count) => (count === 0 ? "No birthdays" : count === 1 ? "1 birthday" : `${count} birthdays`),
      tomorrow: "Tomorrow",
      shabbatNote: { "after-shabbat": "Goes out after Shabbat", "before-shabbat": "Goes out on Friday" },
      shabbatTag: { "after-shabbat": "After Shabbat", "before-shabbat": "Friday" },
      empty: "No birthdays in the coming week",
    },

    template: {
      title: "Greeting template",
      updated: (date) => `Updated ${date}`,
      label: "Message",
      tokens: { firstName: "First name", age: "Age" },
      save: "Save template",
      saved: "Template saved",
      unchanged: "No changes to save",
      empty: "The template can’t be empty",
      failed: "The template wasn’t saved. Please try again.",
      review: {
        pending: "The new text is waiting for WhatsApp's approval. Until then, the approved text goes out.",
        pendingFirst: "The text is waiting for WhatsApp's approval. Greetings start going out once it's approved.",
        rejected: (reason) => (reason ? `WhatsApp didn't approve the text (${reason}). Fix it and save again.` : "WhatsApp didn't approve the text. Fix it and save again."),
        approved: "WhatsApp approved the text.",
        notConnected: "WhatsApp isn't connected yet. The text goes for approval once it is.",
        submitted: "The template was saved and sent for WhatsApp's approval",
      },
    },

    preview: { title: "Preview" },

    recent: {
      title: "Recently sent",
      all: "All history",
      when: (date, time) => `${date} · ${time}`,
      empty: "No birthday greetings have gone out yet",
    },
  },
};
