import React from 'react';
import { Container, Section, Card } from '../components/ui';
import { Reveal, PageTransition } from '../components/wow';
import { AlertTriangle, PhoneCall, Shield, FileText, CheckCircle2, Lock, ExternalLink, HelpCircle, Briefcase, Wallet, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PricingCards } from '../components/PricingCards';

const StubPage = ({ title, description, children, draftNotice = false }) => (
  <PageTransition>
    <Section className="stub-page-section route-transition">
      <Container>
        <Reveal>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '14px', color: 'var(--ink)' }}>{title}</h1>
            <p className="text-muted" style={{ fontSize: '15.5px', lineHeight: 1.6, marginBottom: '32px' }}>
              {description}
            </p>
            {children}
          </div>
        </Reveal>
      </Container>
    </Section>
  </PageTransition>
);

export const HowItWorks = () => (
  <StubPage
    title="How it works"
    description="Cyber Shield screens job offers, UPI payment requests, and incoming messages using live evidence and AI reading, anchoring every result with verifiable cryptographic proof."
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* 1. Job offers */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: 'rgba(77, 163, 255, 0.12)', border: '1px solid rgba(77, 163, 255, 0.25)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={20} color="var(--brand, #4DA3FF)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>1. Job offers</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Job Scam Check</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you provide:</strong> A job listing URL, pasted offer description, and recruiter email address or messaging handle.
          </p>
          <div>
            <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
              <li><strong>AI reading of the text:</strong> Flags advance registration fees, laptop/equipment deposits, interview-only-on-Telegram patterns, and unrealistic compensation claims.</li>
              <li><strong>Link lookups and domain age:</strong> Queries domain registration age via RDAP; flags newly registered domains claiming to represent established brands.</li>
              <li><strong>Company and recruiter signals:</strong> Checks business presence in public registries and flags corporate recruiters hiring exclusively from personal free webmail (@gmail, @yahoo).</li>
              <li><strong>Highlighted phrases with reasons:</strong> Highlights specific problematic text excerpts and explains why evidence suggests recruitment risk.</li>
            </ul>
          </div>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with specific reasons, clear &ldquo;What to do now&rdquo; guidance, an immutable Proof ID, and a downloadable receipt (.json) and PDF report.
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', fontSize: '12.5px', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot verify if a legitimate company name was used by an impostor without contacting the company directly; absence of warning signs does not guarantee an offer is safe.
          </div>
        </div>
      </Card>

      {/* 2. UPI and payment requests */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: 'rgba(34, 211, 238, 0.12)', border: '1px solid rgba(34, 211, 238, 0.25)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color="var(--accent-cyan, #22D3EE)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>2. UPI &amp; payment requests</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>UPI &amp; Payment Check</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you provide:</strong> Payment message copy, collect request text, or an uploaded payment screenshot from your phone or desktop.
          </p>
          <div>
            <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
              <li><strong>In-memory OCR reading:</strong> Extracts text, amounts, transaction notes, and UPI handles from screenshots without saving image files.</li>
              <li><strong>Pay-to-receive trick detection:</strong> Flags instructions asking you to enter your UPI PIN or approve a collect request to receive money, refunds, or cashback.</li>
              <li><strong>Handle format validation:</strong> Inspects UPI handle structure against recognized Indian banking and PSP conventions.</li>
              <li><strong>Highlighted phrases with reasons:</strong> Highlights deceptive passages and explains the mechanics of how the request would debit your account.</li>
            </ul>
          </div>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with specific reasons, immediate banking advisory on what to do now, an immutable Proof ID, and a downloadable receipt and PDF report.
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', fontSize: '12.5px', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot confirm that a payment arrived or left an account; cannot determine whose UPI ID it is; cannot recall or reverse a transaction.
          </div>
        </div>
      </Card>

      {/* 3. Messages and screenshots */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={20} color="#C084FC" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>3. Messages &amp; screenshots</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Message Scanner</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you provide:</strong> SMS, WhatsApp, Telegram, or email text, or an uploaded screenshot of the conversation.
          </p>
          <div>
            <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
              <li><strong>In-memory OCR extraction:</strong> Extracts message copy, phone numbers, tracking IDs, and embedded links directly in memory.</li>
              <li><strong>Threat intelligence &amp; domain checks:</strong> Queries URLs against live threat feeds (URLhaus, VirusTotal) and evaluates domain registration age.</li>
              <li><strong>Dual-pass AI reading:</strong> Identifies coercion tactics, urgent electricity/parcel cutoff threats, fake law enforcement summons, and KYC suspension lures across English, Hindi, and Hinglish.</li>
              <li><strong>Highlighted phrases with reasons:</strong> Highlights manipulative language with plain-language explanations of deceptive tactics.</li>
            </ul>
          </div>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with reasons, next-step action guidance, an immutable Proof ID, and a downloadable receipt and PDF report.
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', fontSize: '12.5px', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot tell who sent a message; cannot confirm whether an attached document, parcel notice, or certificate is genuine; cannot validate official agency notices.
          </div>
        </div>
      </Card>

      {/* 4. Proof IDs and the Verify page */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(34, 211, 238, 0.12)', border: '1px solid rgba(34, 211, 238, 0.25)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} color="var(--accent-cyan, #22D3EE)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>Proof IDs and the Verify page</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Tamper-evident verification ledger</span>
          </div>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 12px' }}>
          Every completed check generates a SHA-256 canonical hash of the inputs and findings, recorded on an append-only verification ledger. Along with your Proof ID, you receive a one-time Access Code shown on your screen (never stored on our server).
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 12px' }}>
          Anyone with the downloaded receipt file or the Proof ID and hash can visit <Link to="/verify" style={{ color: 'var(--brand, #4DA3FF)', textDecoration: 'underline' }}>/verify</Link> to independently verify:
        </p>
        <ul style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px', paddingLeft: '20px' }}>
          <li>That the ledger record exists and the cryptographic chain is intact</li>
          <li>That no section of the issued report has been altered, edited, or fabricated</li>
          <li>The exact timestamp and block index when the screening occurred</li>
        </ul>
      </Card>

      {/* 5. Honest What a Check Can and Cannot Do Section */}
      <Card>
        <h3 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--ink)' }}>What a check can and cannot do</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'rgba(18, 128, 92, 0.08)', border: '1px solid rgba(18, 128, 92, 0.25)', borderRadius: '10px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '14.5px', color: 'var(--risk-ok-text, #34D399)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} /> What a check can do
            </h4>
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim, #C9D3E3)', fontSize: '13px', lineHeight: 1.65 }}>
              <li>Spot warning signs and known scam patterns across jobs, UPI, and messages</li>
              <li>Highlight suspicious phrases and explain why they are risky</li>
              <li>Look up domain age via RDAP, redirect hops, and live URL threat feeds</li>
              <li>Provide actionable steps on what to do now if you suspect fraud</li>
            </ul>
          </div>

          <div style={{ background: 'rgba(198, 40, 40, 0.08)', border: '1px solid rgba(198, 40, 40, 0.25)', borderRadius: '10px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '14.5px', color: 'var(--risk-bad-text, #F87171)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} /> What a check cannot do
            </h4>
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-dim, #C9D3E3)', fontSize: '13px', lineHeight: 1.65 }}>
              <li>Cannot confirm that a payment arrived or left an account</li>
              <li>Cannot tell who sent a message or who created a communication</li>
              <li>Cannot confirm whose UPI ID it is or who owns an account</li>
              <li>Cannot confirm that a receipt, document, or certificate is genuine</li>
              <li>Cannot provide a legal finding or law enforcement determination</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  </StubPage>
);

export const Guide = () => (
  <StubPage
    title="Scam screening guide"
    description="Practical guidance on evaluating employment offers, UPI payment requests, and suspicious messages."
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card>
        <h3 style={{ fontSize: '17px', marginBottom: '10px', color: 'var(--ink)' }}>Understanding key screening vectors</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <strong style={{ fontSize: '14px' }}>1. Domain Age &amp; Threat Intelligence</strong>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '4px 0 0', lineHeight: 1.5 }}>
              Newly registered domains (under 30 days old) claiming to belong to long-standing corporations or banks are a primary warning sign.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: '14px' }}>2. Language &amp; Coercive Urgency</strong>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '4px 0 0', lineHeight: 1.5 }}>
              Artificial deadlines, threats of account disconnection, immediate legal arrest warnings, or demands for upfront fees indicate high risk.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: '14px' }}>3. Pay-to-Receive Mechanisms</strong>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '4px 0 0', lineHeight: 1.5 }}>
              Entering a UPI PIN or approving a collect request will always debit funds from your account. Legitimate refunds and cashback arrive automatically.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: '14px' }}>4. Sender Identity &amp; Webmail</strong>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '4px 0 0', lineHeight: 1.5 }}>
              Official organizations communicate through verified corporate domains and authenticated channels rather than generic personal webmail.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: '17px', marginBottom: '8px', color: 'var(--ink)' }}>What to do before taking action</h3>
        <ul style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0, paddingLeft: '20px' }}>
          <li>Never transfer money or pay advance fees to secure employment, prizes, or refunds.</li>
          <li>Never enter your UPI PIN to receive money or approve unfamiliar collect requests.</li>
          <li>Verify unexpected messages through official apps or published customer care numbers.</li>
        </ul>
      </Card>
    </div>
  </StubPage>
);

export const ScamTypes = () => (
  <StubPage
    title="Common scam types"
    description="Recognize typical recruitment, payment, and phishing tactics before sharing sensitive personal or financial information."
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <AlertTriangle size={17} color="#C62828" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>1. Fake job registration fees</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
          The applicant is asked to pay an upfront &ldquo;registration fee&rdquo;, &ldquo;portal processing charge&rdquo;, or &ldquo;laptop deposit&rdquo; before an interview or equipment dispatch. Legitimate employers never charge candidates to apply.
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <AlertTriangle size={17} color="#C62828" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>2. Pay-to-receive UPI collect fraud</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
          Fraudsters send a collect request claiming it will &ldquo;credit&rdquo; an approved refund, cashback, or OLX buyer payment. Entering your UPI PIN immediately debits your account.
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <AlertTriangle size={17} color="#C62828" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>3. Urgent parcel or electricity cutoff alerts</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
          SMS or WhatsApp messages warning that a delivery is blocked or power will be disconnected tonight due to an unpaid bill, directing you to click an unverified link or pay a nominal fee.
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <AlertTriangle size={17} color="#B7791F" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>4. Free-email recruiter &amp; chat-only hiring</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
          The recruiter claims to represent a recognized enterprise but conducts interviews exclusively over Telegram or WhatsApp and sends messages from personal webmail accounts.
        </p>
      </Card>
    </div>
  </StubPage>
);

export const Helpline1930 = () => (
  <StubPage
    title="National Cyber Crime Reporting (Helpline 1930)"
    description="Official incident reporting channels and emergency assistance for victims of online financial and cyber fraud."
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card style={{ borderLeft: '4px solid var(--brand)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <PhoneCall size={22} color="var(--brand)" />
          <h3 style={{ margin: 0, fontSize: '18px' }}>National Helpline: 1930</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.5, margin: '0 0 12px' }}>
          The Citizen Financial Cyber Fraud Reporting and Management System (Helpline 1930) enables immediate reporting to intercept fraudulent bank transfers.
        </p>
        <p style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 600, margin: 0 }}>
          Official National Cyber Crime Reporting Portal:{' '}
          <a
            href="https://cybercrime.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--brand)', textDecoration: 'underline' }}
          >
            cybercrime.gov.in
          </a>
        </p>
      </Card>

      <Card>
        <h4 style={{ fontSize: '15px', marginBottom: '10px' }}>Immediate steps if you sent funds:</h4>
        <ol style={{ paddingLeft: '20px', color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: 0 }}>
          <li>Notify your bank immediately to freeze the affected account and request an urgent transaction recall.</li>
          <li>Call 1930 or file an incident report at <strong>cybercrime.gov.in</strong> as quickly as possible.</li>
          <li>Save all evidence: chat histories, emails, payment receipts, bank transaction IDs, and website URLs.</li>
          <li>File a formal complaint with your local cyber police station.</li>
        </ol>
      </Card>
    </div>
  </StubPage>
);

export const Pricing = () => (
  <StubPage
    title="Pricing"
    description="Transparent screening aid plans for individuals."
  >
    <PricingCards />
  </StubPage>
);

export const About = () => (
  <StubPage
    title="About Cyber Shield"
    description="Cyber Shield is an open scam screening platform designed to screen job offers, UPI payment requests, and incoming messages against verifiable signals and live security data."
  >
    <Card>
      <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>Our Mission</h3>
      <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
        Fraudsters target individuals using deceptive links, advance-fee recruitment scams, collect-request traps, and phishing alerts. Cyber Shield provides accessible, automated checks to surface objective evidence and cryptographic proof before personal or financial information is shared.
      </p>
    </Card>
  </StubPage>
);

export const Contact = () => (
  <StubPage
    title="Contact"
    description="For inquiries, feedback, or reporting issues with our screening aid."
  >
    <Card>
      <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>Get in touch</h3>
      <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
        If you encounter problems or have questions regarding screening results, please open an issue in the project repository or reach out through project channels.
      </p>
    </Card>
  </StubPage>
);

export const Privacy = () => (
  <StubPage
    title="Privacy Policy"
    description="How Cyber Shield handles submitted check data and cryptographic verification records."
    draftNotice={true}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Information processed</h3>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
          When you run a check, we process the provided text, links, or uploaded screenshots directly in memory to execute verification checks. We do not keep your text or screenshot unless you sign in and the result is saved. Anonymous scans expire after 30 days.
        </p>
      </Card>
      <Card>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Check storage, retention, and access</h3>
        <ul style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: 0, paddingLeft: '20px' }}>
          <li>We do not keep your text or screenshot unless you sign in and the result is saved.</li>
          <li>Anonymous checks expire after 30 days.</li>
          <li>The Access Code is generated in page memory and never stored on the server.</li>
          <li>Only the server can read saved checks.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Verification and ledger</h3>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
          Checks generate a SHA-256 report hash and an append-only ledger entry. The ledger stores verification hashes and section summaries; it does not publish your private applicant credentials, chat logs, or personal payment details.
        </p>
      </Card>
    </div>
  </StubPage>
);

export const Terms = () => (
  <StubPage
    title="Terms of Service"
    description="Terms governing the use of the Cyber Shield screening aid."
    draftNotice={true}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Screening aid disclaimer</h3>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
          Cyber Shield is an automated screening aid that evaluates public web signals and text patterns. It does not provide legal advice, legal findings, or binding determinations regarding any individual or organization.
        </p>
      </Card>
      <Card>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>User responsibility</h3>
        <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
          Users should exercise independent judgment and verify corporate employment opportunities, payment requests, and communications through official portals and verified channels before entering into agreements, authorizing payments, or sharing confidential information.
        </p>
      </Card>
    </div>
  </StubPage>
);
