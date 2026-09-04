import { useEffect, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

interface UsageNotesDialogProps {
  isOpen: boolean;
  title: string;
  markdown: string;
  onClose: () => void;
}

// Hand-styled markdown elements. No raw HTML is rendered (no rehype-raw), so the
// notes cannot inject markup.
const components: Components = {
  h2: ({ children }) => (
    <h3 className="text-base font-semibold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold text-gray-900 mt-4 mb-1">{children}</h4>
  ),
  p: ({ children }) => <p className="text-sm text-gray-700 mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-gray-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-gray-700">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded bg-gray-100 text-xs font-mono">{children}</code>
  ),
};

export default function UsageNotesDialog({
  isOpen,
  title,
  markdown,
  onClose,
}: UsageNotesDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Move focus into the dialog on open and back to the trigger on close.
  useEffect(() => {
    if (!isOpen) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  // Close on escape key. The settings drawer gates its own escape handler on
  // the dialog being closed, so this does not close the drawer as well.
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-notes-title"
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="usage-notes-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
