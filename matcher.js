const nodemailer = require("nodemailer");

// Add paying SME subscribers here (or load from a JSON/Sheet)
const SUBSCRIBERS = [
  {
    company: "Oxfordshire Commercial Cleaning Ltd",
    email: "sebastianvtesta@gmail.com",
    keywords: ["cleaning", "janitorial", "facilities", "waste"],
    maxBudget: 122000
  }
];

async function fetchRecentTenders() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const url = `https://service.gov.uk{yesterday}&limit=50`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Contracts Finder API error: ${res.status}`);
  const data = await res.json();
  return data.releases || [];
}

function formatTender(release) {
  const tender = release.tender || {};
  const buyer = release.buyer?.name || "UK Public Sector Buyer";
  const title = tender.title || "Untitled Contract";
  const desc = (tender.description || "").replace(/\s+/g, " ").slice(0, 260) + "...";
  const value = tender.value?.amount ? `£${Number(tender.value.amount).toLocaleString()}` : "Value not specified";
  const rawVal = Number(tender.value?.amount || 0);
  const deadline = tender.tenderPeriod?.endDate
    ? new Date(tender.tenderPeriod.endDate).toLocaleDateString("en-GB")
    : "Check notice";
  const noticeUrl = `https://service.gov.uk{release.ocid?.replace("ocds-b5fd17-", "")}`;

  return { title, buyer, desc, value, rawVal, deadline, noticeUrl };
}

async function run() {
  const releases = await fetchRecentTenders();
  const parsed = releases.map(formatTender);
  console.log(`Fetched ${parsed.length} UK government notices from the last 24h.`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("SMTP secrets not set yet — printing sample matches to GitHub Actions log:");
    console.log(parsed.slice(0, 3));
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  for (const sub of SUBSCRIBERS) {
    const matches = parsed.filter((t) => {
      const text = `${t.title} ${t.desc}`.toLowerCase();
      const keywordHit = sub.keywords.some((kw) => text.includes(kw.toLowerCase()));
      const budgetHit = t.rawVal === 0 || t.rawVal <= sub.maxBudget;
      return keywordHit && budgetHit;
    });

    if (matches.length === 0) continue;

    const htmlList = matches
      .map(
        (m) => `
        <div style="border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:12px;">
          <h3 style="margin:0 0 6px; color:#0f172a;">${m.title}</h3>
          <p style="margin:0 0 6px; font-size:13px; color:#475569;"><b>Buyer:</b> ${m.buyer} | <b>Est. Value:</b> ${m.value} | <b>Deadline:</b> ${m.deadline}</p>
          <p style="margin:0 0 10px; font-size:14px; color:#334155;">${m.desc}</p>
          <a href="${m.noticeUrl}" style="background:#10b981; color:#fff; padding:8px 12px; border-radius:6px; text-decoration:none; font-size:13px; font-weight:bold;">View Official UK Gov Notice &rarr;</a>
        </div>`
      )
      .join("");

    await transporter.sendMail({
      from: `"TenderPing UK" <${process.env.SMTP_USER}>`,
      to: sub.email,
      subject: `TenderPing Daily: ${matches.length} New UK Gov Contract(s) for ${sub.company}`,
      html: `<h2>Morning Brief — New UK Public Sector Contracts</h2><p>Here are today's Contracts Finder matches filtered for <b>${sub.company}</b>:</p>${htmlList}`
    });

    console.log(`Sent ${matches.length} tender matches to ${sub.email}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
