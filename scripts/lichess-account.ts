import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { LichessClient } from '../apps/server/src/lichess/client';
import { upgradeBotAccount } from '../apps/server/src/lichess/account-setup';
try{
    const args=process.argv.slice(2),token=process.env.LICHESS_TOKEN??'';
    if(!args.length){const account=await new LichessClient(token).account(new AbortController().signal);console.log(`Authenticated account: ${account.username} (${account.id}); title: ${account.title??'not BOT'}. Token is not displayed.`);}
    else if(args.length===2&&args[0]==='--upgrade'){
        if(!process.stdin.isTTY)throw new Error('Run account conversion yourself in an interactive terminal');
        const result=await upgradeBotAccount(token,args[1],async id=>{
            console.log(`WARNING: Converting ${id} to a BOT account is irreversible. Use only your fresh dedicated account.`);
            const prompt=createInterface({input:process.stdin,output:process.stdout});
            try{return await prompt.question(`Type "convert ${id}" to proceed: `)===`convert ${id}`;}finally{prompt.close();}
        });console.log(`${result.id}: ${result.alreadyBot?'already a BOT account':'BOT conversion succeeded'}. Run pnpm lichess:account to verify.`);
    }else throw new Error('Usage: pnpm lichess:account [--upgrade DEDICATED_ACCOUNT_NAME]');
}catch(error){const text=error instanceof Error?error.message:'Lichess setup failed';console.error(process.env.LICHESS_TOKEN?text.split(process.env.LICHESS_TOKEN).join('[redacted]'):text);process.exitCode=1;}
