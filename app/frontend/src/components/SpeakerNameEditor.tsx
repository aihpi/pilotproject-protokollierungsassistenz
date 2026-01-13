import { useState, useMemo } from 'react';
import type { TranscriptLine } from '../types';

interface SpeakerNameEditorProps {
  transcript: TranscriptLine[];
  speakerNames: Record<string, string>;
  setSpeakerNames: (names: Record<string, string>) => void;
}

export default function SpeakerNameEditor({
  transcript,
  speakerNames,
  setSpeakerNames,
}: SpeakerNameEditorProps) {
  // Extract unique speakers and a sample of their text
  const speakerInfo = useMemo(() => {
    const speakers = new Map<string, string>();
    for (const line of transcript) {
      if (!speakers.has(line.speaker)) {
        // Store first text snippet as sample (truncate if too long)
        const sample = line.text.length > 60
          ? line.text.substring(0, 60) + '...'
          : line.text;
        speakers.set(line.speaker, sample);
      }
    }
    return Array.from(speakers.entries()).map(([id, sample]) => ({ id, sample }));
  }, [transcript]);

  // Auto-expand if 3 or fewer speakers
  const [isExpanded, setIsExpanded] = useState(speakerInfo.length <= 3);

  const handleNameChange = (speakerId: string, name: string) => {
    setSpeakerNames({
      ...speakerNames,
      [speakerId]: name,
    });
  };

  if (speakerInfo.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-medium text-gray-700">
          Sprecher umbenennen
          <span className="ml-2 text-sm font-normal text-gray-500">
            (optional)
          </span>
        </span>
        <span className="text-gray-400 text-lg">
          {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 border-t border-gray-200">
          {speakerInfo.map(({ id, sample }) => (
            <div key={id} className="flex items-start gap-3">
              <div className="w-28 flex-shrink-0">
                <span className="text-sm font-mono text-gray-500">{id}</span>
              </div>
              <span className="text-gray-400 mt-1">→</span>
              <div className="flex-1">
                <input
                  type="text"
                  value={speakerNames[id] || ''}
                  onChange={(e) => handleNameChange(id, e.target.value)}
                  placeholder="Name eingeben..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="mt-1 text-xs text-gray-400 italic truncate">
                  "{sample}"
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
