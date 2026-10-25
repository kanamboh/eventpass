import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Argon2id Password Security Configuration
 * Strictly adheres to OWASP ASVS Level 2 password storage recommendations.
 * - Algorithm: Argon2id (hybrid data-dependent / data-independent memory-hard function)
 * - Memory Cost: 65,536 KiB (64 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 4 threads
 */
const ARGON2ID_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
};

/**
 * Hash a plain text password using Argon2id
 * @param {string} password 
 * @returns {Promise<string>} Encoded Argon2id hash
 */
export const hashPassword = async (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a valid non-empty string');
  }
  return hash(password, ARGON2ID_OPTIONS);
};

/**
 * Verify a plain text password against an Argon2id hash
 * Constant-time comparison handled internally by libargon2
 * @param {string} passwordHash 
 * @param {string} candidatePassword 
 * @returns {Promise<boolean>}
 */
export const verifyPassword = async (passwordHash, candidatePassword) => {
  if (!passwordHash || !candidatePassword) {
    return false;
  }
  try {
    return await verify(passwordHash, candidatePassword);
  } catch (err) {
    // If the hash format is corrupted or invalid, treat as verification failure
    return false;
  }
};
