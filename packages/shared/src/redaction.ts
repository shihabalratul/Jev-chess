/** Shared conservative redaction before evidence enters durable storage. */
export function redact(value: unknown, secrets: string[] = [], depth=0): unknown {
    if (depth>18) return '[depth limit]';
    if (typeof value==='string') {
        let text=value.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1[redacted]@').replace(/([?&](?:token|api_key|password|secret|key)=)[^&#\s]+/gi,'$1[redacted]').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'Bearer [redacted]').replace(/sk-or-[A-Za-z0-9_-]+/g,'[redacted]');
        for(const secret of secrets) if(secret.length>=4) text=text.split(secret).join('[redacted]');
        return text;
    }
    if(value instanceof Error)return {name:value.name,message:redact(value.message,secrets,depth+1),stack:redact(value.stack,secrets,depth+1)};
    if(Array.isArray(value)) return value.map(v=>redact(v,secrets,depth+1));
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/authorization|cookie|password|secret|api.?key|backend.?token|pairing.?token|x.?jev.?token|^token$|access.?token|refresh.?token/i.test(k)?'[redacted]':redact(v,secrets,depth+1)]));
    return value;
}
