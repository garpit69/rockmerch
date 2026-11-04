import { neon } from '@neondatabase/serverless';

const maxAttempts = 5;
const batchSize = 10;
const claimLeaseSeconds = 600;
const validSender = (value) => /^(?:[^<>]*<[^<>\s]+@[^<>\s]+\.[^<>\s]+>|[^<>\s]+@[^<>\s]+\.[^<>\s]+)$/
  .test(value.trim());

const sendWithResend = async (message) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [message.recipient],
      subject: message.subject,
      text: message.body,
    }),
  });
  if (!response.ok) {
    const errorText = (await response.text()).slice(0, 500);
    throw new Error(`Resend returned ${response.status}: ${errorText}`);
  }
};

export default async () => {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Database is not configured.' }, { status: 503 });
  }
  if (!process.env.RESEND_API_KEY?.trim()
    || !process.env.EMAIL_FROM
    || !validSender(process.env.EMAIL_FROM)) {
    return Response.json({ error: 'Resend email is not configured.' }, { status: 503 });
  }

  const sql = neon(process.env.DATABASE_URL);
  const now = Math.floor(Date.now() / 1000);
  await sql`
    UPDATE email_outbox
    SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'failed' ELSE 'pending' END,
        last_error = CASE WHEN attempts >= ${maxAttempts}
          THEN 'Delivery lease expired after the final attempt.' ELSE last_error END
    WHERE status = 'sending' AND available_at <= ${now}
  `;

  const messages = await sql`
    WITH candidates AS (
      SELECT id
      FROM email_outbox
      WHERE status = 'pending'
        AND available_at <= ${now}
        AND attempts < ${maxAttempts}
      ORDER BY available_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE email_outbox AS outbox
    SET status = 'sending',
        attempts = outbox.attempts + 1,
        available_at = ${now + claimLeaseSeconds}
    FROM candidates
    WHERE outbox.id = candidates.id
    RETURNING outbox.id, outbox.recipient, outbox.subject, outbox.body, outbox.attempts
  `;

  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    let deliveryError = null;
    try {
      await sendWithResend(message);
    } catch (error) {
      deliveryError = error;
    }

    if (!deliveryError) {
      const [updated] = await sql`
        UPDATE email_outbox
        SET status = 'sent', last_error = '', sent_at = NOW()
        WHERE id = ${message.id} AND status = 'sending'
        RETURNING id
      `;
      if (!updated) throw new Error('Email outbox item was not marked as sent.');
      sent += 1;
      continue;
    }

    const attempts = Number(message.attempts);
    const exhausted = attempts >= maxAttempts;
    const retryDelay = Math.min(60 * (2 ** (attempts - 1)), 3600);
    const lastError = String(deliveryError?.message || 'Email delivery failed.').slice(0, 500);
    const [updated] = await sql`
      UPDATE email_outbox
      SET status = ${exhausted ? 'failed' : 'pending'},
          available_at = ${now + retryDelay},
          last_error = ${lastError}
      WHERE id = ${message.id} AND status = 'sending'
      RETURNING id
    `;
    if (!updated) {
      console.error('Email delivery failed and its outbox state could not be updated.', deliveryError);
      throw new Error('Could not update failed email outbox item.');
    }
    failed += 1;
    console.error(`Resend delivery attempt ${attempts} failed for outbox item ${message.id}.`, deliveryError);
  }

  return Response.json({
    processed: messages.length,
    sent,
    failed,
  }, { status: failed ? 500 : 200 });
};

export const config = { schedule: '* * * * *' };
