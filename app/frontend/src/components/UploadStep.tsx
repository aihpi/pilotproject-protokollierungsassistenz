import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import type { UploadStepProps } from '../types';

export default function UploadStep({
  onNext,
  audioFile,
  setAudioFile,
  tops,
  setTops,
}: UploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setAudioFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const addTop = () => {
    setTops([...tops, '']);
  };

  const updateTop = (index: number, value: string) => {
    const newTops = [...tops];
    newTops[index] = value;
    setTops(newTops);
  };

  const removeTop = (index: number) => {
    if (tops.length > 1) {
      setTops(tops.filter((_, i) => i !== index));
    }
  };

  const canProceed = audioFile && tops.some((top) => top.trim() !== '');

  return (
    <div className="space-y-8">
      {/* Audio Upload Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">🎙️</span>
          Audioaufnahme
        </h2>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {audioFile ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-green-500 text-2xl">✓</span>
              <span className="text-gray-700 font-medium">{audioFile.name}</span>
              <span className="text-gray-500">
                ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAudioFile(null);
                }}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="cursor-pointer">
              <div className="text-4xl mb-2">📁</div>
              <p className="text-gray-600">
                Datei hierher ziehen oder klicken zum Auswählen
              </p>
              <p className="text-gray-400 text-sm mt-1">
                MP3, WAV, M4A (max 500MB)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* TOPs Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">📋</span>
          Tagesordnungspunkte
        </h2>

        <div className="space-y-3">
          {tops.map((top, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="text-gray-500 font-medium w-8">{index + 1}.</span>
              <input
                type="text"
                value={top}
                onChange={(e) => updateTop(index, e.target.value)}
                placeholder={`TOP ${index + 1} eingeben...`}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => removeTop(index)}
                disabled={tops.length === 1}
                className={`p-2 rounded-lg transition-colors ${
                  tops.length === 1
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                }`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addTop}
          className="mt-4 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          TOP hinzufügen
        </button>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Transkription starten
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
