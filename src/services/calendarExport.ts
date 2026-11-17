import { ScheduleTask } from '../types';

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return parts.join('\r\n');
}

function nextDayBasic(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Build a standard .ics calendar file from the desk's open tasks and
 * appointments, so the dates can be imported into the calendar each family
 * member already uses (Apple Calendar, Google Calendar, Outlook). Times are
 * floating local times, which calendar apps read as the viewer's own time.
 */
export function buildIcsCalendar(tasks: ScheduleTask[], calendarName: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steward//Household Calendar//EN',
    'CALSCALE:GREGORIAN',
    foldLine(`X-WR-CALNAME:${icsEscape(calendarName)}`),
  ];

  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) continue;
    const dateBasic = t.dueDate.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${t.id}@steward-household`);
    lines.push(`DTSTAMP:${stamp}`);
    if (t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime)) {
      const [hh, mm] = t.dueTime.split(':').map(Number);
      const endDate = new Date(2000, 0, 1, hh, mm + Math.max(5, t.estimatedMinutes || 30));
      const endH = String(endDate.getHours()).padStart(2, '0');
      const endM = String(endDate.getMinutes()).padStart(2, '0');
      lines.push(`DTSTART:${dateBasic}T${t.dueTime.replace(':', '')}00`);
      lines.push(`DTEND:${dateBasic}T${endH}${endM}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateBasic}`);
      lines.push(`DTEND;VALUE=DATE:${nextDayBasic(t.dueDate)}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(t.title)}`));
    const description = [t.category, t.notes].filter(Boolean).join('\n');
    if (description) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(description)}`));
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcsCalendar(tasks: ScheduleTask[], calendarName: string): void {
  const content = buildIcsCalendar(tasks, calendarName);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'steward-household-calendar.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
