import React, { useEffect, useState } from 'react';

const MIN_KEYBOARD_INSET = 80;

function isKeyboardInput(element) {
  if (!element || !(element instanceof window.HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;

  const type = (element.getAttribute('type') || 'text').toLowerCase();
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(type);
}

function getKeyboardInset() {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  if (window.visualViewport.scale && Math.abs(window.visualViewport.scale - 1) > 0.01) return 0;
  if (!isKeyboardInput(document.activeElement)) return 0;

  const { height, offsetTop } = window.visualViewport;
  const layoutHeight =
    window.innerHeight || document.documentElement?.clientHeight || window.visualViewport.height;
  const occludedBottom = layoutHeight - height - offsetTop;
  return occludedBottom >= MIN_KEYBOARD_INSET ? Math.round(occludedBottom) : 0;
}

function useKeyboardInset() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;

    const viewport = window.visualViewport;
    const requestFrame =
      window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
    let frame = null;

    const update = () => {
      if (frame != null) cancelFrame(frame);
      frame = requestFrame(() => {
        frame = null;
        const next = getKeyboardInset();
        setKeyboardInset((current) => (Math.abs(current - next) > 1 ? next : current));
      });
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    window.addEventListener('orientationchange', update);

    return () => {
      if (frame != null) cancelFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return keyboardInset;
}

// Pins a primary action button (Check / Enter / Submit / Next / Retest) to the
// bottom of the visible viewport while its enclosing card is in view, so
// expandable hint/AI/result content or a mobile keyboard can't push it below the
// fold. The top-fading backdrop keeps content from showing through behind the
// button.
//
// `pad` should match the enclosing card's horizontal padding (e.g. "-mx-5 px-5")
// so the backdrop spans the card's full width. It defaults to the common
// `p-4` card case. Sticky only engages once content would overflow, so wrapping
// a button that already fits on screen is harmless.
export default function StickyAction({ children, pad = '-mx-4 px-4', className = '' }) {
  const keyboardInset = useKeyboardInset();
  const bottom = `${keyboardInset}px`;
  const paddingBottom =
    keyboardInset > 0 ? '0.5rem' : 'calc(0.25rem + env(safe-area-inset-bottom, 0px))';

  return (
    <div
      className={`sticky z-10 pt-3 pb-1 bg-gradient-to-t from-white via-white dark:from-stone-900 dark:via-stone-900 to-transparent ${pad} ${className}`}
      style={{ bottom, paddingBottom }}
    >
      {children}
    </div>
  );
}
