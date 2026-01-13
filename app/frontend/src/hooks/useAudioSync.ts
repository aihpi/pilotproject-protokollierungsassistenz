import { useState, useCallback, useRef, useEffect } from 'react';
import type { TranscriptLine } from '../types';

interface UseAudioSyncReturn {
  currentTime: number;
  seekTime: number | undefined;
  currentLineIndex: number;
  handleTimeUpdate: (time: number) => void;
  seekToLine: (lineIndex: number, line: TranscriptLine) => void;
  isAutoScroll: boolean;
  setIsAutoScroll: (value: boolean) => void;
}

export function useAudioSync(transcript: TranscriptLine[]): UseAudioSyncReturn {
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState<number | undefined>(undefined);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const seekTimeoutRef = useRef<number | null>(null);

  // Find the current line based on playback time
  useEffect(() => {
    const index = transcript.findIndex(
      (line) => currentTime >= line.start && currentTime < line.end
    );
    if (index !== -1 && index !== currentLineIndex) {
      setCurrentLineIndex(index);
    } else if (index === -1 && currentLineIndex !== -1) {
      // Reset when playback is outside any segment
      setCurrentLineIndex(-1);
    }
  }, [currentTime, transcript, currentLineIndex]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const seekToLine = useCallback((lineIndex: number, line: TranscriptLine) => {
    // Clear any pending seek
    if (seekTimeoutRef.current !== null) {
      clearTimeout(seekTimeoutRef.current);
    }

    // Set seek time to jump to this line
    setSeekTime(line.start);
    setCurrentLineIndex(lineIndex);

    // Clear seekTime after a brief delay to allow audio element to respond
    seekTimeoutRef.current = window.setTimeout(() => {
      setSeekTime(undefined);
    }, 100);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current !== null) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  return {
    currentTime,
    seekTime,
    currentLineIndex,
    handleTimeUpdate,
    seekToLine,
    isAutoScroll,
    setIsAutoScroll,
  };
}
