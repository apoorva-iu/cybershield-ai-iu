'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '..', 'web', 'public', 'examples');

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSvg({ title, subtitle, messages, isScam, badgeText = 'Example' }) {
  const width = 800;
  const height = 1400;

  let messagesSvg = '';
  let curY = 220;

  for (const msg of messages) {
    const isOut = msg.align === 'right';
    const bubbleBg = isOut ? '#1e3a5f' : '#151f32';
    const bubbleBorder = isOut ? '#2b507d' : '#23334d';
    const bubbleWidth = msg.width || 620;
    const bubbleX = isOut ? width - bubbleWidth - 40 : 40;
    const bubbleHeight = msg.height || 160;

    let innerContent = '';
    let lineY = curY + 40;

    if (msg.forwarded) {
      innerContent += `
        <text x="${bubbleX + 24}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" font-style="italic">
          &#8618; Forwarded
        </text>
      `;
      lineY += 28;
    }

    if (msg.title) {
      innerContent += `
        <text x="${bubbleX + 24}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="${msg.titleColor || '#ffffff'}">
          ${escapeXml(msg.title)}
        </text>
      `;
      lineY += 32;
    }

    for (const line of msg.lines || []) {
      innerContent += `
        <text x="${bubbleX + 24}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="17" fill="#e2e8f0" font-weight="400">
          ${escapeXml(line)}
        </text>
      `;
      lineY += 28;
    }

    if (msg.button) {
      lineY += 8;
      innerContent += `
        <rect x="${bubbleX + 24}" y="${lineY}" width="${bubbleWidth - 48}" height="46" rx="8" fill="#c62828" />
        <text x="${bubbleX + bubbleWidth / 2}" y="${lineY + 28}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">
          ${escapeXml(msg.button)}
        </text>
      `;
      lineY += 60;
    }

    if (msg.time) {
      innerContent += `
        <text x="${bubbleX + bubbleWidth - 24}" y="${curY + bubbleHeight - 16}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#64748b" text-anchor="end">
          ${escapeXml(msg.time)}
        </text>
      `;
    }

    messagesSvg += `
      <g>
        <rect x="${bubbleX}" y="${curY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="16" fill="${bubbleBg}" stroke="${bubbleBorder}" stroke-width="1.5" />
        ${innerContent}
      </g>
    `;

    curY += bubbleHeight + 28;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070b14"/>
      <stop offset="100%" stop-color="#0a101d"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

  <!-- Device Status Bar Mock -->
  <g fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">
    <text x="50" y="36">09:41</text>
    <circle cx="710" cy="32" r="4" fill="#94a3b8"/>
    <circle cx="725" cy="32" r="4" fill="#94a3b8"/>
    <circle cx="740" cy="32" r="4" fill="#94a3b8"/>
    <rect x="755" y="24" width="22" height="13" rx="3" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <rect x="758" y="27" width="13" height="7" rx="1.5" fill="#94a3b8"/>
  </g>

  <!-- Top App Bar -->
  <rect x="0" y="58" width="${width}" height="100" fill="#0d1527" stroke="#1e293b" stroke-width="1"/>
  
  <!-- Back Arrow -->
  <path d="M 45 108 L 30 108 M 38 98 L 28 108 L 38 118" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  
  <!-- Avatar -->
  <circle cx="85" cy="108" r="24" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="85" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#4da3ff" text-anchor="middle">
    ${title.charAt(0).toUpperCase()}
  </text>

  <!-- Title & Subtitle -->
  <text x="125" y="103" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="700" fill="#ffffff">
    ${escapeXml(title)}
  </text>
  <text x="125" y="124" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#64748b">
    ${escapeXml(subtitle)}
  </text>

  <!-- Corner "Example" Label -->
  <rect x="640" y="90" width="120" height="34" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="700" y="112" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#94a3b8" text-anchor="middle" letter-spacing="1">
    ${escapeXml(badgeText)}
  </text>

  <!-- Date Chip in Chat -->
  <rect x="330" y="174" width="140" height="28" rx="14" fill="#151f32" stroke="#23334d" stroke-width="1"/>
  <text x="400" y="193" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748b" text-anchor="middle">
    TODAY
  </text>

  <!-- Messages -->
  ${messagesSvg}

  <!-- Bottom Message Bar Mock -->
  <rect x="0" y="${height - 90}" width="${width}" height="90" fill="#0d1527" stroke="#1e293b" stroke-width="1"/>
  <rect x="30" y="${height - 70}" width="${width - 110}" height="48" rx="24" fill="#151f32" stroke="#23334d" stroke-width="1"/>
  <text x="56" y="${height - 40}" font-family="system-ui, -apple-system, sans-serif" font-size="15" fill="#475569">
    Type a message...
  </text>
  <circle cx="${width - 45}" cy="${height - 46}" r="22" fill="#2563eb"/>
  <path d="M ${width - 50} ${height - 46} L ${width - 38} ${height - 46} M ${width - 43} ${height - 52} L ${width - 37} ${height - 46} L ${width - 43} ${height - 40}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
  `.trim();
}

async function renderMockups() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const mockups = [
    {
      filename: 'upi-scam.png',
      svg: generateSvg({
        title: 'Refund Claims Desk',
        subtitle: 'Online Support',
        isScam: true,
        badgeText: 'EXAMPLE',
        messages: [
          {
            align: 'left',
            width: 720,
            height: 380,
            forwarded: true,
            title: 'Refund Approved: Rs 4,999',
            titleColor: '#f87171',
            lines: [
              'Dear customer, your refund of Rs 4,999 has been approved.',
              'Enter your 6-digit secret UPI PIN to receive cashback',
              'directly into your bank account immediately.',
              '',
              'Collect request from: refund-desk@examplebank',
              'Or claim reward at: https://cashback-reward-desk.xyz/claim'
            ],
            button: 'Approve Collect Request to Get Rs 4,999',
            time: '10:14 AM'
          },
          {
            align: 'left',
            width: 720,
            height: 150,
            lines: [
              'Urgent: Complete verification within 10 minutes or',
              'the refund amount will be permanently cancelled.'
            ],
            time: '10:15 AM'
          }
        ]
      })
    },
    {
      filename: 'upi-safe.png',
      svg: generateSvg({
        title: 'Rohan Sharma',
        subtitle: 'Last seen today at 09:30 AM',
        isScam: false,
        badgeText: 'EXAMPLE',
        messages: [
          {
            align: 'left',
            width: 680,
            height: 220,
            lines: [
              'Hey! Yesterday dinner bill came to Rs 1,200 total.',
              'Your share is Rs 600.',
              'Send to rohan99@examplebank whenever free, no rush!'
            ],
            time: 'Yesterday 8:45 PM'
          },
          {
            align: 'right',
            width: 420,
            height: 110,
            lines: [
              'Paid, thanks!'
            ],
            time: 'Yesterday 8:50 PM'
          },
          {
            align: 'left',
            width: 480,
            height: 110,
            lines: [
              'Got it, thank you bro!'
            ],
            time: 'Yesterday 8:51 PM'
          }
        ]
      })
    },
    {
      filename: 'message-scam.png',
      svg: generateSvg({
        title: 'Electricity Department Notice',
        subtitle: 'Official SMS Alert',
        isScam: true,
        badgeText: 'EXAMPLE',
        messages: [
          {
            align: 'left',
            width: 720,
            height: 380,
            title: 'DISCONNECTION WARNING',
            titleColor: '#ef4444',
            lines: [
              'Dear Consumer, your electricity power will be disconnected',
              'tonight at 9:30 PM from the power sub-station because your',
              'previous month bill of Rs 1,450 was not updated.',
              '',
              'Contact our officer immediately at 98XXXXXX00 or verify',
              'your bill payment at http://bijli-bill-update.xyz to avoid',
              'immediate power line disconnection.'
            ],
            button: 'Pay Unpaid Bill Now: Rs 1,450',
            time: 'Today 11:20 AM'
          }
        ]
      })
    },
    {
      filename: 'message-safe.png',
      svg: generateSvg({
        title: 'Priya Patel',
        subtitle: 'Online',
        isScam: false,
        badgeText: 'EXAMPLE',
        messages: [
          {
            align: 'left',
            width: 680,
            height: 190,
            lines: [
              'Hi! Are we still meeting for lunch at 1 PM today',
              'near the cafeteria?',
              'Let me know when you leave office.'
            ],
            time: 'Today 12:15 PM'
          },
          {
            align: 'right',
            width: 580,
            height: 150,
            lines: [
              'Yes, wrapping up sprint review now.',
              'Leaving in 10 minutes! See you there.'
            ],
            time: 'Today 12:20 PM'
          }
        ]
      })
    }
  ];

  console.log(`Rendering 4 example screenshots to ${OUT_DIR}...`);

  for (const m of mockups) {
    const dest = path.join(OUT_DIR, m.filename);
    const svgBuffer = Buffer.from(m.svg);
    await sharp(svgBuffer)
      .png({ quality: 90 })
      .toFile(dest);
    const stat = fs.statSync(dest);
    console.log(`Rendered ${m.filename} (${stat.size} bytes)`);
  }

  console.log('All 4 example screenshots rendered successfully.');
}

if (require.main === module) {
  renderMockups().catch(err => {
    console.error('Render mockups failed:', err);
    process.exit(1);
  });
}

module.exports = { renderMockups, generateSvg };

