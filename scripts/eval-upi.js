'use strict';

require('dotenv').config();
const { performUpiCheck } = require('../upi/checker');
const { getLiveCallCount, resetLiveCallCount } = require('../upi/ai');
const { getAnalysisModel, getVisionModel } = require('../upi/config');

const SAMPLES = [
  // 1. Routine payments (Expected: low)
  {
    id: 'routine_rent',
    category: 'routine_payment',
    expected: 'low',
    text: 'Hi Ravi, here is the ₹18,500 rent for October for Flat 302. Transferred to ravi.kumar@hdfcbank.'
  },
  {
    id: 'routine_dinner_split',
    category: 'routine_payment',
    expected: 'low',
    text: 'Split for Friday dinner at Chili\'s was ₹840 each. Pay to arjun@okaxis when you get a chance.'
  },
  {
    id: 'routine_electricity_bill',
    category: 'routine_payment',
    expected: 'low',
    text: 'Electricity bill of Rs. 1420 paid successfully for consumer 10293847 via BESCOM portal. Transaction reference 49201938.'
  },
  {
    id: 'routine_freelance_invoice',
    category: 'routine_payment',
    expected: 'low',
    text: 'Invoice #104 for UI design work completed in September: ₹45,000 payable to designstudio@icici.'
  },
  {
    id: 'routine_groceries',
    category: 'routine_payment',
    expected: 'low',
    text: 'Grocery order total ₹620. Paid to store.bigbazaar@okaxis at checkout counter 4.'
  },
  {
    id: 'routine_wifi_bill',
    category: 'routine_payment',
    expected: 'low',
    text: 'Airtel Xstream Fiber bill of ₹1179 for account 0801234567 paid via auto-pay on 12-Oct-2026.'
  },
  {
    id: 'routine_household_help',
    category: 'routine_payment',
    expected: 'low',
    text: 'Salary of ₹6000 for household help Shanti for October paid to shanti92@sbi.'
  },
  {
    id: 'routine_tuition_fee',
    category: 'routine_payment',
    expected: 'low',
    text: 'Quarterly coaching fee ₹12,000 for class 10 mathematics sent to mathcoach@kotak.'
  },

  // 2. Pay-to-receive scams (Expected: high)
  {
    id: 'pay_to_receive_cashback_pin',
    category: 'pay_to_receive',
    expected: 'high',
    text: 'Congratulations! You won ₹25,000 cashback from PhonePe. To receive your cashback immediately, enter your 6-digit UPI PIN on the approval screen.'
  },
  {
    id: 'pay_to_receive_qr_credit',
    category: 'pay_to_receive',
    expected: 'high',
    text: 'I am sending ₹15,000 for your old sofa listed on OLX. Please scan this QR code on Google Pay to credit the amount to your account.'
  },
  {
    id: 'pay_to_receive_collect_refund',
    category: 'pay_to_receive',
    expected: 'high',
    text: 'Sir to receive the ₹5,000 company refund, please accept the collect request of ₹5,000 sent to your UPI ID and enter your PIN.'
  },
  {
    id: 'pay_to_receive_lottery_prize',
    category: 'pay_to_receive',
    expected: 'high',
    text: 'Your mobile number won ₹1,00,000 in KBC lottery lucky draw. Open GPay, enter UPI PIN to receive the prize money in your SBI account.'
  },
  {
    id: 'pay_to_receive_reward_points',
    category: 'pay_to_receive',
    expected: 'high',
    text: 'Reward points worth ₹8,450 expired. Click link to verify UPI PIN and claim cash directly into your bank balance.'
  },

  // 3. Fake payment proofs (Expected: high)
  {
    id: 'fake_proof_crypto_release',
    category: 'fake_payment_proof',
    expected: 'high',
    text: 'Buyer: Here is the screenshot of ₹50,000 sent via IMPS/UPI UTR 429103948291. Please release the USDT immediately on Binance! My bank said it takes 2 hours to reflect, do not delay release or I will report you.'
  },
  {
    id: 'fake_proof_olx_item',
    category: 'fake_payment_proof',
    expected: 'high',
    text: 'I have transferred ₹8,500 for the iPhone. See attached transfer receipt showing successful payment. Hand over the phone to my driver right now, he is waiting outside.'
  },
  {
    id: 'fake_proof_laptop_courier',
    category: 'fake_payment_proof',
    expected: 'high',
    text: 'Buyer: Payment of ₹34,000 done to your UPI ID rahul@okaxis. Transaction ID UPI/481920481028. Send courier tracking number right now, I need the laptop dispatched today.'
  },
  {
    id: 'fake_proof_jewellery_threat',
    category: 'fake_payment_proof',
    expected: 'high',
    text: 'Transfer complete ₹65,000. Why are you saying money not received? The screenshot clearly shows Paid Successfully! Deliver the gold ring now or I will file a police complaint.'
  },

  // 4. Bare payment receipts without chat context (Expected: unable)
  {
    id: 'bare_receipt_general_store',
    category: 'unverifiable_receipt',
    expected: 'unable',
    text: 'Paid to SHARMA GENERAL STORE ₹350. UPI Ref ID 429184719284. 14 Oct 2026, 03:22 PM. State Bank of India - 4821.'
  },
  {
    id: 'bare_receipt_gpay_electric',
    category: 'unverifiable_receipt',
    expected: 'unable',
    text: 'Google Pay. ₹2,400. Paid to Vijay Electric Works. Completed 12 Oct 2026. UPI transaction ID 428190382910. To: vijayelectric@okicici. From: HDFC Bank *1948.'
  },
  {
    id: 'bare_receipt_phonepe_pharmacy',
    category: 'unverifiable_receipt',
    expected: 'unable',
    text: 'PhonePe Transaction Successful. Paid ₹1,200 to Apollo Pharmacy. 15 Oct 2026 11:45 AM. UTR: 429104817291.'
  },
  {
    id: 'bare_receipt_paytm_rent',
    category: 'unverifiable_receipt',
    expected: 'unable',
    text: 'Paytm Payment Receipt: ₹5,000 paid to RENT ACCOUNT. Order ID: WALLET_481920. Reference: 429019283741.'
  },

  // 5. Refund traps / accidental transfer claims (Expected: high)
  {
    id: 'refund_trap_medical_emergency',
    category: 'overpayment_trap',
    expected: 'high',
    text: 'Hello brother, I sent ₹20,000 to your UPI ID by mistake instead of my sister\'s medical bill. Please refund ₹20,000 urgently to my wife\'s UPI emergency98@paytm, she is in hospital!'
  },
  {
    id: 'refund_trap_double_credit',
    category: 'overpayment_trap',
    expected: 'high',
    text: 'Sir our accounts department mistakenly credited ₹15,000 twice to your account. You must return ₹15,000 immediately to hr.refund@ybl or your account will be frozen.'
  },
  {
    id: 'refund_trap_advance_token',
    category: 'overpayment_trap',
    expected: 'high',
    text: 'Hi, I accidentally sent ₹50,000 instead of ₹5,000 for your advance token. Please reverse ₹45,000 back right now to my GPay number 9876543210.'
  },

  // 6. Advance fee / registration fee (Expected: high)
  {
    id: 'advance_fee_data_entry_job',
    category: 'advance_fee',
    expected: 'high',
    text: 'Congratulations, you are selected for Part-time Data Entry job with daily salary ₹3,000. To activate your employee portal, pay one-time refundable registration fee of ₹1,499 to hr.onboarding@okaxis.'
  },
  {
    id: 'advance_fee_preapproved_loan',
    category: 'advance_fee',
    expected: 'high',
    text: 'Your Pre-approved personal loan of ₹5,00,000 is approved at 2% interest. Transfer processing and insurance fee ₹4,850 to loanapproval@indus to disburse funds in 30 minutes.'
  },
  {
    id: 'advance_fee_airport_customs',
    category: 'advance_fee',
    expected: 'high',
    text: 'Your international FedEx parcel containing iPhone 16 Pro and £5,000 cash is held at Delhi airport. Pay customs clearance duty ₹9,800 to custom.clearing@sbi immediately to avoid arrest.'
  },
  {
    id: 'advance_fee_indiapost_redelivery',
    category: 'advance_fee',
    expected: 'high',
    text: 'India Post Notice: Your consignment could not be delivered due to address mismatch. Update address and pay ₹25 redelivery charge at http://indiapost-update.xyz/pay.'
  },

  // 7. Ambiguous / insufficient context (Expected: medium or unable)
  {
    id: 'ambiguous_sending_money',
    category: 'ambiguous',
    expected: ['medium', 'unable', 'low'],
    text: 'I am sending the payment right now, please check your phone in five minutes.'
  },
  {
    id: 'ambiguous_phone_query',
    category: 'ambiguous',
    expected: ['medium', 'unable', 'low'],
    text: 'Call me regarding payment at 9876543210 when you are free today.'
  },
  {
    id: 'ambiguous_thanks_receipt',
    category: 'ambiguous',
    expected: ['low', 'unable'],
    text: 'Thanks for the payment received earlier today. Have a great weekend!'
  },
  {
    id: 'ambiguous_upi_only',
    category: 'ambiguous',
    expected: ['low', 'unable', 'medium'],
    text: 'My UPI ID is suresh.payments@okaxis. Let me know once done.'
  }
];

async function runEvaluation() {
  console.log('=== UPI & Payment Security Evaluation ===\n');

  const args = process.argv.slice(2);
  let limit = SAMPLES.length;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || SAMPLES.length;
  }

  // Ensure key benchmark samples are always included even with --limit
  let testSet = SAMPLES;
  if (limit < SAMPLES.length) {
    const keySamples = [
      'fake_proof_crypto_release',
      'bare_receipt_general_store',
      'routine_rent',
      'pay_to_receive_cashback_pin',
      'refund_trap_medical_emergency',
      'advance_fee_data_entry_job'
    ];
    const pickedKeys = SAMPLES.filter(s => keySamples.includes(s.id));
    const remainder = SAMPLES.filter(s => !keySamples.includes(s.id)).slice(0, Math.max(0, limit - pickedKeys.length));
    testSet = [...pickedKeys, ...remainder].slice(0, limit);
  }

  console.log(`Running evaluation on ${testSet.length} samples (Analysis Model: ${getAnalysisModel()})...\n`);

  let correctCount = 0;
  let falsePositives = 0; // Routine payment classified as high
  let totalLatencyMs = 0;
  resetLiveCallCount();

  let fakeProofOutput = null;
  let bareReceiptOutput = null;

  const resultsTable = [];

  for (const sample of testSet) {
    const t0 = Date.now();
    const res = await performUpiCheck({
      text: sample.text,
      source: 'pasted'
    });
    const duration = Date.now() - t0;
    totalLatencyMs += duration;

    const actualLevel = res.isUnavailable ? 'unable' : res.response.level;
    const isExpected = Array.isArray(sample.expected)
      ? sample.expected.includes(actualLevel)
      : sample.expected === actualLevel;

    if (isExpected) {
      correctCount++;
    }

    if (sample.category === 'routine_payment' && actualLevel === 'high') {
      falsePositives++;
    }

    if (sample.id === 'fake_proof_crypto_release') {
      fakeProofOutput = res.response;
    }
    if (sample.id === 'bare_receipt_general_store') {
      bareReceiptOutput = res.response;
    }

    resultsTable.push({
      ID: sample.id,
      Category: sample.category,
      Expected: Array.isArray(sample.expected) ? sample.expected.join('|') : sample.expected,
      Actual: actualLevel,
      Score: res.response ? res.response.score : null,
      Conf: res.response ? res.response.confidence : 0,
      Ms: duration,
      Match: isExpected ? 'PASS' : 'FAIL'
    });

    // Pacing to stay within free-tier API rate limits
    await new Promise(r => setTimeout(r, 1200));
  }

  const accuracyPct = ((correctCount / testSet.length) * 100).toFixed(1);
  const avgLatency = Math.round(totalLatencyMs / testSet.length);
  const callsPerCheck = (getLiveCallCount() / testSet.length).toFixed(1);

  console.table(resultsTable.map(r => ({
    ID: r.ID,
    Expected: r.Expected,
    Actual: r.Actual,
    Score: r.Score,
    Conf: r.Conf,
    Result: r.Match
  })));

  console.log('\n--- Evaluation Metrics ---');
  console.log(`Total Samples: ${testSet.length}`);
  console.log(`Accuracy: ${accuracyPct}% (${correctCount}/${testSet.length})`);
  console.log(`False Positives (Routine->High): ${falsePositives}`);
  console.log(`Average Latency: ${avgLatency}ms`);
  console.log(`Live AI Calls Per Check: ${callsPerCheck}`);

  // Assertions for key samples
  console.log('\n--- Benchmark Assertions ---');
  if (fakeProofOutput) {
    const isHigh = fakeProofOutput.level === 'high';
    console.log(`Assertion 1 (Fake Payment Proof Chat -> High): ${isHigh ? 'PASS' : 'FAIL'} (${fakeProofOutput.level})`);
  }
  if (bareReceiptOutput) {
    const isUnable = bareReceiptOutput.level === 'unable';
    console.log(`Assertion 2 (Bare Receipt Text Alone -> Unable): ${isUnable ? 'PASS' : 'FAIL'} (${bareReceiptOutput.level})`);
  }

  console.log('\n--- Sample 1: Fake Payment Proof Chat Output ---');
  console.log(JSON.stringify(fakeProofOutput, null, 2));

  console.log('\n--- Sample 2: Bare Receipt Text Output ---');
  console.log(JSON.stringify(bareReceiptOutput, null, 2));
}

runEvaluation().catch(err => {
  console.error('Evaluation run failed:', err);
  process.exit(1);
});
