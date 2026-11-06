import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * M03 local-only Ed25519 contributor identity.
 *
 * Signatures establish key possession, NOT sensor location, quality, consent,
 * or truthfulness. The stable public key is linkable across submissions.
 */
export function openLocalIdentity(directory) {
  if (typeof directory !== 'string' || !directory.trim())
    throw new TypeError('A private identity directory is required');
  const dir = path.resolve(directory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error('Identity directory must be private (mode 0700)');
  const keyPath = path.join(dir, 'identity.ed25519.pem');
  let privateKey;
  if (existsSync(keyPath)) {
    const fileInfo = lstatSync(keyPath);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink() ||
        (fileInfo.mode & 0o177) !== 0)
      throw new Error('Identity key must be a private regular file (mode 0600)');
    privateKey = createPrivateKey(readFileSync(keyPath));
  } else {
    const pair = generateKeyPairSync('ed25519');
    // Exclusive creation prevents overwrites or accidental key replacement.
    const pem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' });
    writeFileSync(keyPath, pem, { flag: 'wx', mode: 0o600 });
    privateKey = pair.privateKey;
  }
  if (privateKey.asymmetricKeyType !== 'ed25519')
    throw new Error('Identity file is not Ed25519');
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const keyId = createHash('sha256').update(publicDer).digest('hex');
  return { privateKey, publicKey, publicDer, keyId };
}
