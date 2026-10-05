// Fixed M4 freshness policy. A minimum is a pre-sign gate, never a TTL renewal.
export const M4_MIN_SIGN_LIFETIME_MS=15000;
export function assertM4ReviewLifetime(result,now=Date.now(),minimum=M4_MIN_SIGN_LIFETIME_MS){
 const r=result?.executionReview,remaining=r?.expiresAt-now;
 if(!Number.isSafeInteger(minimum)||minimum<M4_MIN_SIGN_LIFETIME_MS||minimum>30000||!Number.isSafeInteger(now)||!Number.isSafeInteger(r?.startedAt)||!Number.isSafeInteger(r?.expiresAt)||r.expiresAt!==r.startedAt+30000||now<r.startedAt||remaining<minimum)throw Object.assign(Error('Launch review too short; refresh before opening wallet.'),{code:'M4_REVIEW_LIFETIME_TOO_SHORT',status:409});
 return remaining;
}
