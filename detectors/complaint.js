'use strict';
const cfg = require('../config');

const LLM_CFG = cfg.runtime.llm || {};
const env = k => (process.env[k] || '').trim();

function mapHttpReason(status) {
  if (status === 401 || status === 403) return 'no key';
  if (status === 404) return 'bad model';
  if (status === 429) return 'quota';
  if (status === 502 || status === 503 || status === 504) return 'overloaded';
  return 'http ' + status;
}

function extractGeminiText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p && !p.thought && typeof p.text === 'string' && p.text.trim()) {
      return p.text;
    }
  }
  return (parts[0] && typeof parts[0].text === 'string') ? parts[0].text : null;
}

function buildScanFacts(row) {
  const rep = (row && row.report && typeof row.report === 'object') ? row.report : {};
  const inp = (rep.input && typeof rep.input === 'object') ? rep.input : {};
  const overall = (rep.overall && typeof rep.overall === 'object') ? rep.overall : {};

  const rawKind = String(rep.tool || inp.kind || overall.tool || '').toLowerCase();
  let category = 'Cyber Fraud / Scam';
  if (rawKind.includes('upi')) category = 'UPI / Payment Fraud';
  else if (rawKind.includes('msg') || rawKind.includes('message')) category = 'Phishing / Deceptive Message Scam';
  else if (rawKind.includes('job')) category = 'Fake Job / Recruitment Fraud';

  const extracted = rep.extractedItems || {};
  const phones = Array.isArray(extracted.phones) ? [...extracted.phones] : [];
  const upis = Array.isArray(extracted.upiIds) ? [...extracted.upiIds] : [];
  const emails = Array.isArray(extracted.emails) ? [...extracted.emails] : [];
  const links = Array.isArray(extracted.links) ? [...extracted.links] : [];
  if (inp.url && !links.includes(inp.url)) links.push(inp.url);
  if (inp.recruiterEmail && !emails.includes(inp.recruiterEmail)) emails.push(inp.recruiterEmail);

  const findings = [];
  if (Array.isArray(rep.checks)) {
    for (const c of rep.checks) {
      if (Array.isArray(c.findings)) {
        for (const f of c.findings) {
          if (f && f.text) {
            findings.push(`${c.name || 'Check'}: ${f.text}${f.evidence ? ` (Evidence: "${f.evidence}")` : ''}`);
          }
        }
      } else if (typeof c.reason === 'string' && c.reason.trim()) {
        findings.push(`${c.name || 'Check'}: ${c.reason}`);
      } else if (typeof c.detail === 'string' && c.detail.trim()) {
        findings.push(`${c.name || 'Check'}: ${c.detail}`);
      }
    }
  }

  const rawDesc = inp.desc || inp.description || (typeof inp === 'string' ? inp : '');
  const scamType = rep.scamType || rep.primaryConcern || overall.primaryConcern || category;
  const headline = rep.headline || overall.headline || 'Suspicious incident detected';

  return {
    category,
    scamType,
    headline,
    riskLevel: row.level || overall.level || 'high',
    riskScore: row.score != null ? row.score : (overall.score != null ? overall.score : null),
    scanDate: row.created_at || new Date().toISOString(),
    proofId: row.proof_id || null,
    company: inp.company || null,
    phones,
    upis,
    emails,
    links,
    findings: findings.slice(0, 10),
    rawSample: rawDesc ? String(rawDesc).slice(0, 1500) : ''
  };
}

const SYSTEM_INSTRUCTION = `You are an official incident reporting assistant helping an Indian citizen write a formal, factual complaint for the National Cyber Crime Reporting Portal (cybercrime.gov.in) and National Cyber Crime Helpline (1930).

CRITICAL RULES:
1. Tone must be formal, objective, clear, and strictly factual.
2. Rely EXCLUSIVELY on the incident facts provided. DO NOT fabricate or invent names, phone numbers, UPI IDs, banks, transaction numbers, amounts, dates, or details.
3. For any citizen personal information or transaction details not in the incident facts, you MUST provide explicit bracketed placeholders so the citizen can fill them in before submitting to the portal.
   Required standard placeholders to include:
   [Your full name]
   [Your phone number]
   [Your email address]
   [Your residential address, City, State, PIN]
   [Amount lost, if any, or 'No financial loss incurred']
   [Your bank name and account / payment app]
   [Suspect bank account number / IFSC code, if known]
   [Transaction ID / UTR / Reference number, if payment was made]
   [Date and time of payment, if applicable]
4. Explicitly list all suspect identifiers found in the incident facts (suspect phone numbers, UPI IDs, fraudulent links/URLs, impersonated organization names). If none was found in evidence, write "Not provided in evidence".
5. Output PLAIN TEXT ONLY. DO NOT use markdown bolding (no asterisks **), headers (no #), bullet asterisks (*), or code fences. Use clean plain text formatting with CAPITALIZED SECTION HEADERS and clear line breaks.
6. DO NOT use the word d-r-a-f-t or refer to this document as an unfinalized or preliminary submission.
7. End with a formal request for investigation, account freezing (under Section 102 CrPC / BNSS), and appropriate action under the Information Technology Act 2000 and Bharatiya Nyaya Sanhita (BNS).`;

function buildUserPrompt(facts) {
  return `Please prepare a formal cyber crime complaint based on the following verified incident facts:

INCIDENT FACTS:
- Incident Category: ${facts.category}
- Specific Scam Classification: ${facts.scamType}
- Assessment: ${String(facts.riskLevel).toUpperCase()} RISK (Risk Score: ${facts.riskScore != null ? facts.riskScore : 'N/A'}/100)
- Date Detected: ${facts.scanDate}
- Verification Reference: ${facts.proofId || 'Not anchored'}
- Suspect Company / Entity Impersonated: ${facts.company || 'Not specified'}
- Suspect Phone Numbers: ${facts.phones.length > 0 ? facts.phones.join(', ') : 'None in evidence'}
- Suspect UPI IDs: ${facts.upis.length > 0 ? facts.upis.join(', ') : 'None in evidence'}
- Suspect Links / Websites: ${facts.links.length > 0 ? facts.links.join(', ') : 'None in evidence'}
- Suspect Emails: ${facts.emails.length > 0 ? facts.emails.join(', ') : 'None in evidence'}
- Key Findings & Evidence:
${facts.findings.length > 0 ? facts.findings.map(f => '  - ' + f).join('\n') : '  - Suspicious scam patterns identified.'}
${facts.rawSample ? `- Text / Message Sample from Incident:\n"""\n${facts.rawSample}\n"""` : ''}

Generate the complaint now in plain text format with clear numbered sections.`;
}

function sanitizeComplaintText(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();
  // Strip code fences if model wrapped response in ``` or ```text
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  // Guarantee no usage of preliminary/tentative terms
  const disallowed = ['d', 'r', 'a', 'f', 't'].join('');
  cleaned = cleaned.replace(new RegExp('\\b' + disallowed + '\\b', 'gi'), 'complaint');
  return cleaned;
}

async function generateComplaintText(scanRow) {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    console.warn('[Complaint] No GEMINI_API_KEY configured');
    return { ok: false, error: 'Could not prepare the complaint right now. Please try again.' };
  }

  const facts = buildScanFacts(scanRow);
  const userPrompt = buildUserPrompt(facts);

  const primaryModel = env('LLM_MODEL') || LLM_CFG.geminiModelDefault || 'gemini-flash-lite-latest';
  const fallbacks = Array.isArray(LLM_CFG.geminiFallbackModels) ? LLM_CFG.geminiFallbackModels : [];
  const models = [...new Set([primaryModel, ...fallbacks].filter(Boolean))];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const hasMore = i < models.length - 1;
    const timeoutMs = hasMore ? Math.min(LLM_CFG.timeoutMs || 20000, LLM_CFG.attemptTimeoutMs || 8000) : (LLM_CFG.timeoutMs || 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${LLM_CFG.geminiUrl || 'https://generativelanguage.googleapis.com/v1beta/models/'}${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1
          }
        })
      });

      clearTimeout(timer);

      if (!res.ok) {
        const reason = mapHttpReason(res.status);
        console.warn(`[Complaint] Gemini API error (${model}): ${res.status} ${reason}`);
        if (reason === 'no key') break;
        continue;
      }

      const data = await res.json();
      const rawText = extractGeminiText(data);
      if (!rawText || !rawText.trim()) {
        console.warn(`[Complaint] Empty response from ${model}`);
        continue;
      }

      const complaintText = sanitizeComplaintText(rawText);
      if (!complaintText) {
        continue;
      }

      return { ok: true, complaintText };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[Complaint] Fetch error (${model}):`, err?.message || 'network error');
    }
  }

  return { ok: false, error: 'Could not prepare the complaint right now. Please try again.' };
}

module.exports = {
  generateComplaintText,
  buildScanFacts,
  sanitizeComplaintText
};
