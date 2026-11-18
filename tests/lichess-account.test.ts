import { it,expect } from 'vitest';
import { upgradeBotAccount } from '../apps/server/src/lichess/account-setup';
it('does not convert a different or previously played account',async()=>{
    for(const profile of [{id:'personal',username:'Personal',count:{all:0}},{id:'jevbot',username:'JevBot',count:{all:1}}]){
        const methods:string[]=[];
        await expect(upgradeBotAccount('secret-token','jevbot',async()=>true,async(_url,init)=>{methods.push(init?.method??'GET');return Response.json(profile);})).rejects.toThrow();expect(methods).toEqual(['GET']);
    }
});
it('requires explicit identity-bound confirmation before one irreversible request',async()=>{
    const urls:string[]=[],profile={id:'jevbot',username:'JevBot',count:{all:0}};
    const transport:typeof fetch=async(url,init)=>{urls.push(String(url));expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');return Response.json(init?.method==='POST'?{ok:true}:profile);};
    await expect(upgradeBotAccount('secret-token','jevbot',async()=>false,transport)).rejects.toThrow(/cancel/i);expect(urls).toHaveLength(1);urls.length=0;
    await upgradeBotAccount('secret-token','jevbot',async account=>account==='jevbot',transport);
    expect(urls).toEqual(['https://lichess.org/api/account','https://lichess.org/api/bot/account/upgrade']);
});
