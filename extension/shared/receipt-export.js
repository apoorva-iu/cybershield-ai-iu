// Receipt export for Cyber Shield extension
// Matches the download receipt behavior on the website

export function downloadReceipt(result, checkType = 'job') {
  const receipt = result?.receipt || result?.ledgerProof;
  if (!receipt) return false;
  try {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const defaultPrefix = checkType === 'upi' ? 'upi-proof' : checkType === 'message' ? 'message-proof' : 'verification-proof';
    const proofId = result.proofId || receipt.proofId;
    a.download = (proofId || defaultPrefix) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Failed to download receipt', err);
    return false;
  }
}
