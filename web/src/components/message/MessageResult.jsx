import React from 'react';
import { UnifiedScanResult } from '../UnifiedScanResult';

export function MessageResult({
  result,
  rawInput = '',
  onReset,
  imageCanvas = null
}) {
  return (
    <UnifiedScanResult
      result={result}
      rawInput={rawInput}
      toolKind="message"
      onReset={onReset}
    />
  );
}

export default MessageResult;
