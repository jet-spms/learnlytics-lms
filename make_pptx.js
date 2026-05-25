// Cybersecurity Awareness Training — PPTX Generator
// Run: node make_pptx.js
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
pres.title = "Cybersecurity Awareness Training";
pres.author = "Jetking Infotrain Ltd";

// ─────────────────────────────── PALETTE ────────────────────────────────
const BG1   = "0F172A";  // very dark navy
const BG2   = "1E293B";  // dark slate
const BG3   = "334155";  // medium slate
const BGTL  = "051A18";  // dark teal (lab slides)

const RED   = "EF4444";
const GRN   = "10B981";
const BLU   = "3B82F6";
const AMB   = "F59E0B";
const TEL   = "0D9488";
const PUR   = "8B5CF6";

const WHT   = "FFFFFF";
const LIT   = "CBD5E1";
const MUT   = "94A3B8";
const CARD1 = "1E293B";  // card on BG1
const CARD2 = "243554";  // card on BG2
const CARDTL= "0D3530";  // card on teal bg

// ──────────────────── HELPER FUNCTIONS ────────────────────────────────
function topBar(slide, color) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.09,
    fill: { color }, line: { color, width: 0 }
  });
}

function addTitle(slide, text, y = 0.2, color = WHT) {
  slide.addText(text, {
    x: 0.5, y, w: 9, h: 0.55,
    fontSize: 22, bold: true, color,
    fontFace: "Calibri", margin: 0
  });
}

function titleDivider(slide, y = 0.8, color = BG3) {
  slide.addShape(pres.shapes.LINE, {
    x: 0.5, y, w: 9, h: 0,
    line: { color, width: 1 }
  });
}

function rect(slide, x, y, w, h, fill, lineColor) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: lineColor || fill, width: lineColor ? 1 : 0 }
  });
}

// Accent card: rectangle with a left color border strip
function accentCard(slide, x, y, w, h, accent, bg) {
  rect(slide, x, y, w, h, bg || CARD1, BG3);
  rect(slide, x, y, 0.07, h, accent);
}

// Stat callout: big number + label on a colored card
function statBox(slide, x, y, w, h, value, label, accent) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: accent, transparency: 85 },
    line: { color: accent, width: 1 }
  });
  slide.addText(value, {
    x, y: y + 0.08, w, h: h * 0.55,
    fontSize: 26, bold: true, color: accent,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });
  slide.addText(label, {
    x, y: y + h * 0.55, w, h: h * 0.4,
    fontSize: 9, color: LIT,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };

  // Left red vertical accent panel
  rect(s, 0, 0, 0.45, 5.625, RED);

  // Subtle background circle decorations
  s.addShape(pres.shapes.OVAL, { x: 6.2, y: 2.8, w: 5, h: 5,
    fill: { color: RED, transparency: 93 }, line: { color: RED, width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 7.0, y: -1.2, w: 4, h: 4,
    fill: { color: BLU, transparency: 90 }, line: { color: BLU, width: 0 } });

  // Shield icon card (right side)
  rect(s, 7.0, 1.3, 2.5, 3.1, CARD1, BG3);
  s.addText("🔐", {
    x: 7.0, y: 1.5, w: 2.5, h: 2.0,
    fontSize: 60, align: "center", valign: "middle"
  });
  s.addText("PROTECT  ·  DETECT  ·  RESPOND", {
    x: 7.0, y: 3.5, w: 2.5, h: 0.5,
    fontSize: 7, bold: true, color: MUT, charSpacing: 1.5,
    fontFace: "Calibri", align: "center", margin: 0
  });

  // Program label pill
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 0.7, w: 3.2, h: 0.28,
    fill: { color: RED, transparency: 80 },
    line: { color: RED, width: 1 }
  });
  s.addText("JETKING INFOTRAIN LTD  |  2025", {
    x: 0.7, y: 0.7, w: 3.2, h: 0.28,
    fontSize: 7.5, bold: true, color: RED, charSpacing: 1.5,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });

  // Main title lines
  s.addText("CYBERSECURITY", {
    x: 0.7, y: 1.2, w: 6.0, h: 0.85,
    fontSize: 50, bold: true, color: WHT,
    fontFace: "Calibri", margin: 0
  });
  s.addText("AWARENESS TRAINING", {
    x: 0.7, y: 1.95, w: 6.0, h: 0.65,
    fontSize: 35, bold: true, color: RED,
    fontFace: "Calibri", margin: 0
  });

  // Subtitle
  s.addText("Phishing, Social Engineering & Your Digital Defense", {
    x: 0.7, y: 2.82, w: 6.0, h: 0.45,
    fontSize: 14, italic: true, color: LIT,
    fontFace: "Calibri", margin: 0
  });

  // Divider + footer
  s.addShape(pres.shapes.LINE, { x: 0.7, y: 3.45, w: 6.0, h: 0,
    line: { color: BG3, width: 1 } });
  s.addText("Jetking Infotrain Ltd  |  Cybersecurity Awareness Program  |  2025", {
    x: 0.7, y: 3.6, w: 6.0, h: 0.3,
    fontSize: 9, color: MUT, fontFace: "Calibri", margin: 0
  });

  // Bottom accent bar
  rect(s, 0, 5.525, 10, 0.1, RED);
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 2 — AGENDA
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, BLU);
  addTitle(s, "Today's Agenda", 0.18);
  titleDivider(s, 0.82);

  // Two columns of agenda items
  const colLeft = [
    ["01", "Overview of Modern Cyber Threats"],
    ["02", "What Is Phishing & Why Attackers Use It"],
    ["03", "Types of Phishing Attacks"],
    ["04", "Phishing Simulation Outcomes Review"],
  ];
  const colRight = [
    ["05", "Recognizing Fake Domains & Links"],
    ["06", "How Attackers Manipulate Users"],
    ["07", "Password Safety & Safe Browsing"],
    ["08", "What To Do With Suspicious Emails"],
  ];

  const drawAgendaCol = (items, xStart) => {
    items.forEach(([num, text], i) => {
      const y = 1.0 + i * 1.05;
      // Number badge
      s.addShape(pres.shapes.RECTANGLE, {
        x: xStart, y, w: 0.42, h: 0.42,
        fill: { color: BLU }, line: { color: BLU, width: 0 }
      });
      s.addText(num, {
        x: xStart, y, w: 0.42, h: 0.42,
        fontSize: 13, bold: true, color: WHT,
        fontFace: "Calibri", align: "center", valign: "middle", margin: 0
      });
      // Text
      s.addText(text, {
        x: xStart + 0.52, y: y + 0.04, w: 3.9, h: 0.38,
        fontSize: 13, color: LIT, fontFace: "Calibri",
        valign: "middle", margin: 0
      });
      // Divider
      s.addShape(pres.shapes.LINE, {
        x: xStart, y: y + 0.55, w: 4.4, h: 0,
        line: { color: BG3, width: 1 }
      });
    });
  };

  drawAgendaCol(colLeft, 0.5);
  drawAgendaCol(colRight, 5.3);

  // Lab banner at bottom
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 5.1, w: 9, h: 0.35,
    fill: { color: TEL, transparency: 75 },
    line: { color: TEL, width: 1 }
  });
  s.addText("+ 4 Hands-On Lab Sessions Throughout the Training", {
    x: 0.5, y: 5.1, w: 9, h: 0.35,
    fontSize: 10, bold: true, color: TEL,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 3 — CYBER THREAT LANDSCAPE
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, RED);
  addTitle(s, "The Cyber Threat Landscape in 2025", 0.18);
  titleDivider(s, 0.82);

  const threats = [
    { icon: "🎣", name: "Phishing & Social Engineering", desc: "Most common attack vector — 94% of breaches start here", accent: RED },
    { icon: "💾", name: "Ransomware Attacks",             desc: "Encrypts data and demands payment to restore access", accent: AMB },
    { icon: "📧", name: "Business Email Compromise",      desc: "Impersonates executives to authorize fraudulent transfers", accent: RED },
    { icon: "🔑", name: "Credential Theft",               desc: "Stealing usernames and passwords via phishing or keyloggers", accent: AMB },
    { icon: "🦠", name: "Malware & Trojans",              desc: "Malicious software installed via attachments or downloads", accent: PUR },
    { icon: "👤", name: "Insider Threats",                desc: "Current/former employees leaking or stealing data", accent: BLU },
  ];

  const cols = 3, rows = 2;
  const cW = 2.85, cH = 1.4, gX = 0.28, gY = 0.22;
  const startX = 0.5, startY = 0.92;

  threats.forEach((t, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cW + gX);
    const y = startY + row * (cH + gY);

    // Card
    rect(s, x, y, cW, cH, CARD1, BG3);
    // Left accent strip
    rect(s, x, y, 0.07, cH, t.accent);
    // Icon
    s.addText(t.icon, {
      x: x + 0.15, y: y + 0.15, w: 0.55, h: 0.55,
      fontSize: 22, align: "center", valign: "middle"
    });
    // Name
    s.addText(t.name, {
      x: x + 0.18, y: y + 0.72, w: cW - 0.22, h: 0.36,
      fontSize: 10.5, bold: true, color: WHT,
      fontFace: "Calibri", margin: 0
    });
    // Desc
    s.addText(t.desc, {
      x: x + 0.18, y: y + 1.05, w: cW - 0.22, h: 0.3,
      fontSize: 8.5, color: MUT, fontFace: "Calibri", margin: 0
    });
  });

  // Stats bar at bottom
  const stats = [
    ["94%", "of attacks start with phishing"],
    ["$4.45M", "average breach cost"],
    ["1 attack", "every 39 seconds globally"],
  ];
  const bY = 4.65, bH = 0.78;
  rect(s, 0, bY, 10, bH + 0.18, "0D1520");
  s.addShape(pres.shapes.LINE, { x: 0, y: bY, w: 10, h: 0, line: { color: RED, width: 2 } });

  stats.forEach((st, i) => {
    const x = 0.5 + i * 3.17;
    s.addText(st[0], {
      x, y: bY + 0.08, w: 3, h: 0.38,
      fontSize: 22, bold: true, color: RED,
      fontFace: "Calibri", align: "center", margin: 0
    });
    s.addText(st[1], {
      x, y: bY + 0.44, w: 3, h: 0.25,
      fontSize: 9.5, color: LIT, fontFace: "Calibri", align: "center", margin: 0
    });
    if (i < 2) {
      s.addShape(pres.shapes.LINE, {
        x: x + 3.0, y: bY + 0.12, w: 0, h: 0.52,
        line: { color: BG3, width: 1 }
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 4 — WHAT IS PHISHING
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  topBar(s, AMB);
  addTitle(s, "What Is Phishing — And Why Do Attackers Use It?", 0.18);
  titleDivider(s, 0.82);

  // Definition box
  rect(s, 0.5, 0.92, 9, 0.92, CARD2, AMB);
  rect(s, 0.5, 0.92, 0.09, 0.92, AMB);
  s.addText("DEFINITION", {
    x: 0.7, y: 0.94, w: 1.4, h: 0.22,
    fontSize: 8, bold: true, color: AMB, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addText('"Phishing is a cyber attack where criminals disguise themselves as trusted entities to steal sensitive information, credentials, or money."', {
    x: 0.7, y: 1.18, w: 8.6, h: 0.55,
    fontSize: 12.5, italic: true, color: WHT,
    fontFace: "Calibri", margin: 0
  });

  // Two columns
  const colY = 2.05, colH = 2.85;
  const mkList = (items, x, y) => {
    return items.map((txt, i) => ({
      text: txt,
      options: { bullet: true, breakLine: i < items.length - 1, color: LIT, fontSize: 12, fontFace: "Calibri" }
    }));
  };

  // Left column
  rect(s, 0.5, colY, 4.45, colH, CARD2, BG3);
  rect(s, 0.5, colY, 0.08, colH, RED);
  s.addText("WHY IT WORKS", {
    x: 0.7, y: colY + 0.12, w: 4.1, h: 0.28,
    fontSize: 10, bold: true, color: RED, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 0.7, y: colY + 0.46, w: 3.9, h: 0, line: { color: BG3, width: 1 } });
  s.addText(mkList([
    "Low cost to execute — free phishing kits available",
    "High success rate against untrained staff",
    "Hard to detect even for security tools",
    "Bypasses technical defenses entirely",
    "Exploits universal human trust"
  ], 0, 0), {
    x: 0.72, y: colY + 0.58, w: 4.0, h: 2.1,
    fontFace: "Calibri", fontSize: 11, color: LIT, margin: 0
  });

  // Right column
  rect(s, 5.1, colY, 4.45, colH, CARD2, BG3);
  rect(s, 5.1, colY, 0.08, colH, AMB);
  s.addText("ATTACKER GOALS", {
    x: 5.3, y: colY + 0.12, w: 4.0, h: 0.28,
    fontSize: 10, bold: true, color: AMB, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 5.3, y: colY + 0.46, w: 3.8, h: 0, line: { color: BG3, width: 1 } });
  s.addText(mkList([
    "Steal login credentials and passwords",
    "Deploy ransomware on corporate networks",
    "Commit financial fraud via BEC",
    "Gain persistent access to systems",
    "Harvest personal data for sale"
  ], 0, 0), {
    x: 5.3, y: colY + 0.58, w: 4.0, h: 2.1,
    fontFace: "Calibri", fontSize: 11, color: LIT, margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 5 — TYPES OF PHISHING
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, BLU);
  addTitle(s, "Types of Phishing Attacks", 0.18);
  titleDivider(s, 0.82);

  const types = [
    {
      icon: "📧", num: "01", name: "Email Phishing",
      accent: RED,
      sub: "Mass Targeting",
      desc: "Bulk emails impersonating banks, IT, HR, or well-known services. Uses generic greetings, urgency, and suspicious links or attachments.",
      tag: "Most Common"
    },
    {
      icon: "🎯", num: "02", name: "Spear Phishing",
      accent: AMB,
      sub: "Targeted Attacks",
      desc: "Highly personalised — uses victim's name, role, colleagues, and company info. Far more convincing and dangerous.",
      tag: "91% of breaches"
    },
    {
      icon: "📱", num: "03", name: "SMS Phishing (Smishing)",
      accent: GRN,
      sub: "Via Text Message",
      desc: "Fake texts from banks, delivery services, or government. Contains malicious links or fake callback numbers to steal info.",
      tag: "Growing Fast"
    },
    {
      icon: "📞", num: "04", name: "Voice Phishing (Vishing)",
      accent: PUR,
      sub: "Phone Calls",
      desc: "Calls impersonating IT support, your bank, or executives. Creates urgency to extract credentials, OTPs, or payments immediately.",
      tag: "Hard to Detect"
    },
  ];

  const cW = 4.35, cH = 2.3;
  const positions = [
    { x: 0.5,  y: 0.92 },
    { x: 5.15, y: 0.92 },
    { x: 0.5,  y: 3.30 },
    { x: 5.15, y: 3.30 },
  ];

  types.forEach((t, i) => {
    const { x, y } = positions[i];
    // Card background
    rect(s, x, y, cW, cH, CARD1, BG3);
    // Top accent bar
    rect(s, x, y, cW, 0.08, t.accent);
    // Icon + number
    s.addText(t.icon, {
      x: x + 0.18, y: y + 0.18, w: 0.52, h: 0.52,
      fontSize: 22, align: "center", valign: "middle"
    });
    s.addText(t.num, {
      x: x + 0.72, y: y + 0.18, w: 0.4, h: 0.26,
      fontSize: 9, bold: true, color: t.accent, fontFace: "Calibri", margin: 0
    });
    // Name
    s.addText(t.name, {
      x: x + 0.72, y: y + 0.42, w: cW - 0.78, h: 0.3,
      fontSize: 13, bold: true, color: WHT, fontFace: "Calibri", margin: 0
    });
    // Sub-label
    s.addText(t.sub, {
      x: x + 0.18, y: y + 0.78, w: cW - 0.25, h: 0.22,
      fontSize: 9, color: t.accent, fontFace: "Calibri", margin: 0
    });
    // Divider
    s.addShape(pres.shapes.LINE, { x: x + 0.18, y: y + 1.02, w: cW - 0.3, h: 0, line: { color: BG3, width: 1 } });
    // Description
    s.addText(t.desc, {
      x: x + 0.18, y: y + 1.1, w: cW - 0.28, h: 0.78,
      fontSize: 9.5, color: LIT, fontFace: "Calibri", margin: 0
    });
    // Tag badge
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.18, y: y + 1.94, w: 1.1, h: 0.22,
      fill: { color: t.accent, transparency: 80 },
      line: { color: t.accent, width: 1 }
    });
    s.addText(t.tag, {
      x: x + 0.18, y: y + 1.94, w: 1.1, h: 0.22,
      fontSize: 7.5, bold: true, color: t.accent,
      fontFace: "Calibri", align: "center", valign: "middle", margin: 0
    });
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 6 — PHISHING SIMULATION RESULTS
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  topBar(s, BLU);
  // Company label pill
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 0.14, w: 3.0, h: 0.22,
    fill: { color: BLU, transparency: 80 },
    line: { color: BLU, width: 1 }
  });
  s.addText("JETKING INFOTRAIN LTD  —  INTERNAL SIMULATION", {
    x: 0.5, y: 0.14, w: 3.0, h: 0.22,
    fontSize: 6.5, bold: true, color: BLU, charSpacing: 1,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });
  addTitle(s, "Phishing Simulation Results — Jetking Infotrain Ltd", 0.18);
  titleDivider(s, 0.82);

  // Left: Table — 500 users simulation
  const tData = [
    [
      { text: "METRIC",  options: { bold: true, color: WHT, fill: { color: BLU }, fontSize: 9, fontFace: "Calibri", align: "center" } },
      { text: "RESULT",  options: { bold: true, color: WHT, fill: { color: BLU }, fontSize: 9, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "Users Targeted",        options: { bold: true, color: LIT, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri" } },
      { text: "500",                   options: { bold: true, color: WHT, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "Emails Opened",         options: { bold: true, color: LIT, fill: { color: BG2  }, fontSize: 10, fontFace: "Calibri" } },
      { text: "310  (62%)",            options: { bold: true, color: AMB, fill: { color: BG2  }, fontSize: 10, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "Links Clicked",         options: { bold: true, color: LIT, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri" } },
      { text: "145  (29%)",            options: { bold: true, color: RED, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "Credentials Entered",   options: { bold: true, color: LIT, fill: { color: BG2  }, fontSize: 10, fontFace: "Calibri" } },
      { text: "48  (10%)",             options: { bold: true, color: RED, fill: { color: BG2  }, fontSize: 10, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "Reported to Security",  options: { bold: true, color: LIT, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri" } },
      { text: "38  (8%)",              options: { bold: true, color: GRN, fill: { color: CARD2 }, fontSize: 10, fontFace: "Calibri", align: "center" } },
    ],
  ];
  s.addTable(tData, {
    x: 0.5, y: 0.92, w: 4.5,
    colW: [2.9, 1.6],
    border: { pt: 1, color: BG3 },
    rowH: 0.42,
  });

  // Right: Key findings
  rect(s, 5.25, 0.92, 4.3, 3.55, CARD2, BG3);
  rect(s, 5.25, 0.92, 0.08, 3.55, RED);
  s.addText("KEY FINDINGS", {
    x: 5.45, y: 1.02, w: 3.9, h: 0.26,
    fontSize: 9, bold: true, color: RED, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 5.45, y: 1.32, w: 3.7, h: 0, line: { color: BG3, width: 1 } });
  s.addText([
    { text: "1 in 3 employees clicked a simulated phishing link", options: { bullet: true, breakLine: true, color: LIT, fontSize: 11, fontFace: "Calibri" } },
    { text: "Only 8% reported the suspicious email to security", options: { bullet: true, breakLine: true, color: LIT, fontSize: 11, fontFace: "Calibri" } },
    { text: "Finance & HR had the highest click-through rates", options: { bullet: true, breakLine: true, color: LIT, fontSize: 11, fontFace: "Calibri" } },
    { text: "Mobile users were 2x more likely to click links", options: { bullet: true, color: LIT, fontSize: 11, fontFace: "Calibri" } },
  ], { x: 5.45, y: 1.42, w: 3.9, h: 1.9 });

  // Goals row
  rect(s, 5.25, 3.52, 4.3, 0.95, "0A1E38", GRN);
  rect(s, 5.25, 3.52, 0.08, 0.95, GRN);
  s.addText("IMPROVEMENT GOALS", {
    x: 5.45, y: 3.58, w: 3.9, h: 0.22,
    fontSize: 8, bold: true, color: GRN, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addText([
    { text: "Reduce click rate to ", options: { color: LIT, fontSize: 10.5, fontFace: "Calibri" } },
    { text: "< 5%", options: { color: GRN, bold: true, fontSize: 10.5, fontFace: "Calibri", breakLine: true } },
    { text: "Increase reporting rate to ", options: { color: LIT, fontSize: 10.5, fontFace: "Calibri" } },
    { text: "> 40%", options: { color: GRN, bold: true, fontSize: 10.5, fontFace: "Calibri" } },
  ], { x: 5.45, y: 3.84, w: 3.9, h: 0.55 });

  // Stat callouts below table
  const simStats = [
    { v: "62%", k: "Opened Rate", c: AMB },
    { v: "29%", k: "Click Rate",  c: RED },
    { v: "8%",  k: "Reported",   c: GRN },
  ];
  simStats.forEach((st, i) => {
    const sx = 0.5 + i * 1.52;
    s.addShape(pres.shapes.RECTANGLE, { x: sx, y: 3.54, w: 1.38, h: 0.82,
      fill: { color: st.c, transparency: 85 }, line: { color: st.c, width: 1 } });
    s.addText(st.v, { x: sx, y: 3.58, w: 1.38, h: 0.44,
      fontSize: 20, bold: true, color: st.c, fontFace: "Calibri", align: "center", margin: 0 });
    s.addText(st.k, { x: sx, y: 4.02, w: 1.38, h: 0.28,
      fontSize: 8.5, color: LIT, fontFace: "Calibri", align: "center", margin: 0 });
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 7 — FAKE DOMAINS & MALICIOUS LINKS
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, RED);
  addTitle(s, "Spot the Threat — Fake Domains & Malicious Links", 0.18);
  titleDivider(s, 0.82);

  // Section 1: Domain comparison table
  s.addText("FAKE DOMAIN EXAMPLES", {
    x: 0.5, y: 0.92, w: 4.5, h: 0.25,
    fontSize: 8.5, bold: true, color: RED, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  const domainData = [
    [
      { text: "LEGITIMATE", options: { bold: true, color: GRN, fill: { color: "063D2B" }, fontSize: 9, fontFace: "Calibri", align: "center" } },
      { text: "FAKE / MALICIOUS", options: { bold: true, color: RED, fill: { color: "3D0606" }, fontSize: 9, fontFace: "Calibri", align: "center" } },
    ],
    [
      { text: "microsoft.com",     options: { color: GRN, fill: { color: CARD1 }, fontSize: 11, fontFace: "Consolas" } },
      { text: "micros0ft.com",     options: { color: RED, fill: { color: CARD1 }, fontSize: 11, fontFace: "Consolas" } },
    ],
    [
      { text: "paypal.com",        options: { color: GRN, fill: { color: BG2  }, fontSize: 11, fontFace: "Consolas" } },
      { text: "paypal-secure-login.com", options: { color: RED, fill: { color: BG2  }, fontSize: 11, fontFace: "Consolas" } },
    ],
    [
      { text: "yourbank.com",      options: { color: GRN, fill: { color: CARD1 }, fontSize: 11, fontFace: "Consolas" } },
      { text: "yourbank.verify-account.net", options: { color: RED, fill: { color: CARD1 }, fontSize: 11, fontFace: "Consolas" } },
    ],
  ];
  s.addTable(domainData, {
    x: 0.5, y: 1.2, w: 4.5, colW: [2.25, 2.25],
    border: { pt: 1, color: BG3 }, rowH: 0.38,
  });

  // Section 2: Red flags
  rect(s, 5.2, 0.92, 4.3, 2.38, CARD1, BG3);
  rect(s, 5.2, 0.92, 0.08, 2.38, RED);
  s.addText("RED FLAGS IN LINKS", {
    x: 5.4, y: 1.0, w: 3.9, h: 0.26,
    fontSize: 8.5, bold: true, color: RED, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 5.4, y: 1.3, w: 3.8, h: 0, line: { color: BG3, width: 1 } });
  s.addText([
    { text: "Misspelled or swapped characters (0 for O, 1 for l)", options: { bullet: true, breakLine: true, color: LIT, fontSize: 10, fontFace: "Calibri" } },
    { text: "Extra subdomains: login.microsoft.com.evil.com", options: { bullet: true, breakLine: true, color: LIT, fontSize: 10, fontFace: "Calibri" } },
    { text: "HTTP instead of HTTPS (no padlock)", options: { bullet: true, breakLine: true, color: LIT, fontSize: 10, fontFace: "Calibri" } },
    { text: "URL shorteners hiding the real destination", options: { bullet: true, breakLine: true, color: LIT, fontSize: 10, fontFace: "Calibri" } },
    { text: "Anchor text doesn't match the actual URL", options: { bullet: true, color: LIT, fontSize: 10, fontFace: "Calibri" } },
  ], { x: 5.4, y: 1.38, w: 3.9, h: 1.78 });

  // Section 3: Dangerous attachments
  s.addShape(pres.shapes.LINE, { x: 0.5, y: 3.38, w: 9, h: 0, line: { color: BG3, width: 1 } });
  s.addText("MALICIOUS ATTACHMENTS — NEVER OPEN THESE", {
    x: 0.5, y: 3.45, w: 6, h: 0.26,
    fontSize: 8.5, bold: true, color: AMB, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });

  const exts = [".exe", ".zip", ".js", ".docm", ".xlsm", ".bat", ".vbs"];
  exts.forEach((ext, i) => {
    const x = 0.5 + i * 1.27;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 3.8, w: 1.1, h: 0.38,
      fill: { color: RED, transparency: 80 },
      line: { color: RED, width: 1 }
    });
    s.addText(ext, {
      x, y: 3.8, w: 1.1, h: 0.38,
      fontSize: 11, bold: true, color: RED,
      fontFace: "Consolas", align: "center", valign: "middle", margin: 0
    });
  });

  // Warning box
  rect(s, 0.5, 4.38, 9, 0.75, "2A1A00", AMB);
  rect(s, 0.5, 4.38, 0.08, 0.75, AMB);
  s.addText('⚠  "Enable Macros" Pop-Up = TRAP — Never click Enable on unexpected Office documents!', {
    x: 0.7, y: 4.38, w: 8.6, h: 0.75,
    fontSize: 12, bold: true, color: AMB,
    fontFace: "Calibri", valign: "middle", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 8 — SOCIAL ENGINEERING TACTICS
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  topBar(s, AMB);
  addTitle(s, "How Attackers Manipulate You — The Psychology of Phishing", 0.18);
  titleDivider(s, 0.82);

  const tactics = [
    { num: "01", name: "URGENCY",     icon: "⏰", color: RED,
      quote: '"Your account will be suspended in 24 hours!"',
      desc: "Creates time pressure so you act before thinking." },
    { num: "02", name: "AUTHORITY",   icon: "👔", color: AMB,
      quote: '"This is your CEO — transfer funds immediately."',
      desc: "Impersonates executives or institutions to force compliance." },
    { num: "03", name: "FEAR",        icon: "😨", color: RED,
      quote: '"Suspicious login detected. Verify now or lose access."',
      desc: "Triggers anxiety to override rational thinking." },
    { num: "04", name: "CURIOSITY",   icon: "📦", color: BLU,
      quote: '"You have a pending package. Click to track."',
      desc: "Exploits natural curiosity to get a click." },
    { num: "05", name: "SCARCITY",    icon: "🎁", color: AMB,
      quote: '"Only 2 hours left to claim your prize!"',
      desc: "FOMO-based manipulation to rush decisions." },
    { num: "06", name: "FAMILIARITY", icon: "🤝", color: PUR,
      quote: "Spoofing a colleague's name, photo, or email",
      desc: "Using known names builds false trust instantly." },
  ];

  const cW = 2.85, cH = 1.55, gX = 0.28, gY = 0.2;
  const startX = 0.5, startY = 0.9;

  tactics.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = startX + col * (cW + gX);
    const y = startY + row * (cH + gY);

    rect(s, x, y, cW, cH, CARD2, BG3);
    rect(s, x, y, 0.07, cH, t.color);

    // Number + Icon
    s.addText(t.num, {
      x: x + 0.18, y: y + 0.08, w: 0.35, h: 0.22,
      fontSize: 8, bold: true, color: t.color, fontFace: "Calibri", margin: 0
    });
    s.addText(t.icon + "  " + t.name, {
      x: x + 0.18, y: y + 0.26, w: cW - 0.25, h: 0.3,
      fontSize: 12, bold: true, color: WHT, fontFace: "Calibri", margin: 0
    });
    s.addShape(pres.shapes.LINE, { x: x + 0.18, y: y + 0.6, w: cW - 0.3, h: 0, line: { color: BG3, width: 1 } });
    s.addText(t.quote, {
      x: x + 0.18, y: y + 0.68, w: cW - 0.25, h: 0.42,
      fontSize: 9, italic: true, color: t.color, fontFace: "Calibri", margin: 0
    });
    s.addText(t.desc, {
      x: x + 0.18, y: y + 1.1, w: cW - 0.25, h: 0.35,
      fontSize: 8.5, color: MUT, fontFace: "Calibri", margin: 0
    });
  });

  // Bottom note
  rect(s, 0.5, 5.1, 9, 0.35, "2A1A00", AMB);
  s.addText('🧠  "Attackers target emotions, not just technology. When in doubt — stop, breathe, verify."', {
    x: 0.5, y: 5.1, w: 9, h: 0.35,
    fontSize: 11, bold: true, color: AMB,
    fontFace: "Calibri", valign: "middle", align: "center", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 9 — PASSWORD SAFETY
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, GRN);
  addTitle(s, "Password Safety & Safe Browsing Habits", 0.18);
  titleDivider(s, 0.82);

  const mkLines = (items) => items.map((item, i) => ({
    text: item.text,
    options: {
      bullet: true,
      breakLine: i < items.length - 1,
      color: item.good ? GRN : RED,
      fontSize: 11,
      fontFace: "Calibri",
      bold: false,
    }
  }));

  // Left column — Password rules
  rect(s, 0.5, 0.92, 4.45, 4.2, CARD1, BG3);
  rect(s, 0.5, 0.92, 0.08, 4.2, GRN);
  s.addText("🔐  STRONG PASSWORD RULES", {
    x: 0.72, y: 1.02, w: 4.0, h: 0.3,
    fontSize: 10.5, bold: true, color: GRN, fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 0.72, y: 1.36, w: 3.9, h: 0, line: { color: BG3, width: 1 } });

  s.addText(mkLines([
    { text: "Minimum 12 characters long",                 good: true  },
    { text: "Mix upper, lower, numbers & symbols",        good: true  },
    { text: "Use a password manager (Bitwarden, 1Pass)",  good: true  },
    { text: "Enable Multi-Factor Authentication (MFA)",   good: true  },
    { text: "Never reuse passwords across sites",         good: true  },
    { text: "NEVER use: birthdays, names, pet names",     good: false },
    { text: "NEVER use: password123, qwerty, admin",      good: false },
  ]), { x: 0.72, y: 1.48, w: 4.0, h: 3.4 });

  // Right column — Browsing habits
  rect(s, 5.1, 0.92, 4.45, 4.2, CARD1, BG3);
  rect(s, 5.1, 0.92, 0.08, 4.2, BLU);
  s.addText("🌐  SAFE BROWSING HABITS", {
    x: 5.32, y: 1.02, w: 4.0, h: 0.3,
    fontSize: 10.5, bold: true, color: BLU, fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 5.32, y: 1.36, w: 3.9, h: 0, line: { color: BG3, width: 1 } });
  s.addText(mkLines([
    { text: "Verify URLs carefully before clicking",          good: true  },
    { text: "Always look for the HTTPS padlock",              good: true  },
    { text: "Log out after sessions on shared devices",       good: true  },
    { text: "Keep browser and OS fully updated",              good: true  },
    { text: "Avoid public Wi-Fi without a VPN",               good: false },
    { text: "Never click pop-up 'security alert' windows",    good: false },
    { text: "Never save passwords on shared computers",       good: false },
  ]), { x: 5.32, y: 1.48, w: 4.0, h: 3.4 });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 10 — SUSPICIOUS EMAIL RESPONSE PLAN
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  topBar(s, BLU);
  addTitle(s, "Received a Suspicious Email? Here's Your Action Plan", 0.18);
  titleDivider(s, 0.82);

  const steps = [
    { num: "1", icon: "✋", label: "STOP",    color: RED, desc: "Do not click any links or open attachments" },
    { num: "2", icon: "🔍", label: "EXAMINE", color: AMB, desc: "Check sender, subject, grammar, urgency cues" },
    { num: "3", icon: "📞", label: "VERIFY",  color: BLU, desc: "Call the sender using a known phone number" },
    { num: "4", icon: "📤", label: "REPORT",  color: GRN, desc: "Forward to security@company.com or use the Report button" },
    { num: "5", icon: "🗑", label: "DELETE",  color: MUT, desc: "Remove from inbox and empty your trash" },
  ];

  const sW = 1.7, sH = 2.5, sY = 0.96, sGap = 0.1;
  const totalW = steps.length * sW + (steps.length - 1) * sGap;
  const startX = (10 - totalW) / 2;

  steps.forEach((st, i) => {
    const x = startX + i * (sW + sGap);
    rect(s, x, sY, sW, sH, CARD2, BG3);

    // Top color header
    rect(s, x, sY, sW, 0.08, st.color);

    // Step number circle (drawn as rectangle for compatibility)
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + sW / 2 - 0.28, y: sY + 0.2, w: 0.56, h: 0.56,
      fill: { color: st.color }, line: { color: st.color, width: 0 }
    });
    s.addText(st.num, {
      x: x + sW / 2 - 0.28, y: sY + 0.2, w: 0.56, h: 0.56,
      fontSize: 18, bold: true, color: WHT,
      fontFace: "Calibri", align: "center", valign: "middle", margin: 0
    });
    // Icon
    s.addText(st.icon, {
      x, y: sY + 0.88, w: sW, h: 0.52,
      fontSize: 24, align: "center"
    });
    // Label
    s.addText(st.label, {
      x, y: sY + 1.44, w: sW, h: 0.3,
      fontSize: 11, bold: true, color: st.color,
      fontFace: "Calibri", align: "center", margin: 0
    });
    // Divider
    s.addShape(pres.shapes.LINE, { x: x + 0.15, y: sY + 1.76, w: sW - 0.3, h: 0, line: { color: BG3, width: 1 } });
    // Description
    s.addText(st.desc, {
      x: x + 0.1, y: sY + 1.85, w: sW - 0.2, h: 0.58,
      fontSize: 8.5, color: LIT,
      fontFace: "Calibri", align: "center", margin: 0
    });

    // Arrow between cards
    if (i < steps.length - 1) {
      s.addText("→", {
        x: x + sW, y: sY + sH / 2 - 0.2, w: sGap + 0.05, h: 0.4,
        fontSize: 14, bold: true, color: BG3,
        fontFace: "Calibri", align: "center", margin: 0
      });
    }
  });

  // NEVER do box — placed below both cards (cards end at y≈4.47)
  rect(s, 0.5, 4.58, 4.55, 0.78, "2B0A0A", RED);
  rect(s, 0.5, 4.58, 0.08, 0.78, RED);
  s.addText("NEVER:", {
    x: 0.72, y: 4.64, w: 0.8, h: 0.24,
    fontSize: 9.5, bold: true, color: RED, fontFace: "Calibri", margin: 0
  });
  s.addText("Reply  |  Click links  |  Download attachments  |  Share credentials", {
    x: 0.72, y: 4.91, w: 4.1, h: 0.3,
    fontSize: 9, color: LIT, fontFace: "Calibri", margin: 0
  });

  // Emergency contact — placed alongside NEVER box
  rect(s, 5.2, 4.58, 4.35, 0.78, "0A1E38", BLU);
  rect(s, 5.2, 4.58, 0.08, 0.78, BLU);
  s.addText("If you clicked a link:", {
    x: 5.4, y: 4.64, w: 3.9, h: 0.24,
    fontSize: 9.5, bold: true, color: BLU, fontFace: "Calibri", margin: 0
  });
  s.addText("Call IT Security immediately: ext. 1234", {
    x: 5.4, y: 4.91, w: 3.9, h: 0.3,
    fontSize: 9, color: WHT, fontFace: "Calibri", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDES 11–14 — LAB SESSIONS
// ════════════════════════════════════════════════════════════════════════
const labs = [
  {
    num: "1", title: "Phishing Email Identification", duration: "20 min",
    objective: "Identify real vs. fake phishing emails from a set of samples",
    steps: [
      "Receive 10 sample emails (mix of legitimate and phishing)",
      "For each email, mark: SAFE / PHISHING / UNSURE",
      "Identify 3 specific red flags in each phishing email",
      "Record sender domain, link URLs, and emotional triggers",
      "Discuss findings with your group",
    ],
    success: "Correctly identify 8 out of 10 emails",
    tools: "Printed email samples or phishing-sim platform",
    learning: "Domain spoofing, urgency tactics, link analysis",
  },
  {
    num: "2", title: "URL & Domain Analysis", duration: "15 min",
    objective: "Detect malicious URLs and identify fake domains",
    steps: [
      "Analyse 15 URLs provided on your worksheet",
      "Classify each: Legitimate / Suspicious / Malicious",
      "Use VirusTotal (virustotal.com) to scan 3 URLs live",
      "Identify: typosquatting, subdomain tricks, HTTP vs HTTPS",
      "Write down why each suspicious URL is dangerous",
    ],
    success: "Correctly classify 12 out of 15 URLs",
    tools: "URL worksheet, VirusTotal.com, web browser",
    learning: "URL structure, subdomain abuse, HTTPS verification",
  },
  {
    num: "3", title: "Password Strength & MFA Setup", duration: "20 min",
    objective: "Create strong passwords and enable multi-factor authentication",
    steps: [
      "PART A — Rate 5 sample passwords: Weak / Medium / Strong",
      "Rewrite each sample password to make it strong",
      "Check sample emails on HaveIBeenPwned.com",
      "PART B — Walk through enabling MFA on a demo account",
      "Configure Google Authenticator and practice login with MFA code",
    ],
    success: "All 5 passwords upgraded + MFA successfully configured",
    tools: "Password worksheet, demo account, Google Authenticator app",
    learning: "Password entropy, MFA setup, breach checking",
  },
  {
    num: "4", title: "Phishing Simulation Response Drill", duration: "25 min",
    objective: "Practice the complete 5-step response to a phishing email",
    steps: [
      "SCENARIO: Receive email from 'IT Support' to reset your password",
      "Examine email using the 5-step checklist from Slide 10",
      "Identify ALL red flags present in the email",
      "Draft a security incident report using the template provided",
      "Role-play: Call 'IT Support' to verify (trainer plays IT Support)",
    ],
    success: "Correct identification of all red flags + proper reporting completed",
    tools: "Scenario email printout, incident report template, role-play partner",
    learning: "Full response workflow, verification call, incident reporting",
  },
];

labs.forEach((lab) => {
  const s = pres.addSlide();
  s.background = { color: BGTL };
  topBar(s, TEL);

  // Lab header area
  rect(s, 0, 0, 10, 1.1, "0A2420");
  s.addShape(pres.shapes.LINE, { x: 0, y: 1.1, w: 10, h: 0, line: { color: TEL, width: 2 } });

  // Lab number badge
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 0.18, w: 0.9, h: 0.72,
    fill: { color: TEL }, line: { color: TEL, width: 0 }
  });
  s.addText("LAB\n" + lab.num, {
    x: 0.5, y: 0.18, w: 0.9, h: 0.72,
    fontSize: 12, bold: true, color: WHT,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });

  // Title
  s.addText(lab.title, {
    x: 1.6, y: 0.18, w: 6.5, h: 0.45,
    fontSize: 20, bold: true, color: WHT,
    fontFace: "Calibri", margin: 0
  });
  // Duration badge
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.3, y: 0.22, w: 1.25, h: 0.3,
    fill: { color: TEL, transparency: 65 },
    line: { color: TEL, width: 1 }
  });
  s.addText("⏱  " + lab.duration, {
    x: 8.3, y: 0.22, w: 1.25, h: 0.3,
    fontSize: 8.5, bold: true, color: TEL,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });

  // Objective
  s.addText("OBJECTIVE", {
    x: 0.5, y: 0.66, w: 1.1, h: 0.22,
    fontSize: 7.5, bold: true, color: MUT, charSpacing: 1,
    fontFace: "Calibri", margin: 0
  });
  s.addText(lab.objective, {
    x: 1.65, y: 0.64, w: 7.5, h: 0.3,
    fontSize: 10, italic: true, color: LIT,
    fontFace: "Calibri", margin: 0
  });

  // Two columns below header
  // Left: Instructions
  rect(s, 0.5, 1.25, 5.6, 3.35, CARDTL, TEL);
  rect(s, 0.5, 1.25, 0.08, 3.35, TEL);
  s.addText("STEP-BY-STEP INSTRUCTIONS", {
    x: 0.72, y: 1.35, w: 5.2, h: 0.26,
    fontSize: 8.5, bold: true, color: TEL, charSpacing: 1.5,
    fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 0.72, y: 1.65, w: 5.0, h: 0, line: { color: BG3, width: 1 } });

  lab.steps.forEach((step, idx) => {
    const y = 1.75 + idx * 0.52;
    // Step number
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.72, y: y + 0.04, w: 0.28, h: 0.28,
      fill: { color: TEL }, line: { color: TEL, width: 0 }
    });
    s.addText(String(idx + 1), {
      x: 0.72, y: y + 0.04, w: 0.28, h: 0.28,
      fontSize: 9, bold: true, color: WHT,
      fontFace: "Calibri", align: "center", valign: "middle", margin: 0
    });
    s.addText(step, {
      x: 1.1, y, w: 4.8, h: 0.42,
      fontSize: 10, color: LIT, fontFace: "Calibri",
      valign: "middle", margin: 0
    });
  });

  // Right: Success + Tools + Learning
  rect(s, 6.28, 1.25, 3.25, 1.05, CARDTL, TEL);
  rect(s, 6.28, 1.25, 0.08, 1.05, GRN);
  s.addText("SUCCESS CRITERIA", {
    x: 6.48, y: 1.35, w: 2.85, h: 0.22,
    fontSize: 8, bold: true, color: GRN, charSpacing: 1,
    fontFace: "Calibri", margin: 0
  });
  s.addText(lab.success, {
    x: 6.48, y: 1.6, w: 2.85, h: 0.55,
    fontSize: 9.5, color: WHT, fontFace: "Calibri", margin: 0
  });

  rect(s, 6.28, 2.42, 3.25, 1.0, CARDTL, TEL);
  rect(s, 6.28, 2.42, 0.08, 1.0, AMB);
  s.addText("TOOLS REQUIRED", {
    x: 6.48, y: 2.52, w: 2.85, h: 0.22,
    fontSize: 8, bold: true, color: AMB, charSpacing: 1,
    fontFace: "Calibri", margin: 0
  });
  s.addText(lab.tools, {
    x: 6.48, y: 2.77, w: 2.85, h: 0.55,
    fontSize: 9.5, color: LIT, fontFace: "Calibri", margin: 0
  });

  rect(s, 6.28, 3.54, 3.25, 1.06, CARDTL, TEL);
  rect(s, 6.28, 3.54, 0.08, 1.06, BLU);
  s.addText("KEY LEARNING", {
    x: 6.48, y: 3.64, w: 2.85, h: 0.22,
    fontSize: 8, bold: true, color: BLU, charSpacing: 1,
    fontFace: "Calibri", margin: 0
  });
  s.addText(lab.learning, {
    x: 6.48, y: 3.89, w: 2.85, h: 0.6,
    fontSize: 9.5, color: LIT, fontFace: "Calibri", margin: 0
  });
});

// ════════════════════════════════════════════════════════════════════════
// SLIDE 15 — KEY TAKEAWAYS
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG1 };
  topBar(s, GRN);
  addTitle(s, "Your Cybersecurity Pledge — Key Takeaways", 0.18);
  titleDivider(s, 0.82);

  const takeaways = [
    { icon: "🎯", text: "Think Before You Click",       sub: "Verify every link and sender address before acting", color: RED },
    { icon: "🔐", text: "Strong Passwords + MFA",       sub: "Use unique passwords and enable MFA on everything",  color: BLU },
    { icon: "📧", text: "Always Report Suspicious Mail", sub: "Never ignore — report to the security team every time", color: AMB },
    { icon: "🧠", text: "Attackers Target Emotions",    sub: "Stay calm, slow down, and verify through official channels", color: PUR },
    { icon: "📱", text: "Extra Caution on Mobile",      sub: "Shorter URLs hide more on mobile — always inspect fully", color: TEL },
    { icon: "🤝", text: "Security Is a Team Effort",    sub: "You are the last — and strongest — line of defence", color: GRN },
  ];

  const cW = 2.85, cH = 1.42, gX = 0.28, gY = 0.22;
  const startX = 0.5, startY = 0.9;

  takeaways.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = startX + col * (cW + gX);
    const y = startY + row * (cH + gY);

    rect(s, x, y, cW, cH, CARD1, BG3);
    rect(s, x, y, 0.08, cH, t.color);

    s.addText(t.icon, {
      x: x + 0.18, y: y + 0.14, w: 0.52, h: 0.52,
      fontSize: 24, align: "center", valign: "middle"
    });
    s.addText(t.text, {
      x: x + 0.76, y: y + 0.16, w: cW - 0.82, h: 0.35,
      fontSize: 11.5, bold: true, color: WHT, fontFace: "Calibri", margin: 0
    });
    s.addShape(pres.shapes.LINE, { x: x + 0.18, y: y + 0.76, w: cW - 0.3, h: 0, line: { color: BG3, width: 1 } });
    s.addText(t.sub, {
      x: x + 0.18, y: y + 0.84, w: cW - 0.24, h: 0.5,
      fontSize: 9, color: LIT, fontFace: "Calibri", margin: 0
    });
  });

  // Pledge box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 5.08, w: 9, h: 0.4,
    fill: { color: GRN, transparency: 82 },
    line: { color: GRN, width: 1 }
  });
  s.addText('"I will stay vigilant, report threats, and protect our organisation."', {
    x: 0.5, y: 5.08, w: 9, h: 0.4,
    fontSize: 11.5, italic: true, bold: true, color: GRN,
    fontFace: "Calibri", align: "center", valign: "middle", margin: 0
  });
}

// ════════════════════════════════════════════════════════════════════════
// SLIDE 16 — RESOURCES & CONTACTS
// ════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  topBar(s, BLU);
  addTitle(s, "Resources & Security Contacts", 0.18);
  titleDivider(s, 0.82);

  // Quick Reference Card
  rect(s, 0.5, 0.92, 4.5, 2.9, CARD2, BLU);
  rect(s, 0.5, 0.92, 0.08, 2.9, BLU);
  s.addText("📋  QUICK REFERENCE CARD", {
    x: 0.72, y: 1.02, w: 4.1, h: 0.28,
    fontSize: 10, bold: true, color: BLU, fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 0.72, y: 1.34, w: 3.9, h: 0, line: { color: BG3, width: 1 } });
  const contacts = [
    ["📧 Report Phishing",      "security@jetking.com"],
    ["📞 IT Security Hotline",  "Extension 1234"],
    ["🔑 Password Manager",     "IT Helpdesk — Bitwarden"],
    ["🔒 MFA Help",             "helpdesk@jetking.com"],
  ];
  contacts.forEach(([k, v], i) => {
    const y = 1.45 + i * 0.52;
    s.addText(k, { x: 0.72, y, w: 1.8, h: 0.35, fontSize: 10, color: LIT, fontFace: "Calibri", margin: 0 });
    s.addText(v, { x: 2.55, y, w: 2.2, h: 0.35, fontSize: 10, bold: true, color: WHT, fontFace: "Calibri", margin: 0 });
    if (i < contacts.length - 1) {
      s.addShape(pres.shapes.LINE, { x: 0.72, y: y + 0.38, w: 3.8, h: 0, line: { color: BG3, width: 1 } });
    }
  });

  // Useful Tools column
  rect(s, 5.2, 0.92, 4.3, 1.3, CARD2, TEL);
  rect(s, 5.2, 0.92, 0.08, 1.3, TEL);
  s.addText("🛠  USEFUL TOOLS", {
    x: 5.4, y: 1.02, w: 3.9, h: 0.26,
    fontSize: 10, bold: true, color: TEL, fontFace: "Calibri", margin: 0
  });
  const tools = ["VirusTotal.com — scan links & files", "HaveIBeenPwned.com — check breached emails", "Google Safe Browsing — link checker", "PhishTank.com — phishing URL database"];
  s.addText(tools.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < tools.length - 1, color: LIT, fontSize: 9.5, fontFace: "Calibri" } })),
    { x: 5.4, y: 1.32, w: 3.9, h: 0.82 }
  );

  // Training Resources
  rect(s, 5.2, 2.35, 4.3, 1.47, CARD2, AMB);
  rect(s, 5.2, 2.35, 0.08, 1.47, AMB);
  s.addText("🎓  TRAINING RESOURCES", {
    x: 5.4, y: 2.45, w: 3.9, h: 0.26,
    fontSize: 10, bold: true, color: AMB, fontFace: "Calibri", margin: 0
  });
  const training = ["SANS Security Awareness Training", "KnowBe4 Security Training Platform", "CISA Free Cybersecurity Resources", "NCSC (UK) Phishing Guidance"];
  s.addText(training.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < training.length - 1, color: LIT, fontSize: 9.5, fontFace: "Calibri" } })),
    { x: 5.4, y: 2.75, w: 3.9, h: 0.98 }
  );

  // Final bottom panel
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 4.12, w: 10, h: 1.12,
    fill: { color: "0A1628" }, line: { color: BLU, width: 0 }
  });
  s.addShape(pres.shapes.LINE, { x: 0, y: 4.12, w: 10, h: 0, line: { color: BLU, width: 2 } });
  s.addText("Thank You — Stay Safe, Stay Vigilant", {
    x: 0.5, y: 4.22, w: 9, h: 0.45,
    fontSize: 18, bold: true, color: WHT,
    fontFace: "Calibri", align: "center", margin: 0
  });
  s.addText("Jetking Infotrain Ltd  |  Cybersecurity Awareness Program 2025  |  security@jetking.com", {
    x: 0.5, y: 4.7, w: 9, h: 0.3,
    fontSize: 9.5, color: MUT,
    fontFace: "Calibri", align: "center", margin: 0
  });
  rect(s, 0, 5.525, 10, 0.1, BLU);
}

// ════════════════════════════════════════════════════════════════════════
// SAVE
// ════════════════════════════════════════════════════════════════════════
const outPath = process.argv[2] || "Cybersecurity_Awareness_Training.pptx";
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("SUCCESS: " + outPath);
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
