interface HebcalHoliday {
  title: string;
  date: string;
  hebrew: string;
  subcat?: string;
  memo?: string;
}

interface HebcalApiResponse {
  items: Array<{
    title: string;
    date: string;
    hebrew: string;
    subcat?: string;
    memo?: string;
  }>;
}

let cache: { year: number; holidays: HebcalHoliday[] } | null = null;

async function getHolidaysForYear(year: number): Promise<HebcalHoliday[]> {
  if (cache && cache.year === year) return cache.holidays;

  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&i=on&year=${year}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Hebcal HTTP ${res.status}`);
  }

  const json = (await res.json()) as HebcalApiResponse;
  const holidays: HebcalHoliday[] = (json.items ?? []).map((item) => ({
    title: item.title,
    date: item.date,
    hebrew: item.hebrew,
    subcat: item.subcat,
    memo: item.memo,
  }));

  cache = { year, holidays };
  return holidays;
}

export async function getTomorrowHoliday(): Promise<HebcalHoliday | null> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const year = Number(tomorrowStr.split("-")[0]);

  const holidays = await getHolidaysForYear(year);
  const matches = holidays.filter((h) => h.date === tomorrowStr);

  return matches.find((h) => h.subcat === "major") ?? matches[0] ?? null;
}
