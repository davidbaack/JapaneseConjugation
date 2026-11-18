// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FormStrengthPanel from '../views/study/FormStrengthPanel.jsx';

afterEach(cleanup);

const rows = [
  { typeId: 'plain-past', label: 'Plain Past', score: 50, attempted: 0, statusLabel: 'New' },
  {
    typeId: 'plain-negative',
    label: 'Plain Negative',
    score: 32,
    attempted: 1,
    statusLabel: 'First attempt',
  },
  { typeId: 'te-form', label: 'Te-form', score: 61, attempted: 2, statusLabel: 'Early estimate' },
];

function metric(element, name, value, writable = false) {
  Object.defineProperty(element, name, { configurable: true, value, writable });
}

describe('FormStrengthPanel', () => {
  it('names every active exact-form meter and labels sparse evidence honestly', () => {
    render(<FormStrengthPanel rows={rows} currentTypeId="plain-negative" />);
    expect(
      screen.getAllByRole('meter').map((meter) => meter.getAttribute('aria-valuenow')),
    ).toEqual(['50', '32', '61']);
    expect(
      screen.getByRole('meter', { name: 'Plain Past' }).getAttribute('aria-valuetext'),
    ).toContain('New');
    expect(screen.getByRole('meter', { name: 'Te-form' }).getAttribute('aria-valuetext')).toContain(
      'Early estimate',
    );
    expect(screen.getByText('Now').closest('[data-form-type]').getAttribute('data-form-type')).toBe(
      'plain-negative',
    );
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows the graded delta without reordering meters or moving the rail', () => {
    const { rerender } = render(<FormStrengthPanel rows={rows} currentTypeId="plain-negative" />);
    const rail = screen.getByRole('group', { name: 'Active form strength' });
    metric(rail, 'scrollLeft', 72, true);
    const updated = rows.map((row) =>
      row.typeId === 'plain-negative' ? { ...row, score: 48.2, attempted: 2 } : row,
    );
    rerender(
      <FormStrengthPanel
        rows={updated}
        currentTypeId="plain-negative"
        feedback={{ typeId: 'plain-negative', beforeScore: 32, afterScore: 48.2 }}
      />,
    );
    expect(rail.scrollLeft).toBe(72);
    expect(screen.getByText('+16.2')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(
      'Plain Negative strength increased to 48 out of 100.',
    );
    expect(
      [...rail.querySelectorAll('[data-form-type]')].map((item) => item.dataset.formType),
    ).toEqual(rows.map((row) => row.typeId));
  });

  it('reveals the next current meter and shows boundary cues for overflow', () => {
    const { rerender } = render(<FormStrengthPanel rows={rows} currentTypeId="plain-past" />);
    const rail = screen.getByRole('group', { name: 'Active form strength' });
    metric(rail, 'clientWidth', 180);
    metric(rail, 'scrollWidth', 500);
    metric(rail, 'scrollLeft', 0, true);
    const last = rail.querySelector('[data-form-type="te-form"]');
    metric(last, 'offsetLeft', 340);
    metric(last, 'offsetWidth', 160);
    fireEvent.scroll(rail);
    expect(screen.getByTestId('form-strength-cue-right')).toBeTruthy();
    rerender(<FormStrengthPanel rows={rows} currentTypeId="te-form" />);
    expect(rail.scrollLeft).toBe(320);
    expect(screen.getByTestId('form-strength-cue-left')).toBeTruthy();
    expect(screen.queryByTestId('form-strength-cue-right')).toBeNull();
  });
});
