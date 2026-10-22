const fs = require('fs');
const path = require('path');
const { checkUrl, checkDesc, checkCompany, checkRecruiter, checkSecurity, combine } = require('../checks.js');

const datasetPath = path.join(__dirname, 'dataset.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

const splitArg = process.argv[2] || 'all';

const items = dataset.filter(d => splitArg === 'all' || d.split === splitArg);

let scamTotal = 0;
let scamCaught = 0;
let legitTotal = 0;
let legitFalseAlarm = 0;
let unknowns = 0;
const wrongItems = [];

for (const item of items) {
  const ev = item.evidence || {};
  const checks = [
    checkUrl(item),
    checkDesc(item),
    checkCompany(item, ev),
    checkRecruiter(item, ev),
    checkSecurity(item, ev)
  ];
  
  const overall = combine(checks);
  
  if (overall.level === 'unknown') {
    unknowns++;
    wrongItems.push({ id: item.id, item, checks, expected: item.label, level: overall.level, score: overall.score });
    if (item.label === 'scam') scamTotal++;
    if (item.label === 'legit') legitTotal++;
    continue;
  }
  
  if (item.label === 'scam') {
    scamTotal++;
    if (overall.level === 'medium' || overall.level === 'high') {
      scamCaught++;
    } else {
      wrongItems.push({ id: item.id, item, checks, expected: item.label, level: overall.level, score: overall.score });
    }
  } else if (item.label === 'legit') {
    legitTotal++;
    if (overall.level === 'low') {
      // correct
    } else {
      legitFalseAlarm++;
      wrongItems.push({ id: item.id, item, checks, expected: item.label, level: overall.level, score: overall.score });
    }
  }
}

const scamCatchRate = scamTotal > 0 ? ((scamCaught / scamTotal) * 100).toFixed(2) : '0.00';
const falseAlarmRate = legitTotal > 0 ? ((legitFalseAlarm / legitTotal) * 100).toFixed(2) : '0.00';

console.log(`--- Accuracy Test Results (${splitArg}) ---`);
console.log(`Total items evaluated: ${items.length}`);
console.log(`Scam catch rate: ${scamCatchRate}% (${scamCaught}/${scamTotal})`);
console.log(`False alarm rate on legit: ${falseAlarmRate}% (${legitFalseAlarm}/${legitTotal})`);
console.log(`Unknowns: ${unknowns}`);

if (wrongItems.length > 0) {
  console.log(`\nWrong items:`);
  wrongItems.forEach(i => {
    console.log(`\n======================================================`);
    console.log(`ID: ${i.id} | Expected: ${i.expected} | Level: ${i.level} | Score: ${i.score}`);
    console.log(`URL: ${i.item.url || 'none'}`);
    console.log(`Company: ${i.item.company || 'none'}`);
    console.log(`Email: ${i.item.email || 'none'}`);
    let desc = i.item.desc || '';
    if (desc.length > 300) desc = desc.slice(0, 300) + '...';
    console.log(`Desc: ${desc.replace(/\n/g, ' ')}`);
    console.log(`Findings:`);
    i.checks.forEach(c => {
      if (!c.notes) return;
      c.notes.forEach(n => {
        const hardFlag = (n.h || n.hard) ? ' [HARD]' : '';
        console.log(`- [${c.key}] ${n.s.toUpperCase()}: ${n.t}${hardFlag}`);
      });
    });
    console.log(`======================================================`);
  });
} else {
  console.log(`\nNo wrong items!`);
}

