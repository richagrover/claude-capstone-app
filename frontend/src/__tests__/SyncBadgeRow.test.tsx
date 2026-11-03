import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncBadgeRow } from '../components/SyncBadgeRow';
import type { SyncStatusSummary } from '../types';

/** T-6: sync badge renders synced/pending/failed distinctly. */
describe('SyncBadgeRow', () => {
  it('renders a visually distinct badge per provider status', () => {
    const summary: SyncStatusSummary[] = [
      { provider: 'jira', status: 'synced' },
      { provider: 'github', status: 'failed' },
    ];
    render(<SyncBadgeRow summary={summary} />);

    const jiraBadge = screen.getByRole('button', { name: /jira: synced/i });
    const githubBadge = screen.getByRole('button', { name: /github: failed/i });

    expect(jiraBadge).toBeInTheDocument();
    expect(githubBadge).toBeInTheDocument();
    // Distinct styling (green vs red) backs "renders ... distinctly".
    expect(jiraBadge.className).toContain('bg-green-100');
    expect(githubBadge.className).toContain('bg-red-100');
  });

  it('renders a pending badge with its own style, distinct from synced/failed', () => {
    render(<SyncBadgeRow summary={[{ provider: 'jira', status: 'pending' }]} />);
    const badge = screen.getByRole('button', { name: /jira: pending/i });
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).not.toContain('bg-green-100');
    expect(badge.className).not.toContain('bg-red-100');
  });

  it('calls onSelect with the provider when a badge is clicked', async () => {
    const onSelect = vi.fn();
    render(<SyncBadgeRow summary={[{ provider: 'github', status: 'failed' }]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /github: failed/i }));

    expect(onSelect).toHaveBeenCalledWith('github');
  });
});
