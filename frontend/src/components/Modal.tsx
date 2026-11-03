import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-4 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
