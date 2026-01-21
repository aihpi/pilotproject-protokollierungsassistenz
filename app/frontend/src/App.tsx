import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import StepIndicator from './components/StepIndicator';
import UploadStep from './components/UploadStep';
import ProcessingStep from './components/ProcessingStep';
import AssignmentStep from './components/AssignmentStep';
import SummaryStep from './components/SummaryStep';
import LLMSettingsPanel, {
  DEFAULT_LLM_SETTINGS,
  type LLMSettings,
} from './components/LLMSettingsPanel';
import {
  startTranscription as apiStartTranscription,
  pollTranscription,
  generateSummary,
  checkBackendHealth,
  reportSessionComplete,
} from './api';
import type { TranscriptLine } from './types';

// LocalStorage key for LLM settings
const LLM_SETTINGS_KEY = 'llm-settings';

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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});

  // Telemetry state
  const [jobId, setJobId] = useState<string | null>(null);

  // LLM Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => {
    // Load from localStorage on initial render
    try {
      const saved = localStorage.getItem(LLM_SETTINGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load LLM settings from localStorage:', e);
    }
    return DEFAULT_LLM_SETTINGS;
  });

  // Check backend availability on mount
  useEffect(() => {
    checkBackendHealth().then(setBackendAvailable);
  }, []);

  // Save LLM settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(llmSettings));
    } catch (e) {
      console.error('Failed to save LLM settings to localStorage:', e);
    }
  }, [llmSettings]);

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

      // Store job ID for telemetry
      setJobId(job.job_id);

      // Poll for completion
      const completedJob = await pollTranscription(
        job.job_id,
        (progress, message) => {
          setProcessingProgress(progress);
          setProcessingStatus(message);
        }
      );

      // Set transcript and audio URL
      const transcriptResult = completedJob.transcript ?? [];
      setTranscript(transcriptResult);
      setAssignments(new Array(transcriptResult.length).fill(null));

      // Set audio URL for playback (construct full URL)
      if (completedJob.audio_url) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8010';
        setAudioUrl(`${baseUrl}${completedJob.audio_url}`);
      }

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
        'Backend nicht erreichbar. Bitte starten Sie den Server mit:\n\ncd backend && uv run uvicorn main:app'
      );
    }
  };

  const handleStep2Next = async () => {
    // Move to step 3 first
    setCurrentStep(3);

    let totalDuration = 0;

    // Generate summaries for each TOP with assigned lines
    const validTops = tops.filter((t) => t.trim() !== '');
    const newSummaries: Record<number, string> = {};

    console.log(`[Summary] Starting generation for ${validTops.length} TOPs`);

    for (let index = 0; index < validTops.length; index++) {
      const topLines = transcript.filter((_, i) => assignments[i] === index);
      console.log(`[Summary] TOP ${index + 1}: ${topLines.length} lines assigned`);

      if (topLines.length > 0) {
        // Set placeholder while generating
        newSummaries[index] = 'Zusammenfassung wird generiert...';
        setSummaries({ ...newSummaries });

        try {
          console.log(`[Summary] Generating summary for TOP ${index + 1}...`);
          const result = await generateSummary(validTops[index]!, topLines, {
            model: llmSettings.model,
            systemPrompt: llmSettings.systemPrompt,
          });
          console.log(`[Summary] TOP ${index + 1} complete, length: ${result.summary.length}, duration: ${result.durationSeconds}s`);
          newSummaries[index] = result.summary;
          totalDuration += result.durationSeconds;
          setSummaries({ ...newSummaries });
        } catch (error) {
          console.error(`[Summary] TOP ${index + 1} failed:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
          newSummaries[index] = `Fehler: ${errorMessage}`;
          setSummaries({ ...newSummaries });
        }
      } else {
        console.log(`[Summary] TOP ${index + 1}: skipped (no lines)`);
      }
    }

    console.log(`[Summary] All TOPs processed, total duration: ${totalDuration}s`);

    // Send telemetry after all summaries are generated
    if (jobId) {
      const protocolCharCount = Object.values(newSummaries).reduce(
        (sum, s) => sum + (s?.length || 0),
        0
      );
      reportSessionComplete({
        jobId,
        topCount: validTops.length,
        protocolCharCount,
        summarizationDurationSeconds: totalDuration,
        llmModel: llmSettings.model,
        systemPrompt: llmSettings.systemPrompt,
      });
      console.log(`[Summary] Telemetry sent`);
    }
  };

  const handleStep2Back = () => {
    setCurrentStep(1);
    setTranscript([]);
    setAssignments([]);
    setProcessingError(null);
    setAudioUrl(null);
  };

  const handleStep3Back = () => {
    setCurrentStep(2);
  };

  const handleRegenerateSummary = async (topIndex: number) => {
    setIsGeneratingSummary(true);

    const validTops = tops.filter((t) => t.trim() !== '');
    const topLines = transcript.filter((_, i) => assignments[i] === topIndex);

    try {
      const result = await generateSummary(validTops[topIndex]!, topLines, {
        model: llmSettings.model,
        systemPrompt: llmSettings.systemPrompt,
      });
      setSummaries((prev) => ({ ...prev, [topIndex]: result.summary }));
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
    <Layout onSettingsClick={() => setIsSettingsOpen(true)}>
      {/* LLM Settings Panel */}
      <LLMSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={llmSettings}
        onSettingsChange={setLlmSettings}
      />

      {/* Backend status indicator */}
      {backendAvailable === false && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          Backend nicht erreichbar. Starten Sie den Server mit:{' '}
          <code className="bg-yellow-100 px-1 rounded">
            cd backend && uv run uvicorn main:app
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
          llmSettings={llmSettings}
        />
      ) : currentStep === 2 ? (
        <AssignmentStep
          onNext={handleStep2Next}
          onBack={handleStep2Back}
          tops={validTops}
          transcript={transcript}
          assignments={assignments}
          setAssignments={setAssignments}
          audioUrl={audioUrl ?? undefined}
          speakerNames={speakerNames}
          setSpeakerNames={setSpeakerNames}
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
          audioUrl={audioUrl ?? undefined}
          speakerNames={speakerNames}
        />
      )}
    </Layout>
  );
}
