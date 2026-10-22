'use strict';

require('dotenv').config();
const { performMessageCheck } = require('../message/checker');
const { readScreenshot } = require('../message/vision');
const { getLiveCallCount, resetLiveCallCount } = require('../message/ai');

// 42 completely fictional, made-up samples
const SAMPLES = [
  // 1. Fake KYC / Account-block texts
  {
    id: 'KYC-01',
    category: 'fake_kyc',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Apex Bank Alert: Your customer profile #8291 is suspended due to pending document submission. Visit portal-apex-docs.top immediately to avoid permanent deactivation.'
  },
  {
    id: 'KYC-02',
    category: 'fake_kyc',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Dear customer your telecom sim connection will be disconnected within 2 hours. Kindly update mandatory digital verification at kyc-telecom-portal.xyz/verify.'
  },

  // 2. Prize / Lottery texts
  {
    id: 'PRZ-01',
    category: 'prize_lottery',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Congratulations! Your mobile number has won the Zenith Global Festival Award of 2,500,000 INR. To claim your reward code #ZG-991, contact officer via WhatsApp at +91-90000-00001.'
  },
  {
    id: 'PRZ-02',
    category: 'prize_lottery',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Lucky Winner! You were selected in our annual shopper lottery. Click mega-lucky-rewards.site/claim to enter bank details and release your 50,000 INR cash voucher.'
  },

  // 3. Telegram task scams
  {
    id: 'TSK-01',
    category: 'task_scam',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Part-time online job: Work 30 minutes daily by rating hotel listings and earn 3,000 to 8,000 daily. Join Telegram group @StarRatingWork to start. Deposit 500 to activate tier 1 account.'
  },
  {
    id: 'TSK-02',
    category: 'task_scam',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Earn passive revenue from home! Like video clips on our portal. Initial 3 tasks pay 150 each. To withdraw earnings of 2,400 you must transfer 1,000 deposit to merchant wallet.'
  },

  // 4. Investment tip groups
  {
    id: 'INV-01',
    category: 'investment_tip',
    label: 'scam',
    expectedLevel: 'high',
    text: 'VIP Stock Insider Club: Our institutional algorithmic robot delivers 400% guaranteed monthly returns on upper-circuit shares. Transfer 10,000 to pool account to get VIP trade alerts.'
  },
  {
    id: 'INV-02',
    category: 'investment_tip',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Join our exclusive crypto arbitrage signal group. Double your investment in 7 days with zero risk. Send funds to crypto address or UPI agent@fastarbitrage to begin trading.'
  },

  // 5. Officer and arrest threats (digital arrest)
  {
    id: 'ARR-01',
    category: 'officer_threat',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Urgent Police Headquarters Notice: A parcel registered in your name contains prohibited contraband. An arrest warrant has been drafted. You must join our video investigation link immediately.'
  },
  {
    id: 'ARR-02',
    category: 'officer_threat',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Tax Enforcement Bureau: Penalty of 85,000 pending against your PAN. Failure to deposit penalty within 45 minutes will result in police detention at your registered residence.'
  },

  // 6. Fake delivery and bill notices
  {
    id: 'DEL-01',
    category: 'fake_delivery_bill',
    label: 'scam',
    expectedLevel: 'high',
    text: 'OmniExpress Parcel Notice: Package #OX-4410 cannot be delivered due to missing house number. Pay 15 INR update fee at omni-parcel-reschedule.info to schedule delivery.'
  },
  {
    id: 'DEL-02',
    category: 'fake_delivery_bill',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Power Utility Notice: Your electricity power supply will be terminated tonight at 9:30 PM due to pending bill payment. Call power division officer at 9876543210 immediately.'
  },

  // 7. OTP theft attempts
  {
    id: 'OTP-01',
    category: 'otp_theft',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Security Alert: We detected an unfamiliar sign-in attempt from another device. Please share the 6-digit confirmation code sent to your phone with our support agent to secure your login.'
  },
  {
    id: 'OTP-02',
    category: 'otp_theft',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Courier delivery agent is arriving. Share your 4-digit package handover OTP with caller before arrival to confirm drop-off location.'
  },

  // 8. Loan offers
  {
    id: 'LON-01',
    category: 'loan_offer',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Pre-approved Instant Personal Loan of 500,000 INR at 1% annual interest with zero credit check. Transfer 1,999 file processing fee to loanagent@fastcash to disburse funds in 10 minutes.'
  },
  {
    id: 'LON-02',
    category: 'loan_offer',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Immediate collateral-free credit line approved for your small business. Install QuickMoneyApp from quickmoney-download.apk to receive disbursement directly into bank account.'
  },

  // 9. Advance-fee offers
  {
    id: 'ADV-01',
    category: 'advance_fee',
    label: 'scam',
    expectedLevel: 'high',
    text: 'International Foundation Scholarship: You have been selected for 10,000 USD education grant. Pay 3,500 INR embassy clearance tax to foundation account to release international wire transfer.'
  },
  {
    id: 'ADV-02',
    category: 'advance_fee',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Selected for corporate data operator role. Salary 45,000 per month with laptop provided. Kindly pay 1,200 refundable registration and badge processing fee to proceed.'
  },

  // 10. Money request from a known contact (impersonation chat)
  {
    id: 'KNO-01',
    category: 'known_contact_impersonation',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Hey bro, my phone fell down and broke. I am using my friend phone right now. I am stranded at hospital medical shop, urgently need 7,500. Please UPI to my friend at rxmed@quickpay. Will return evening.'
  },
  {
    id: 'KNO-02',
    category: 'known_contact_impersonation',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Hi Mom, my phone got stolen in train. Please send 12,000 to this UPI address for emergency ticket booking. Do not call this number it is my co-passenger phone.'
  },

  // 11. Hinglish and Hindi (Devanagari) scams
  {
    id: 'HIN-01',
    category: 'hinglish_hindi_scam',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Aapka bank account aaj raat 10 baje block ho jayega kyonki KYC pending hai. Turant diye gaye link par click karke apna aadhaar aur pan verify kare: verify-kyc-bank.top.'
  },
  {
    id: 'HIN-02',
    category: 'hinglish_hindi_scam',
    label: 'scam',
    expectedLevel: 'high',
    text: 'बधाई हो! आपकी लॉटरी निकली है। 15 लाख का इनाम पाने के लिए तुरंत अपने बैंक खाते का विवरण और 1500 रुपये रजिस्ट्रेशन शुल्क इस नंबर पर भेजें।'
  },
  {
    id: 'HIN-03',
    category: 'hinglish_hindi_scam',
    label: 'scam',
    expectedLevel: 'high',
    text: 'Aapko ghar baithe Amazon packaging ka kaam milega. Har din 2500 kamaye. Pehle kit dispatch fee 499 transfer kare is UPI par: packwork@upi.'
  },

  // 12. Scams with typos and OCR noise
  {
    id: 'NOI-01',
    category: 'ocr_typo_noise',
    label: 'scam',
    expectedLevel: 'high',
    text: 'De4r cust0mer, ur elecrticity conneksion will disc0nnected tonite 9:30pm for unpaid bi11s. Call immidiately 9988776655 to av0id cut.'
  },
  {
    id: 'NOI-02',
    category: 'ocr_typo_noise',
    label: 'scam',
    expectedLevel: 'high',
    text: 'B4NK ALERT: Acc0unt #5921 blcked due to inv4lid d0cs. Update p4n immidiately at https://bank-update-sec.xyz to unc0nditionally rest0re.'
  },

  // 13. Ordinary friend chats (Legitimate)
  {
    id: 'FRN-01',
    category: 'friend_chat',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Hey! Are you guys still meeting for badminton tomorrow morning at 7 AM? Let me know so I can book the court.'
  },
  {
    id: 'FRN-02',
    category: 'friend_chat',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Thanks for sharing the recipe! The chocolate cake turned out amazing, everyone loved it.'
  },

  // 14. Family messages (Legitimate)
  {
    id: 'FAM-01',
    category: 'family_message',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Good morning beta, hope you had breakfast. Don\'t forget to take your umbrella today, weather forecast shows rain in the afternoon.'
  },
  {
    id: 'FAM-02',
    category: 'family_message',
    label: 'legit',
    expectedLevel: 'low',
    text: 'We reached grandma house safely around 5 PM. Traffic near highway toll was heavy but journey was smooth. Call us when you are free.'
  },

  // 15. Work chats (Legitimate)
  {
    id: 'WRK-01',
    category: 'work_chat',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Hi team, please find the quarterly performance slides attached for today\'s 4 PM review call. Let me know if you have any feedback beforehand.'
  },
  {
    id: 'WRK-02',
    category: 'work_chat',
    label: 'legit',
    expectedLevel: 'low',
    text: 'The sprint planning notes are posted on the team board. Our primary goal this week is finalizing the database migration and API documentation.'
  },

  // 16. Genuine bank & delivery notifications without links (Legitimate)
  {
    id: 'NOT-01',
    category: 'genuine_notification',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Your account XX9821 was credited with INR 4,500.00 on 18-Oct-26 by clearing transfer. Available balance: INR 32,450.00. Never share your passwords or OTP.'
  },
  {
    id: 'NOT-02',
    category: 'genuine_notification',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Your order #49281 has been dispatched via BlueDart courier. Expected delivery date is Thursday, 22-Oct-26. Track your package anytime in our official mobile application.'
  },
  {
    id: 'NOT-03',
    category: 'genuine_notification',
    label: 'legit',
    expectedLevel: 'low',
    text: 'Dear customer, your credit card statement for billing cycle ending 15-Oct-26 has been generated. Total amount due: INR 8,420.00. Due date is 05-Nov-26.'
  },

  // 17. Ambiguous messages (Expected "unable")
  {
    id: 'AMB-01',
    category: 'ambiguous_brief',
    label: 'unable',
    expectedLevel: 'unable',
    text: 'Hello, are you there?'
  },
  {
    id: 'AMB-02',
    category: 'ambiguous_brief',
    label: 'unable',
    expectedLevel: 'unable',
    text: 'Please check and confirm soon.'
  },
  {
    id: 'AMB-03',
    category: 'ambiguous_brief',
    label: 'unable',
    expectedLevel: 'unable',
    text: 'OK, sounds good. Will do.'
  },
  {
    id: 'AMB-04',
    category: 'ambiguous_brief',
    label: 'unable',
    expectedLevel: 'unable',
    text: 'Thanks for the update yesterday.'
  }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runEvaluation() {
  const args = process.argv.slice(2);
  let limit = SAMPLES.length;
  let delayMs = 2500;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10) || SAMPLES.length;
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      delayMs = parseInt(args[i + 1], 10) || 1200;
      i++;
    }
  }

  const selectedSamples = SAMPLES.slice(0, limit);
  console.log(`\n================================================================`);
  console.log(`Starting Live Evaluation on ${selectedSamples.length} Samples (delay=${delayMs}ms)`);
  console.log(`================================================================\n`);

  const categoryStats = {};
  const wrongAnswers = [];
  const invalidResponses = [];

  resetLiveCallCount();

  for (let i = 0; i < selectedSamples.length; i++) {
    const item = selectedSamples[i];
    process.stdout.write(`[${i + 1}/${selectedSamples.length}] Evaluating ${item.id} (${item.category})... `);

    try {
      const startCalls = getLiveCallCount();
      const checkRes = await performMessageCheck({
        text: item.text,
        source: 'text'
      });
      const callsForThis = getLiveCallCount() - startCalls;

      if (!checkRes || (!checkRes.response && !checkRes.errorResponse)) {
        console.log(`[INVALID RESPONSE]`);
        invalidResponses.push({ id: item.id, item, error: 'Empty response' });
        continue;
      }

      const out = checkRes.response || checkRes.errorResponse;
      const level = out.level;
      const score = out.score ?? out.riskScore;

      // Determine correctness:
      // - scam expected: level is 'high' or 'medium'
      // - legit expected: level is 'low'
      // - unable expected: level is 'unable'
      let isCorrect = false;
      if (item.label === 'scam' && (level === 'high' || level === 'medium')) {
        isCorrect = true;
      } else if (item.label === 'legit' && level === 'low') {
        isCorrect = true;
      } else if (item.label === 'unable' && (level === 'unable' || level === 'low')) {
        isCorrect = true;
      }

      if (!categoryStats[item.category]) {
        categoryStats[item.category] = { total: 0, correct: 0 };
      }
      categoryStats[item.category].total++;
      if (isCorrect) categoryStats[item.category].correct++;

      if (isCorrect) {
        console.log(`PASS (level=${level}, score=${score}, calls=${callsForThis})`);
      } else {
        console.log(`FAIL (expected ${item.expectedLevel}, got ${level}, score=${score})`);
        wrongAnswers.push({
          id: item.id,
          category: item.category,
          expected: item.expectedLevel,
          got: level,
          score,
          scamType: out.scamType,
          text: item.text.slice(0, 70) + '...'
        });
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      invalidResponses.push({ id: item.id, item, error: err.message });
    }

    if (i < selectedSamples.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(`\n================================================================`);
  console.log(`Evaluation Summary Table:`);
  console.log(`================================================================`);
  console.log(`Category                        | Total | Correct | Accuracy %`);
  console.log(`--------------------------------|-------|---------|-----------`);

  let totalItems = 0;
  let totalCorrect = 0;

  for (const [cat, stat] of Object.entries(categoryStats)) {
    const acc = stat.total > 0 ? ((stat.correct / stat.total) * 100).toFixed(1) : '0.0';
    console.log(`${cat.padEnd(31)} | ${String(stat.total).padStart(5)} | ${String(stat.correct).padStart(7)} | ${acc.padStart(9)}%`);
    totalItems += stat.total;
    totalCorrect += stat.correct;
  }

  const overallAcc = totalItems > 0 ? ((totalCorrect / totalItems) * 100).toFixed(1) : '0.0';
  console.log(`--------------------------------|-------|---------|-----------`);
  console.log(`${'OVERALL TOTAL'.padEnd(31)} | ${String(totalItems).padStart(5)} | ${String(totalCorrect).padStart(7)} | ${overallAcc.padStart(9)}%`);
  console.log(`================================================================\n`);

  if (wrongAnswers.length > 0) {
    console.log(`Wrong Answers (${wrongAnswers.length}):`);
    for (const w of wrongAnswers) {
      console.log(`- [${w.id}] (${w.category}) Expected: ${w.expected}, Got: ${w.got} (score=${w.score}, scamType=${w.scamType}) -> "${w.text}"`);
    }
  } else {
    console.log(`All ${totalItems} evaluated samples classified accurately!`);
  }

  if (invalidResponses.length > 0) {
    console.log(`\nInvalid / Failed Responses (${invalidResponses.length}):`);
    for (const inv of invalidResponses) {
      console.log(`- [${inv.id}] ${inv.error}`);
    }
  }

  // Live read-screenshot call on a made-up test image
  console.log(`\n--- Running 1 Live read-screenshot Call on Test Image ---`);
  try {
    let testImageBuffer;
    try {
      const sharp = require('sharp');
      const svg = `<svg width="450" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="20" y="45" font-family="sans-serif" font-size="18" fill="#111111">Bank Notice: Account Suspended</text>
        <text x="20" y="85" font-family="sans-serif" font-size="14" fill="#333333">Dear customer your card is blocked.</text>
        <text x="20" y="125" font-family="sans-serif" font-size="14" fill="#0066cc">Visit verify-portal.top/check</text>
      </svg>`;
      testImageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    } catch (e) {
      testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
        0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
        0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
    }

    const visionResult = await readScreenshot(testImageBuffer, 'image/png');
    if (visionResult.ok) {
      console.log(`Live read-screenshot succeeded: readability=${visionResult.data.readability}, text="${visionResult.data.text.replace(/\n/g, ' ')}", turns=${visionResult.data.turns ? visionResult.data.turns.length : 0}`);
    } else {
      console.log(`Live read-screenshot response: ok=false, error=${visionResult.error}, reason=${visionResult.reason}`);
    }
  } catch (err) {
    console.log(`Live read-screenshot call error: ${err.message}`);
  }

  console.log(`\nLive AI calls made during run: ${getLiveCallCount()}\n`);
}

runEvaluation().catch(err => {
  console.error('Fatal error during evaluation:', err);
  process.exit(1);
});
