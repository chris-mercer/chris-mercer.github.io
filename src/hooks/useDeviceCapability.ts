import { useMemo } from 'react';
import { useMediaQuery } from './useMediaQuery';

export type QualityTier = 'high' | 'medium' | 'low';

interface NetworkInformation {
  saveData?: boolean;
}

// Richer than viewport-only tiering: hardwareConcurrency and coarse-pointer
// catch mid-size tablets and low-end laptops that a width breakpoint alone
// would misclassify as "high".
export function useDeviceCapability(): QualityTier {
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const smallViewport = useMediaQuery('(max-width: 768px)');
  const midViewport = useMediaQuery('(max-width: 1024px)');

  return useMemo(() => {
    if (typeof navigator === 'undefined') return 'medium';

    const cores = navigator.hardwareConcurrency || 4;
    const saveData =
      (navigator as Navigator & { connection?: NetworkInformation }).connection?.saveData === true;

    if (saveData) return 'low';
    if (smallViewport || (coarsePointer && cores <= 4)) return 'low';
    if (coarsePointer || cores <= 6 || midViewport) return 'medium';
    return 'high';
  }, [coarsePointer, smallViewport, midViewport]);
}
