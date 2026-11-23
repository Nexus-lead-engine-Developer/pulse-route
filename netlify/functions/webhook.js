const twilio = require("twilio");

const AGENCIES = {
  "pilot-agency-1": {
    agencyName: "Apex Solar Marketing",
    companyDisplay: "Oxfordshire Solar Ltd",
    repPhone: "+447700900001",
    plan: "pilot",
    leadsUsed: 0
  }
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const key = event.queryStringParameters?.key || data.agency_key;
    const account = AGENCIES[key];

    if (!account) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid agency key" }) };
    }

    if (account.plan === "pilot" && account.leadsUsed >= 50) {
      return { statusCode: 402, body: JSON.stringify({ error: "14-day pilot cap (50 leads) reached. Upgrade to Wholesale Pro." }) };
    }

    const name = data.name || "there";
    const postcode = (data.postcode || "").toUpperCase();
    const rawPhone = (data.phone || "").replace(/\s+/g, "");
    const phone = rawPhone.startsWith("0") ? "+44" + rawPhone.slice(1) : rawPhone;

    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

    await client.messages.create({
      to: phone,
      from: process.env.TWILIO_NUMBER,
      body: `Hi ${name}, thanks for requesting a quote with ${account.companyDisplay}${postcode ? ` (${postcode})` : ""}. Reply YES to confirm your number so our specialist can call you right away.`
    });

    await client.messages.create({
      to: account.repPhone,
      from: process.env.TWILIO_NUMBER,
      body: `NEW LEAD (${account.agencyName}): ${name} | ${phone} | ${postcode} — 10s SMS sent.`
    });

    account.leadsUsed += 1;

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "dispatched", agency: account.agencyName, leadsUsed: account.leadsUsed })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
