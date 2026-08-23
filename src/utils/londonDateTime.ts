export const LONDON_TIME_ZONE = 'Europe/London';

const londonFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const londonPartsAsUtc = (instant: Date) => {
  const parts = Object.fromEntries(
    londonFormatter.formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

export const parseLondonDateTime = (dateValue: string, timeValue: string): Date | null => {
  const dateMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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
    guess += desired - londonPartsAsUtc(new Date(guess));
  }

  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result;
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const normaliseDate = (value: Date | string | number) => {
  if (typeof value === 'string' && dateOnlyPattern.test(value)) {
    return new Date(`${value}T12:00:00Z`);
  }
  return value instanceof Date ? value : new Date(value);
};

export const formatLondonDate = (
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
) => {
  const date = normaliseDate(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: LONDON_TIME_ZONE }).format(date);
};

export const getLondonDateKey = (value: Date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const addDaysToDateKey = (dateValue: string, days: number) => {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
};
