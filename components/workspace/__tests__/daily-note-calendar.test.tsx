import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DailyNoteCalendar } from '../daily-note-calendar';

function createProps() {
  return {
    contentDates: new Set<string>(),
    expanded: true,
    month: new Date(2026, 7, 1),
    selectedDate: '2026-08-08',
    weekStartsOn: 'monday' as const,
    onExpandedChange: vi.fn(),
    onMonthChange: vi.fn(),
    onSelectDate: vi.fn(),
  };
}

describe('DailyNoteCalendar', () => {
  it('uses the configured week start day', () => {
    const props = createProps();
    const { container, rerender } = render(<DailyNoteCalendar {...props} />);

    const weekdayLabels = () =>
      Array.from(container.querySelectorAll('thead th')).map(
        (header) => header.textContent,
      );

    expect(weekdayLabels()).toEqual(['一', '二', '三', '四', '五', '六', '日']);

    rerender(<DailyNoteCalendar {...props} weekStartsOn="sunday" />);

    expect(weekdayLabels()).toEqual(['日', '一', '二', '三', '四', '五', '六']);
  });

  it('reports expansion changes through the shared settings callback', async () => {
    const user = userEvent.setup();
    const props = createProps();
    const { rerender } = render(<DailyNoteCalendar {...props} />);

    await user.click(screen.getByRole('button', { name: '收起日历' }));
    expect(props.onExpandedChange).toHaveBeenCalledWith(false);

    rerender(<DailyNoteCalendar {...props} expanded={false} />);
    await user.click(screen.getByRole('button', { name: '展开日历' }));
    expect(props.onExpandedChange).toHaveBeenCalledWith(true);
  });
});
