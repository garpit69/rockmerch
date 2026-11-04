import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const maxMemory = 64 * 1024 * 1024;
const defaultCost = 32768;
const blockSize = 8;
const parallelization = 1;

export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, keyLength, {
    N: defaultCost,
    r: blockSize,
    p: parallelization,
    maxmem: maxMemory,
  });
  return [
    'scrypt',
    defaultCost,
    blockSize,
    parallelization,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
};

export const verifyPassword = async (password, storedHash) => {
  const [algorithm, costText, blockText, parallelText, saltText, keyText, extra] =
    String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || extra !== undefined) return false;
  const cost = Number(costText);
  const r = Number(blockText);
  const p = Number(parallelText);
  if (
    !Number.isInteger(cost) || cost < 16384 || cost > 131072
    || !Number.isInteger(r) || r < 1 || r > 16
    || !Number.isInteger(p) || p < 1 || p > 4
    || !/^[A-Za-z0-9_-]{22}$/.test(saltText || '')
    || !/^[A-Za-z0-9_-]{86}$/.test(keyText || '')
  ) {
    return false;
  }
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(keyText, 'base64url');
  const actual = await scrypt(password, salt, expected.length, {
    N: cost,
    r,
    p,
    maxmem: maxMemory,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
