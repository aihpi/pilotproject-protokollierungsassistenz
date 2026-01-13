import { useEffect, useRef } from 'react';

export interface LLMSettings {
  model: string;
  systemPrompt: string;
}

interface LLMSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LLMSettings;
  onSettingsChange: (settings: LLMSettings) => void;
}

// Available models grouped by capability
const MODELS = [
  { id: 'gemma3:4b', name: 'Gemma 3 4B', category: 'fast', label: 'Schnell' },
  { id: 'qwen3:8b', name: 'Qwen 3 8B', category: 'balanced', label: 'Standard' },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', category: 'balanced', label: 'Standard' },
  { id: 'gemma3:12b', name: 'Gemma 3 12B', category: 'quality', label: 'Qualität' },
  { id: 'qwen3:14b', name: 'Qwen 3 14B', category: 'quality', label: 'Qualität' },
  { id: 'gemma3:27b', name: 'Gemma 3 27B', category: 'best', label: 'Beste' },
];

export const DEFAULT_SYSTEM_PROMPT = `Du bist ein Experte für die Erstellung von Sitzungsprotokollen für deutsche Kommunalverwaltungen.

Deine Aufgabe ist es, aus einem Transkript eines Tagesordnungspunktes (TOP) eine Zusammenfassung im Stil einer offiziellen Niederschrift zu erstellen.

STIL:
- Formale Verwaltungssprache, dritte Person
- Beispiel: "Die Vorsitzende erläuterte den Sachverhalt.", "Herr Müller wies auf die Kostenfrage hin."
- Paraphrasieren statt wörtlich zitieren

INHALT:
- Wesentliche Diskussionspunkte und Argumente
- Getroffene Beschlüsse mit Abstimmungsergebnis (z.B. "einstimmig beschlossen", "mit 5:2 Stimmen angenommen")
- Wichtige Positionen der Teilnehmer
- Vereinbarte Maßnahmen oder nächste Schritte

IGNORIEREN:
- Verfahrensdetails (Mikrofon, Redezeit, Begrüßungen)
- Füllwörter, Versprecher, triviale Zwischenbemerkungen
- Technische Störungen

FORMAT:
- Kurze TOPs (< 10 Äußerungen): 1-2 Absätze
- Mittlere TOPs (10-50 Äußerungen): 2-3 Absätze
- Lange TOPs (> 50 Äußerungen): 3-5 Absätze
- Chronologischer Ablauf
- Direkt mit Inhalt beginnen, keine Einleitung`;

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  model: 'qwen3:8b',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'fast': return '⚡';
    case 'balanced': return '⚖️';
    case 'quality': return '✨';
    case 'best': return '🏆';
    default: return '';
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'fast': return 'text-yellow-600 bg-yellow-50';
    case 'balanced': return 'text-blue-600 bg-blue-50';
    case 'quality': return 'text-purple-600 bg-purple-50';
    case 'best': return 'text-amber-600 bg-amber-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};

export default function LLMSettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: LLMSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      // Delay to prevent immediate close on the same click that opened it
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleModelChange = (model: string) => {
    onSettingsChange({ ...settings, model });
  };

  const handlePromptChange = (systemPrompt: string) => {
    onSettingsChange({ ...settings, systemPrompt });
  };

  const handleResetPrompt = () => {
    onSettingsChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col transform transition-transform duration-200 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">KI-Einstellungen</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Modell
            </label>
            <div className="space-y-2">
              {MODELS.map((model) => {
                const isSelected = settings.model === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleModelChange(model.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                        {model.name}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(model.category)}`}>
                      {getCategoryIcon(model.category)} {model.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <hr className="border-gray-200" />

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                System-Prompt
              </label>
              <button
                onClick={handleResetPrompt}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Standard
              </button>
            </div>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="System-Prompt eingeben..."
            />
            <p className="mt-2 text-xs text-gray-500">
              Der System-Prompt definiert, wie die KI antwortet.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Einstellungen werden automatisch gespeichert
          </p>
        </div>
      </div>
    </>
  );
}
