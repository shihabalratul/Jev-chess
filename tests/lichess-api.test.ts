import { it,expect,vi,afterEach } from 'vitest';
import { buildServer } from '../apps/server/src/app';
afterEach(()=>vi.unstubAllEnvs());
it('requires pairing for every Lichess control and never exposes credentials',async()=>{
    vi.stubEnv('BACKEND_TOKEN','local-pairing-secret');vi.stubEnv('LICHESS_TOKEN','private-lichess-secret');
    const app=await buildServer({providerMode:'mock'});
    try{
        expect((await app.inject({method:'POST',url:'/api/lichess/status',payload:{}})).statusCode).toBe(401);
        const response=await app.inject({method:'POST',url:'/api/lichess/status',headers:{'x-jev-token':'local-pairing-secret'},payload:{}});
        expect(response.statusCode).toBe(200);expect(response.json().running).toBe(false);
        expect(response.body).not.toContain('private-lichess-secret');
        const invalid=await app.inject({method:'POST',url:'/api/lichess/select',headers:{'x-jev-token':'local-pairing-secret'},payload:{id:'../escape'}});expect(invalid.statusCode).toBe(400);
    }finally{await app.close();}
});
it('refuses controls until backend pairing is configured',async()=>{
    vi.stubEnv('BACKEND_TOKEN','');const app=await buildServer({providerMode:'mock'});
    try{const response=await app.inject({method:'POST',url:'/api/lichess/connect',payload:{}});expect(response.statusCode).toBe(503);expect(response.json().error).toMatch(/BACKEND_TOKEN/);}finally{await app.close();}
});
