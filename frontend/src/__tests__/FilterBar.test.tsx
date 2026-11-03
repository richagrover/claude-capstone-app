import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../components/FilterBar';

/** T-2: filter changes update state via onChange — no page reload. */
describe('FilterBar', () => {
  it('calls onChange with the new status filter, without navigating/reloading', async () => {
    const onChange = vi.fn();
    const beforeUnloadSpy = vi.fn();
    window.addEventListener('beforeunload', beforeUnloadSpy);
    const hrefBefore = window.location.href;

    render(<FilterBar filters={{}} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'InProgress');

    expect(onChange).toHaveBeenCalledWith({ status: 'InProgress' });
    // A real navigation/reload would fire beforeunload and change location;
    // this purely-controlled <select> change does neither.
    expect(beforeUnloadSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);

    window.removeEventListener('beforeunload', beforeUnloadSpy);
  });

  it('clears all filters via the Clear filters button', async () => {
    const onChange = vi.fn();
    render(<FilterBar filters={{ status: 'Done', priority: 'High', assignee: 'bob' }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('does not show the Clear filters button when no filters are set', () => {
    render(<FilterBar filters={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});
