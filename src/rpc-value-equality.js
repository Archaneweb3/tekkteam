// RPC JSON property order is not account state. Preserve every key and value,
// including optional fields: omitted space/rentEpoch never equals a present field.
export function sameRpcValue(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameRpcValue(a[k],b[k]));
}
