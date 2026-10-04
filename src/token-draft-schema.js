// Pure, unmounted token metadata contract. No URL reads or image-byte processing.
// 2048 characters is a NEW bounded metadata URL limit, not an existing utility limit.
// coin:null remains the caller's identity-only sentinel; it is not a token draft.
const fields = ['name', 'ticker', 'description', 'image', 'website', 'twitter', 'telegram'];
const urls = ['image', 'website', 'twitter', 'telegram'];
const encoder = new TextEncoder();
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const descriptionControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function fail(code, field = 'input') {
 const error = new TypeError(`${code}: ${field}`);
 error.code = code;
 error.field = field;
 throw error;
}

function validUnicode(value) {
 // Reject lone surrogates rather than silently replace bytes in launch snapshots.
 for (let i = 0; i < value.length; i++) {
  const c = value.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff) {
   const next = value.charCodeAt(++i);
   if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
  } else if (c >= 0xdc00 && c <= 0xdfff) return false;
 }
 return true;
}

function url(value, field) {
 if (typeof value !== 'string') fail('TOKEN_DRAFT_TYPE', field);
 if (!value || value.length > 2048 || controls.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)|%c2%[89][0-9a-f]/i.test(value) || !validUnicode(value) || value.trim() !== value || /\\/.test(value)) fail('TOKEN_DRAFT_URL', field);
 let parsed;
 try { parsed = new URL(value); } catch { fail('TOKEN_DRAFT_URL', field); }
 const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
 // Matches the existing public-image-origin prohibition on localhost and IPs.
 // This is lexical validation, not DNS/publication/availability verification.
 if (!/^https:\/\/[^/?#]+(?:[/?#]|$)/i.test(value) || parsed.protocol !== 'https:' || parsed.username || parsed.password || /^https:\/\/[^/?#]*@/i.test(value) || !host || host === 'localhost' || host.endsWith('.localhost') || host.startsWith('[') || /^[\d.:\[\]]+$/.test(host)) fail('TOKEN_DRAFT_URL', field);
 const normalized = parsed.href;
 if (normalized.length > 2048) fail('TOKEN_DRAFT_URL', field);
 return normalized;
}

/**
 * Accept own scalar fields only; optional fields absent from input stay omitted.
 * Required name/ticker preserve their exact text/case, including legacy values.
 * Description is plain text (multiline allowed), never escaped markup or Agent text.
 * Returns a fresh frozen flat object. Throws TypeError with fixed code/field only.
 */
export function normalizeTokenDraft(input) {
 let descriptors, plain;
 try {
  plain = !!input && typeof input === 'object' && !Array.isArray(input);
  if (plain) {
   const prototype = Object.getPrototypeOf(input);
   plain = prototype === Object.prototype || prototype === null;
   if (plain) descriptors = Object.getOwnPropertyDescriptors(input);
  }
 } catch {
  // Reflective proxy exceptions must not expose arbitrary thrown input/secrets.
  fail('TOKEN_DRAFT_INPUT');
 }
 if (!plain) fail('TOKEN_DRAFT_INPUT');
 if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !fields.includes(key))) fail('TOKEN_DRAFT_UNKNOWN_FIELD');
 for (const field of fields) {
  const descriptor = descriptors[field];
  if (descriptor && (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)) fail('TOKEN_DRAFT_FIELD', field);
 }
 const output = {};
 for (const [field, limit] of [['name', 32], ['ticker', 10]]) {
  const value = descriptors[field]?.value;
  if (typeof value !== 'string') fail('TOKEN_DRAFT_TYPE', field);
  if (value.length > limit || !value.trim() || controls.test(value) || !validUnicode(value) || encoder.encode(value).length > limit) fail('TOKEN_DRAFT_TEXT', field);
  output[field] = value;
 }
 if (descriptors.description) {
  const value = descriptors.description.value;
  if (typeof value !== 'string') fail('TOKEN_DRAFT_TYPE', 'description');
  if (value.length > 1000 || descriptionControls.test(value) || !validUnicode(value)) fail('TOKEN_DRAFT_TEXT', 'description');
  output.description = value;
 }
 for (const field of urls) if (descriptors[field]) output[field] = url(descriptors[field].value, field);
 return Object.freeze(output);
}
