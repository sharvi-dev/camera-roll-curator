import { useCallback, useRef, useState } from 'react';
import { requestPermissions, fetchPhotosInRange } from '../services/photoLibrary';
import { curateSelection } from '../services/photoScorer';
import { CurationOptions, CurationResult, CurationStatus } from '../types';

export function useCuration() {
  const [status, setStatus] = useState<CurationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<CurationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const curate = useCallback(async (options: CurationOptions) => {
    if (running.current) return;
    running.current = true;

    try {
      setError(null);
      setResult(null);
      setStatus('requesting');
      setProgress(0);
      setProgressLabel('Requesting permissions…');

      const granted = await requestPermissions();
      if (!granted) {
        setStatus('error');
        setError('Photo library access was denied. Please enable it in Settings.');
        return;
      }

      setStatus('fetching');
      setProgress(3);
      setProgressLabel('Fetching photos from your library…');

      const photos = await fetchPhotosInRange(options.dateRange);

      if (photos.length === 0) {
        setStatus('error');
        setError('No photos found in the selected date range. Try widening the range.');
        return;
      }

      setStatus('scoring');
      setProgress(5);

      const { selected, coverCandidates, rejected, paletteHues } =
        await curateSelection(photos, options, (prog, label) => {
          setProgress(5 + Math.round(prog * 0.95));
          setProgressLabel(label);
        });

      setResult({
        selected,
        coverCandidates,
        coverIndex: 0,
        rejected,
        totalAnalyzed: photos.length,
        options,
        paletteHues,
      });
      setStatus('done');
      setProgress(100);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      running.current = false;
    }
  }, []);

  const setCoverIndex = useCallback((n: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, coverIndex: n };
    });
  }, []);

  const swapPhoto = useCallback((selectedId: string, replacementId: string) => {
    setResult((prev) => {
      if (!prev) return prev;

      const incoming = prev.rejected.find((p) => p.id === replacementId);
      const outgoing = prev.selected.find((p) => p.id === selectedId);
      if (!incoming || !outgoing) return prev;

      const newSelected = prev.selected.map((p) => (p.id === selectedId ? incoming : p));
      const newRejected = prev.rejected.map((p) => (p.id === replacementId ? outgoing : p));
      const newCoverCandidates = newSelected.slice(0, Math.min(5, newSelected.length));

      return {
        ...prev,
        selected: newSelected,
        rejected: newRejected,
        coverCandidates: newCoverCandidates,
      };
    });
  }, []);

  return {
    status,
    progress,
    progressLabel,
    result,
    error,
    curate,
    setCoverIndex,
    swapPhoto,
  };
}
