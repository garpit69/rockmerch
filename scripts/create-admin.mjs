import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../lib/passwords.mjs';

const loadLocalEnvironment = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
};

const ask = (question) => new Promise((resolve) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  prompt.question(question, (answer) => {
    prompt.close();
    resolve(answer);
  });
});

const askHidden = (question) => new Promise((resolve, reject) => {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    reject(new Error('Run this command in an interactive terminal so the password can be hidden.'));
    return;
  }

  let value = '';
  process.stdout.write(question);
  input.setRawMode(true);
  input.resume();
  const finish = (error) => {
    input.setRawMode(false);
    input.pause();
    input.removeListener('data', onData);
    process.stdout.write('\n');
    if (error) reject(error);
    else resolve(value);
  };
  const onData = (chunk) => {
    for (const byte of chunk) {
      if (byte === 3) {
        finish(new Error('Admin setup cancelled.'));
        return;
      }
      if (byte === 13 || byte === 10) {
        finish();
        return;
      }
      if (byte === 8 || byte === 127) {
        if (value) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (byte >= 32 && byte <= 126) {
        value += String.fromCharCode(byte);
        process.stdout.write('*');
      }
    }
  };
  input.on('data', onData);
});

loadLocalEnvironment();
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set in .env or the process environment.');
  process.exitCode = 1;
} else {
  try {
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error('Admin email is invalid.');
    }
    const password = await askHidden('New admin password (hidden, minimum 14 characters): ');
    const confirmation = await askHidden('Confirm admin password: ');
    if (password.length < 14 || password.length > 256) {
      throw new Error('Admin password must be between 14 and 256 characters.');
    }
    if (password !== confirmation) throw new Error('The passwords do not match.');

    const sql = neon(process.env.DATABASE_URL);
    const passwordHash = await hashPassword(password);
    const [user] = await sql`
      SELECT * FROM rockmerch_create_first_admin(${email}, ${passwordHash})
    `;
    if (!user) throw new Error('An admin already exists; this setup command only creates the first admin.');
    console.log(`Initial admin created for ${user.email}. Keep the password in a password manager.`);
  } catch (error) {
    console.error(error.message || 'Initial admin creation failed.');
    process.exitCode = 1;
  }
}
