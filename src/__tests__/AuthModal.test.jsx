// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import AuthModal from '../components/AuthModal.jsx';

afterEach(cleanup);

describe('AuthModal accessibility', () => {
  it('provides stable accessible names and password autocomplete hints', () => {
    render(<AuthModal isOpen onClose={vi.fn()} supabase={null} />);

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
});
