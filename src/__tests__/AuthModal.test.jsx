// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import AuthModal from '../components/AuthModal.jsx';

afterEach(cleanup);

describe('AuthModal accessibility', () => {
  it('provides stable accessible names and password autocomplete hints', () => {
    render(<AuthModal isOpen onClose={vi.fn()} supabase={{ auth: {} }} configured />);

    expect(screen.getByRole('dialog', { name: 'Sign In to Katachiya' })).toBeTruthy();
    expect(screen.getByLabelText('Email address').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByRole('dialog', { name: 'Create Katachiya Account' })).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('Confirm Password').getAttribute('autocomplete')).toBe(
      'new-password',
    );
  });

  it('announces a client load error and offers an accessible retry', () => {
    const onRetryClient = vi.fn();
    render(
      <AuthModal
        isOpen
        onClose={vi.fn()}
        supabase={null}
        configured
        clientStatus="error"
        clientError={new Error('Network unavailable')}
        onRetryClient={onRetryClient}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry cloud sign-in' }));
    expect(onRetryClient).toHaveBeenCalledTimes(1);
  });
});
