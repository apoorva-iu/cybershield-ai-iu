import React from 'react';
import { UnifiedScanResult } from './UnifiedScanResult';

export function ToolResult({
  result: d,
  originalInput = '',
  toolKind = 'message',
  downloadReceipt: customDownloadReceipt
}) {
  return (
    <UnifiedScanResult
      result={d}
      rawInput={originalInput}
      toolKind={toolKind}
      downloadReceipt={customDownloadReceipt}
    />
  );
}

export default ToolResult;
