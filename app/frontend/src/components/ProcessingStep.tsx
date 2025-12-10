import type { ProcessingStepProps } from '../types';

export default function ProcessingStep({ progress, status }: ProcessingStepProps) {
  const steps = [
    { id: 'upload', label: 'Audio hochgeladen', done: progress >= 10 },
    { id: 'transcribe', label: 'Transkription läuft...', done: progress >= 50 },
    { id: 'diarize', label: 'Sprechererkennung', done: progress >= 80 },
    { id: 'complete', label: 'Fertig', done: progress >= 100 },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h2 className="text-xl font-medium text-gray-900 text-center mb-6">
          Verarbeitung läuft...
        </h2>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center mt-2 text-sm text-gray-600">
            {progress}%
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step.done
                    ? 'bg-green-500 text-white'
                    : index === steps.findIndex((s) => !s.done)
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                {step.done ? '✓' : index + 1}
              </div>
              <span
                className={`text-sm ${
                  step.done ? 'text-green-600' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Status Message */}
        {status && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">{status}</p>
          </div>
        )}

        {/* Tip */}
        <div className="mt-8 text-center text-sm text-gray-500">
          Tipp: Die Transkription eines 2-Stunden-Meetings dauert ca. 10-15
          Minuten.
        </div>
      </div>
    </div>
  );
}
