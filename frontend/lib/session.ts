import crypto from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  sub: string;
  exp: number;
  nonce: string;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSignature(input: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function createSessionToken(subject: string, secret: string) {
  const payload: SessionPayload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = getSignature(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = getSignature(encodedPayload, secret);
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (givenBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(givenBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (!payload?.sub || !payload?.exp || !payload?.nonce || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}
