import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import StepIndicator from './components/StepIndicator';
import UploadStep from './components/UploadStep';
import ProcessingStep from './components/ProcessingStep';
import AssignmentStep from './components/AssignmentStep';
import SummaryStep from './components/SummaryStep';
import {
  startTranscription as apiStartTranscription,
  pollTranscription,
  generateSummary,
  checkBackendHealth,
} from './api';
import type { TranscriptLine } from './types';

export default function App() {
  // Current step in wizard
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Backend status
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);

  // Data state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [tops, setTops] = useState<string[]>(['', '', '']);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [assignments, setAssignments] = useState<(number | null)[]>([]);
  const [summaries, setSummaries] = useState<Record<number, string>>({});
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Check backend availability on mount
  useEffect(() => {
    checkBackendHealth().then(setBackendAvailable);
  }, []);

  // Start transcription via backend API
  const startTranscription = async () => {
    if (!audioFile) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStatus('Audio wird hochgeladen...');
    setProcessingError(null);

    try {
      // Start transcription job
      const job = await apiStartTranscription(audioFile);

      // Poll for completion
      const transcriptResult = await pollTranscription(
        job.job_id,
        (progress, message) => {
          setProcessingProgress(progress);
          setProcessingStatus(message);
        }
      );

      // Set transcript and move to next step
      setTranscript(transcriptResult);
      setAssignments(new Array(transcriptResult.length).fill(null));
      setIsProcessing(false);
      setCurrentStep(2);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      setProcessingError(errorMessage);
      setProcessingStatus(`Fehler: ${errorMessage}`);
      // Keep processing screen to show error
    }
  };

  // Handle step navigation
  const handleStep1Next = () => {
    if (backendAvailable) {
      startTranscription();
    } else {
      // Show error - backend not available
      alert(
        'Backend nicht erreichbar. Bitte starten Sie den Server mit:\n\ncd backend && uv run uvicorn main:app --reload'
      );
    }
  };

  const handleStep2Next = async () => {
    // Move to step 3 first
    setCurrentStep(3);

    // Generate summaries for each TOP with assigned lines
    const validTops = tops.filter((t) => t.trim() !== '');
    const newSummaries: Record<number, string> = {};

    for (let index = 0; index < validTops.length; index++) {
      const topLines = transcript.filter((_, i) => assignments[i] === index);
      if (topLines.length > 0) {
        // Set placeholder while generating
        newSummaries[index] = 'Zusammenfassung wird generiert...';
        setSummaries({ ...newSummaries });

        try {
          const summary = await generateSummary(validTops[index]!, topLines);
          newSummaries[index] = summary;
          setSummaries({ ...newSummaries });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
          newSummaries[index] = `Fehler: ${errorMessage}`;
          setSummaries({ ...newSummaries });
        }
      }
    }
  };

  const handleStep2Back = () => {
    setCurrentStep(1);
    setTranscript([]);
    setAssignments([]);
    setProcessingError(null);
  };

  const handleStep3Back = () => {
    setCurrentStep(2);
  };

  const handleRegenerateSummary = async (topIndex: number) => {
    setIsGeneratingSummary(true);

    const validTops = tops.filter((t) => t.trim() !== '');
    const topLines = transcript.filter((_, i) => assignments[i] === topIndex);

    try {
      const summary = await generateSummary(validTops[topIndex]!, topLines);
      setSummaries((prev) => ({ ...prev, [topIndex]: summary }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      setSummaries((prev) => ({
        ...prev,
        [topIndex]: `Fehler: ${errorMessage}`,
      }));
    }

    setIsGeneratingSummary(false);
  };

  const handleRetry = () => {
    setProcessingError(null);
    setIsProcessing(false);
  };

  // Filter out empty TOPs for display
  const validTops = tops.filter((t) => t.trim() !== '');

  return (
    <Layout>
      {/* Backend status indicator */}
      {backendAvailable === false && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          Backend nicht erreichbar. Starten Sie den Server mit:{' '}
          <code className="bg-yellow-100 px-1 rounded">
            cd backend && uv run uvicorn main:app --reload
          </code>
        </div>
      )}

      {!isProcessing && <StepIndicator currentStep={currentStep} />}

      {isProcessing ? (
        <div>
          <ProcessingStep
            progress={processingProgress}
            status={processingStatus}
          />
          {processingError && (
            <div className="mt-4 text-center">
              <p className="text-red-600 mb-4">{processingError}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      ) : currentStep === 1 ? (
        <UploadStep
          onNext={handleStep1Next}
          audioFile={audioFile}
          setAudioFile={setAudioFile}
          tops={tops}
          setTops={setTops}
        />
      ) : currentStep === 2 ? (
        <AssignmentStep
          onNext={handleStep2Next}
          onBack={handleStep2Back}
          tops={validTops}
          transcript={transcript}
          assignments={assignments}
          setAssignments={setAssignments}
        />
      ) : (
        <SummaryStep
          onBack={handleStep3Back}
          tops={validTops}
          transcript={transcript}
          assignments={assignments}
          summaries={summaries}
          setSummaries={setSummaries}
          onRegenerateSummary={handleRegenerateSummary}
          isGenerating={isGeneratingSummary}
        />
      )}
    </Layout>
  );
}
