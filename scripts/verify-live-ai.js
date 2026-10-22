'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractTextFromImage, analyzeTextWithGemini, getVisionModelName } = require('../detectors/gemini');
const { evaluateRules } = require('../detectors/rules');

async function runLiveCheck() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY is not set in environment or .env');
    process.exit(1);
  }

  const modelUsed = getVisionModelName();
  console.log(`Starting live AI check using vision model: ${modelUsed}`);

  const examplesDir = path.join(__dirname, '..', 'web', 'public', 'examples');
  const files = [
    { name: 'upi-scam.png', kind: 'upi', expectScam: true },
    { name: 'upi-safe.png', kind: 'upi', expectScam: false },
    { name: 'message-scam.png', kind: 'message', expectScam: true },
    { name: 'message-safe.png', kind: 'message', expectScam: false }
  ];

  let totalLiveCalls = 0;
  const results = [];

  for (const file of files) {
    const filePath = path.join(examplesDir, file.name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    console.log(`\n--- Processing ${file.name} ---`);

    // Call 1-4: Vision extraction
    totalLiveCalls++;
    console.log(`[AI Call #${totalLiveCalls}] Extracting text from ${file.name}...`);
    const ocrResult = await extractTextFromImage(buffer, 'image/png');

    if (!ocrResult.ok) {
      console.error(`OCR failed for ${file.name}:`, ocrResult.reason);
      results.push({ name: file.name, ok: false, error: ocrResult.reason });
      continue;
    }

    const extractedText = ocrResult.data.text;
    console.log(`Extracted text (${ocrResult.data.readability}):\n"${extractedText.slice(0, 160)}..."`);

    // Rule evaluation
    const ruleRes = evaluateRules(extractedText, file.kind);

    let aiRes = null;
    // For scam files, run live AI text analysis (calls 5 & 6)
    if (file.expectScam && totalLiveCalls < 6) {
      totalLiveCalls++;
      console.log(`[AI Call #${totalLiveCalls}] Analyzing text with Gemini for ${file.name}...`);
      aiRes = await analyzeTextWithGemini(file.kind, extractedText);
    }

    const ruleScore = ruleRes.score || 0;
    const aiScore = (aiRes && aiRes.ok) ? aiRes.data.risk : 0;
    const combinedScore = Math.max(ruleScore, aiScore);

    let level = 'low';
    if (combinedScore >= 70) level = 'high';
    else if (combinedScore >= 40) level = 'medium';

    console.log(`Verdicts for ${file.name}: Rule Score=${ruleScore}, AI Score=${aiScore}, Final Level=${level}`);

    // Verify requirements: Scams must not be Low, safe must not be High
    if (file.expectScam && level === 'low') {
      throw new Error(`FAILURE: ${file.name} was expected to be scam but got verdict "low"`);
    }
    if (!file.expectScam && level === 'high') {
      throw new Error(`FAILURE: ${file.name} was expected to be safe but got verdict "high"`);
    }

    results.push({
      name: file.name,
      ok: true,
      readability: ocrResult.data.readability,
      extractedSnippet: extractedText.slice(0, 80).replace(/\s+/g, ' '),
      score: combinedScore,
      level,
      status: 'PASS'
    });
  }

  console.log(`\n========================================`);
  console.log(`LIVE AI CHECK COMPLETED (${totalLiveCalls} calls total)`);
  console.log(`Vision Model: ${modelUsed}`);
  console.table(results.map(r => ({ File: r.name, Level: r.level, Score: r.score, Readability: r.readability, Status: r.status })));
  console.log(`========================================`);
}

if (require.main === module) {
  runLiveCheck().catch(err => {
    console.error('Live AI check error:', err);
    process.exit(1);
  });
}

module.exports = { runLiveCheck };

