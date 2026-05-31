import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-indigo-700 text-white rounded-xl px-4 py-3 shadow-xl text-sm whitespace-nowrap"
    >
      <span>Update available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition"
      >
        Reload
      </button>
    </div>
  );
}
