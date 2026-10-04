import argon2 from 'argon2';
import type { Config } from '../../infrastructure/config/config.js';
export function passwordService(c: Config) {
  const options = {
    type: argon2.argon2id,
    memoryCost: c.ARGON2_MEMORY_KIB,
    timeCost: c.ARGON2_TIME_COST,
    parallelism: c.ARGON2_PARALLELISM,
  };
  const dummyHash = argon2.hash('dummy-password-never-an-account', options);
  return {
    hash: (password: string) => argon2.hash(password, options),
    verify: (hash: string, password: string) => argon2.verify(hash, password),
    dummyVerify: async (password: string) =>
      argon2.verify(await dummyHash, password),
  };
}
