import React, { Suspense } from 'react';
import { IconFlame, IconStar } from '../components/Icons.jsx';
import ViewSkeleton from '../components/Skeleton.jsx';

// Games hub — a small menu in front of the individual game modes so the Games
// tab can hold more than one. Each game lazy-loads into its own chunk, matching
// the pattern App.jsx uses for views.
const RushView = React.lazy(() => import('./RushView.jsx'));
const MatchView = React.lazy(() => import('./MatchView.jsx'));

const GAMES = [
  {
    id: 'rush',
    name: 'Kotoba Rush',
    desc: 'Timed, type-the-answer conjugation drill. Beat the clock and build a combo.',
    Icon: IconFlame,
    Component: RushView,
  },
  {
    id: 'match',
    name: 'Conjugation Match',
    desc: 'Tap-based memory board — pair each word with its conjugated form. No typing.',
    Icon: IconStar,
    Component: MatchView,
  },
];

export default function GamesView() {
  const [selected, setSelected] = React.useState(null);
  const current = GAMES.find((g) => g.id === selected);

  if (current) {
    const Game = current.Component;
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition"
        >
          ← Games
        </button>
        <Suspense fallback={<ViewSkeleton />}>
          <Game />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {GAMES.map((g) => (
        <button
          key={g.id}
          onClick={() => setSelected(g.id)}
          className="text-left bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-sm transition"
        >
          <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
            <g.Icon className="w-4 h-4 text-amber-500" />
            {g.name}
          </h3>
          <p className="text-sm text-stone-500 mt-2">{g.desc}</p>
        </button>
      ))}
    </div>
  );
}
