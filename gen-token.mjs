import { SignJWT } from 'jose';

const JWT_SECRET = '18b7fbc0bed0dab5f6dc216a5dd9be72e8bbfe5f3c10ed309627b4d557ae8d37';
const JWT_TTL_SEC = 86400;
const JWT_ALG = 'HS256';

async function generateToken() {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const jti = crypto.randomUUID();
    
    const token = await new SignJWT({ role: 'ADMIN', jti })
        .setProtectedHeader({ alg: JWT_ALG })
        .setSubject('019eac67-1b0d-7b18-997c-7efbad3d32d8')
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_TTL_SEC)
        .setJti(jti)
        .sign(secret);
    
    console.log(token);
}

generateToken().catch(console.error);