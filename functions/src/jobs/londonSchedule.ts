const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const partsAsUtc = (instant: Date) => {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

export const parseLondonSchedule = (dateValue: unknown, timeValue: unknown): number | null => {
  const dateMatch = String(dateValue || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || '00:00').slice(0, 8).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;

  const desired = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] || 0)
  );

  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    guess += desired - partsAsUtc(new Date(guess));
  }
  return Number.isFinite(guess) ? guess : null;
};
