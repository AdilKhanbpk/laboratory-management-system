import crypto from 'crypto';

const SALT_BYTE_LENGTH = 32;
const KEY_BYTE_LENGTH = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 16384, // CPU/memory cost
  r: 8,     // Block size
  p: 1,     // Parallelization
  maxmem: 32 * 1024 * 1024,
};

export interface HashedPassword {
  hash: string;
  salt: string;
}

/**
 * Securely hashes a plain-text password using scrypt with random salt.
 */
export async function hashPassword(password: string): Promise<HashedPassword> {
  const salt = crypto.randomBytes(SALT_BYTE_LENGTH).toString('hex');
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_BYTE_LENGTH, SCRYPT_OPTIONS, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });

  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * Synchronous version for situations where synchronous execution is needed.
 */
export function hashPasswordSync(password: string, customSalt?: string): HashedPassword {
  const salt = customSalt || crypto.randomBytes(SALT_BYTE_LENGTH).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_BYTE_LENGTH, SCRYPT_OPTIONS);
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * Verifies password using constant-time comparison to prevent timing attacks.
 */
export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, storedSalt, KEY_BYTE_LENGTH, SCRYPT_OPTIONS);
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (derived.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derived, storedBuffer);
  } catch {
    return false;
  }
}

