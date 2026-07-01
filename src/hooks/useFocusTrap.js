// @ts-check
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Accessible modal-dialog behavior in one place (improvement #10):
//   - Escape closes the dialog.
//   - On open, focus moves to the first form field (or first focusable).
//   - Tab / Shift+Tab cycle within the dialog (focus trap).
//   - On close, focus returns to whatever element opened the dialog.
//
// Returns a ref to attach to the dialog container. No-op while `isOpen` is
// false so it's safe to call unconditionally.
/**
 * @typedef {object} FocusTrapOptions
 * @property {boolean} isOpen
 * @property {() => void} [onClose]
 */

/**
 * @param {FocusTrapOptions} options
 * @returns {import('react').RefObject<HTMLElement | null>}
 */
export function useFocusTrap({ isOpen, onClose }) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null));

  // Keep the latest onClose without re-running the trap effect on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement;

    const getFocusable = () => {
      /** @type {HTMLElement[]} */
      const focusable = [];
      dialog.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
        if (el instanceof window.HTMLElement && el.offsetParent !== null) {
          focusable.push(el);
        }
      });
      return focusable;
    };

    // Prefer the first form field; fall back to first focusable / the dialog.
    const firstField = dialog.querySelector('input:not([disabled]), textarea, select');
    const initialFocusTarget =
      firstField instanceof window.HTMLElement ? firstField : getFocusable()[0] || dialog;
    initialFocusTarget.focus();

    /**
     * @param {KeyboardEvent} e
     */
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused instanceof window.HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  return ref;
}
