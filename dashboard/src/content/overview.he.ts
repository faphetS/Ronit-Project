export const overview = {
  title: "שלום, רונית",
  soft: "בואי נראה מה קורה היום",
  softPhone: "מה קורה היום?",
  numbersLabel: "המספרים של היום",
  numbers: { openLeads: "לידים פתוחים", customers: "לקוחות", activeGroups: "קבוצות פעילות" },
  pending: "…",
  weekTitle: "לידים השבוע",
  breakdown: (counts: { new: number; talking: number; registered: number }) =>
    `${counts.new} חדשים · ${counts.talking} בשיחה · ${counts.registered} נרשמו`,
  allLeads: "לכל הלידים",
  today: "היום",
  sideNote: "היום בעסק",
  restTitle: "עוד בסקירה",
  rest: "שאר הסקירה תיבנה בשלב הבא: לידים אחרונים, קבוצות, דרכונים ופעילות.",
} as const;
