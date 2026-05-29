import React from 'react';

// Pins a primary action button (Check / Enter / Submit / Next / Retest) to the
// bottom of the viewport while its enclosing card is in view, so expandable
// hint/AI/result content can't push it below the fold. The top-fading backdrop
// keeps content from showing through behind the button.
//
// `pad` should match the enclosing card's horizontal padding (e.g. "-mx-5 px-5")
// so the backdrop spans the card's full width. It defaults to the common
// `p-4` card case. Sticky only engages once content would overflow, so wrapping
// a button that already fits on screen is harmless.
export default function StickyAction({ children, pad = '-mx-4 px-4', className = '' }) {
  return (
    <div
      className={`sticky bottom-0 z-10 pt-3 pb-1 bg-gradient-to-t from-white via-white dark:from-stone-900 dark:via-stone-900 to-transparent ${pad} ${className}`}
    >
      {children}
    </div>
  );
}
