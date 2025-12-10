import { useState, type ChangeEvent } from 'react';
import type { SummaryStepProps } from '../types';

export default function SummaryStep({
  onBack,
  tops,
  transcript,
  assignments,
  summaries,
  setSummaries,
  onRegenerateSummary,
  isGenerating,
}: SummaryStepProps) {
  const [selectedTop, setSelectedTop] = useState(0);
  const [editingTop, setEditingTop] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const getTranscriptForTop = (topIndex: number) => {
    return transcript.filter((_, i) => assignments[i] === topIndex);
  };

  const startEditing = (topIndex: number) => {
    setEditingTop(topIndex);
    setEditText(summaries[topIndex] || '');
  };

  const saveEdit = () => {
    if (editingTop !== null) {
      const newSummaries = { ...summaries };
      newSummaries[editingTop] = editText;
      setSummaries(newSummaries);
      setEditingTop(null);
    }
  };

  const cancelEdit = () => {
    setEditingTop(null);
    setEditText('');
  };

  const handleExport = () => {
    // Generate the full protocol text
    let content = 'SITZUNGSPROTOKOLL\n';
    content += '='.repeat(50) + '\n\n';

    tops.forEach((top, index) => {
      content += `TOP ${index + 1}: ${top}\n`;
      content += '-'.repeat(40) + '\n';
      content += (summaries[index] || 'Keine Zusammenfassung vorhanden.') + '\n\n';
    });

    // Create and download file
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'protokoll.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const topLines = getTranscriptForTop(selectedTop);

  return (
    <div className="space-y-6">
      {/* Main Layout */}
      <div className="flex gap-6 h-[600px]">
        {/* TOPs Sidebar */}
        <div className="w-72 bg-white rounded-lg border border-gray-200 p-4 overflow-y-auto">
          <h3 className="font-medium text-gray-900 mb-4">Tagesordnung</h3>
          <div className="space-y-2">
            {tops.map((top, index) => {
              const isSelected = selectedTop === index;
              const hasSummary = summaries[index] && summaries[index].trim();
              return (
                <button
                  key={index}
                  onClick={() => setSelectedTop(index)}
                  className={`w-full text-left px-3 py-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-3 h-3 rounded-full mt-1 ${
                        hasSummary ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {index + 1}. {top || `TOP ${index + 1}`}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Content */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Summary Box */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                TOP {selectedTop + 1}: {tops[selectedTop]}
              </h3>
              <div className="flex gap-2">
                {editingTop === selectedTop ? (
                  <>
                    <button
                      onClick={saveEdit}
                      className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Speichern
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEditing(selectedTop)}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center gap-1"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => onRegenerateSummary(selectedTop)}
                      disabled={isGenerating}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50"
                    >
                      Neu generieren
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {editingTop === selectedTop ? (
                <textarea
                  value={editText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditText(e.target.value)}
                  className="w-full h-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              ) : isGenerating ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="animate-spin mr-2">⏳</div>
                  Zusammenfassung wird generiert...
                </div>
              ) : summaries[selectedTop] ? (
                <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
                  {summaries[selectedTop]}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Keine Zusammenfassung vorhanden. Klicken Sie auf "Neu generieren".
                </div>
              )}
            </div>
          </div>

          {/* Original Transcript for this TOP */}
          <div className="h-48 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
              <h4 className="text-sm font-medium text-gray-700">
                Originaltranskript ({topLines.length} Zeilen)
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto p-3 text-sm">
              {topLines.length > 0 ? (
                topLines.map((line, index) => (
                  <div key={index} className="mb-1">
                    <span className="font-medium text-gray-500">
                      {line.speaker}:
                    </span>{' '}
                    <span className="text-gray-700">{line.text}</span>
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-center py-4">
                  Keine Zeilen diesem TOP zugeordnet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">Export</h3>
            <p className="text-sm text-gray-500">
              Protokoll als Datei herunterladen
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              📄 Text (.txt)
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-start">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-2"
        >
          <span>←</span>
          Zurück zur Zuordnung
        </button>
      </div>
    </div>
  );
}
