import React from 'react';
import { UnifiedScanResult } from '../UnifiedScanResult';

export function UpiResult({
  result,
  rawInput = '',
  onReset,
  imageCanvas = null
}) {
  return (
    <UnifiedScanResult
      result={result}
      rawInput={rawInput}
      toolKind="upi"
      onReset={onReset}
    />
  );
}

export default UpiResult;
