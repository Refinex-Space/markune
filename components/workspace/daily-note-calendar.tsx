import * as React from 'react';
import type { DayButton } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';

import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import {
  createDateFromDailyDate,
  formatDailyDate,
} from './daily-notes';
import type { CalendarWeekStartsOn } from './workspace-types';

interface DailyNoteCalendarProps {
  contentDates: Set<string>;
  expanded: boolean;
  isLoading?: boolean;
  month: Date;
  selectedDate: string;
  weekStartsOn: CalendarWeekStartsOn;
  onExpandedChange: (expanded: boolean) => void;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: string) => void;
}

export function DailyNoteCalendar({
  contentDates,
  expanded,
  isLoading = false,
  month,
  selectedDate,
  weekStartsOn,
  onExpandedChange,
  onMonthChange,
  onSelectDate,
}: DailyNoteCalendarProps) {
  const isCollapsed = !expanded;
  const selected = React.useMemo(
    () => createDateFromDailyDate(selectedDate),
    [selectedDate],
  );

  function toggleCollapsed() {
    onExpandedChange(isCollapsed);
  }

  return (
    <section
      aria-label="每日笔记日历"
      className="relative shrink-0 overflow-hidden px-2.5 py-2 before:absolute before:left-2.5 before:right-2.5 before:top-0 before:h-px before:bg-sidebar-border/50"
      data-testid="daily-note-calendar"
    >
      {isCollapsed ? (
        <button
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? '展开日历' : '收起日历'}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          data-testid="daily-note-calendar-toggle"
          type="button"
          onClick={toggleCollapsed}
        >
          <span className="truncate font-medium text-sidebar-foreground">
            日历
          </span>
          <span className="truncate">{selectedDate}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'ml-auto size-3.5 shrink-0 -rotate-90 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            )}
          />
        </button>
      ) : (
        <div className="group/daily-calendar relative grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <button
            aria-expanded={!isCollapsed}
            aria-label="收起日历"
            className="absolute right-7 top-0 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-[background-color,color,opacity] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover/daily-calendar:opacity-100 focus-visible:opacity-100"
            data-testid="daily-note-calendar-toggle"
            type="button"
            onClick={toggleCollapsed}
          >
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          </button>
          <Calendar
            buttonVariant="ghost"
            className={cn(
              'w-full bg-transparent p-0 [--cell-size:28px]',
              isLoading ? 'opacity-75' : null,
            )}
            classNames={{
              month: 'flex w-full flex-col gap-2',
              month_caption:
                'flex h-7 w-full items-center justify-center px-(--cell-size)',
              weekdays: 'flex text-[11px]',
              weekday:
                'flex-1 rounded-(--cell-radius) text-[11px] font-normal text-muted-foreground select-none',
              week: 'mt-1.5 flex w-full gap-1',
              day: 'group/day relative flex flex-1 justify-center p-0 text-center select-none',
              today:
                'rounded-(--cell-radius) bg-transparent text-sidebar-foreground data-[selected=true]:bg-transparent',
            }}
            components={{
              DayButton: (props) => (
                <DailyNoteDayButton
                  {...props}
                  contentDates={contentDates}
                />
              ),
            }}
            locale={zhCN}
            mode="single"
            month={month}
            selected={selected}
            showOutsideDays={false}
            weekStartsOn={weekStartsOn === 'monday' ? 1 : 0}
            onMonthChange={onMonthChange}
            onDayClick={(date) => onSelectDate(formatDailyDate(date))}
          />
        </div>
      )}
    </section>
  );
}

function DailyNoteDayButton({
  contentDates,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  contentDates: Set<string>;
}) {
  const date = formatDailyDate(props.day.date);
  const hasContent = contentDates.has(date);
  const isSelected = props.modifiers.selected;

  return (
    <CalendarDayButton
      {...props}
      aria-label={`${date} 每日笔记`}
      className={cn(
        'mx-auto size-7 min-w-7 gap-0.5 rounded-lg text-xs text-sidebar-foreground transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'data-[selected-single=true]:bg-primary/10 data-[selected-single=true]:text-primary',
        'data-[selected-single=true]:hover:bg-primary/15 dark:data-[selected-single=true]:bg-primary/20',
        hasContent ? 'font-medium' : null,
      )}
      data-testid={`daily-note-day-${date}`}
    >
      {props.children}
      {hasContent ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-1 rounded-full',
            isSelected ? 'bg-primary' : 'bg-primary/80',
          )}
          data-testid={`daily-note-marker-${date}`}
        />
      ) : (
        <span aria-hidden="true" className="mt-0.5 size-1 opacity-0" />
      )}
    </CalendarDayButton>
  );
}
