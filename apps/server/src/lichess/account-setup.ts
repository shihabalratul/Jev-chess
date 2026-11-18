import { z } from 'zod';
const profileSchema=z.object({id:z.string(),username:z.string(),title:z.string().optional(),count:z.object({all:z.number().int().nonnegative()})});
/** Used only by the explicit setup CLI, never registered as a server route. */
export async function upgradeBotAccount(token:string,expected:string,confirm:(id:string)=>Promise<boolean>,transport:typeof fetch=fetch){
    if(!token.trim()||/\s/.test(token))throw new Error('Set LICHESS_TOKEN in the local backend .env');
    const headers={Authorization:`Bearer ${token}`};
    const response=await transport('https://lichess.org/api/account',{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error(`Lichess identity check failed (HTTP ${response.status})`);
    const account=profileSchema.parse(await response.json());
    if(account.id.toLowerCase()!==expected.toLowerCase())throw new Error('Account name does not match the authenticated token; no conversion attempted');
    if(account.title==='BOT')return {id:account.id,alreadyBot:true};
    if(account.count.all!==0)throw new Error('BOT conversion requires an account with zero games; no conversion attempted');
    if(!await confirm(account.id))throw new Error('Account conversion cancelled');
    const result=await transport('https://lichess.org/api/bot/account/upgrade',{method:'POST',headers,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!result.ok)throw new Error(`BOT upgrade returned HTTP ${result.status}; check the account before trying again`);
    z.object({ok:z.literal(true)}).parse(await result.json());return {id:account.id,alreadyBot:false};
}
