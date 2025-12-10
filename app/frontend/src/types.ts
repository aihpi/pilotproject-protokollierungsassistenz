/**
 * Shared type definitions for the Sitzungsprotokoll Generator
 */

// API Types
export interface TranscriptLine {
  speaker: string;
  text: string;
}

export interface TranscriptionJob {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  transcript?: TranscriptLine[];
  error?: string;
}

export interface SummarizeRequest {
  top_title: string;
  lines: TranscriptLine[];
}

export interface SummarizeResponse {
  summary: string;
}

// Component Props Types
export interface LayoutProps {
  children: React.ReactNode;
}

export interface StepIndicatorProps {
  currentStep: number;
}

export interface UploadStepProps {
  onNext: () => void;
  audioFile: File | null;
  setAudioFile: (file: File | null) => void;
  tops: string[];
  setTops: (tops: string[]) => void;
}

export interface ProcessingStepProps {
  progress: number;
  status: string;
}

export interface AssignmentStepProps {
  onNext: () => void;
  onBack: () => void;
  tops: string[];
  transcript: TranscriptLine[];
  assignments: (number | null)[];
  setAssignments: (assignments: (number | null)[]) => void;
}

export interface SummaryStepProps {
  onBack: () => void;
  tops: string[];
  transcript: TranscriptLine[];
  assignments: (number | null)[];
  summaries: Record<number, string>;
  setSummaries: (summaries: Record<number, string>) => void;
  onRegenerateSummary: (topIndex: number) => Promise<void>;
  isGenerating: boolean;
}

// Color palette type for TOPs
export interface TopColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
}
