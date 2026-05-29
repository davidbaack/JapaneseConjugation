// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

afterEach(cleanup);

// Minimal dialog harness driving the hook the way AuthModal does.
function Dialog({ isOpen, onClose }) {
  const ref = useFocusTrap({ isOpen, onClose });
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <input aria-label="email" />
      <button>Submit</button>
    </div>
  );
}

function Harness({ onClose }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      <button data-testid="closer" onClick={() => setOpen(false)}>
        Close
      </button>
      <Dialog
        isOpen={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus to the first field when the dialog opens', () => {
    const { getByLabelText, getByRole } = render(<Dialog isOpen onClose={() => {}} />);
    expect(document.activeElement).toBe(getByLabelText('email'));
    expect(getByRole('dialog')).toBeTruthy();
  });

  it('calls onClose when Escape is pressed inside the dialog', () => {
    const onClose = vi.fn();
    const { getByRole } = render(<Dialog isOpen onClose={onClose} />);
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener when the dialog closes', () => {
    const { getByTestId, queryByRole } = render(<Harness onClose={() => {}} />);
    const opener = getByTestId('opener');
    act(() => opener.focus());
    expect(document.activeElement).toBe(opener);

    act(() => opener.click()); // open — focus moves into the dialog
    expect(document.activeElement).not.toBe(opener);

    act(() => getByTestId('closer').click()); // close — focus should return
    expect(queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('does nothing while closed', () => {
    const onClose = vi.fn();
    const { container } = render(<Dialog isOpen={false} onClose={onClose} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
