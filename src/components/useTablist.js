import { useRef } from 'react';

// Headless helper for the WAI-ARIA tabs pattern. Call sites keep their own
// markup/styling; this supplies the roles, roving tabindex, and arrow/Home/End
// keyboard navigation so a tab bar behaves like a real tablist.
//
//   const { tabProps, panelProps } = useTablist(['a', 'b'], value, setValue);
//   <div role="tablist"><button {...tabProps('a')}>A</button>…</div>
//   <div {...panelProps(value)}>…</div>
export function useTablist(ids, value, onChange) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const idx = ids.indexOf(value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[(idx + 1) % ids.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = ids[(idx - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  };

  const tabProps = (id) => ({
    role: 'tab',
    id: `${id}-tab`,
    'aria-selected': value === id,
    'aria-controls': `${id}-panel`,
    // Roving tabindex: only the active tab is in the tab order; arrows move
    // between tabs once focus is inside the tablist.
    tabIndex: value === id ? 0 : -1,
    ref: (el) => {
      if (el) refs.current[id] = el;
    },
    onKeyDown,
  });

  const panelProps = (id) => ({
    role: 'tabpanel',
    id: `${id}-panel`,
    'aria-labelledby': `${id}-tab`,
    tabIndex: 0,
  });

  return { tabProps, panelProps };
}
