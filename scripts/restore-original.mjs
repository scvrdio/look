// Migration to the original Look project. Never prints credentials or API bodies.
import { spawnSync } from 'node:child_process';
const team='team_Bd1Jcmk79L79kvSSCZa3r4iI';
const target='prj_1fVYqaZ3M1RIxGfsJY99aGa8IaAo';
const nodeDir='/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin';
const pnpm='/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm';
function api(path,method='GET',body) {
  const args=['dlx','vercel@59.23.1','api',path+(path.includes('?')?'&':'?')+'teamId='+team,'--raw','--method',method];
  if(body)args.push('--input','-');
  const r=spawnSync(pnpm,args,{env:{...process.env,PATH:nodeDir+':'+process.env.PATH},input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024});
  if(r.status!==0)throw new Error('Vercel request failed: '+method+' '+path.split('?')[0]+(r.stderr?.includes('confirmation')?' (CLI confirmation required)':''));
  const d=JSON.parse(r.stdout);
  if(d.error)throw new Error('Vercel request rejected');
  return d;
}
try {
  const mode=process.argv[2];
  if(mode==='inspect-token') {
    const envs=api('/v9/projects/'+target+'/env').envs;
    const item=envs.find(e=>e.key==='TELEGRAM_BOT_TOKEN'&&e.target.includes('production'));
    if(!item||item.type==='sensitive')throw new Error('Existing token is not readable');
    const env=api('/v1/projects/'+target+'/env/'+item.id+'?decrypt=true');
    if(!env.value)throw new Error('Existing token unavailable');
    const r=await fetch('https://api.telegram.org/bot'+env.value+'/getMe',{signal:AbortSignal.timeout(15000)});
    const d=await r.json();
    console.log(JSON.stringify({tokenValid:d.ok===true,bot:d.ok?d.result.username:null}));
  } else if(mode==='project') {
    const p=api('/v9/projects/'+target);
    console.log(JSON.stringify({id:p.id,name:p.name,buildCommand:p.buildCommand,installCommand:p.installCommand,rootDirectory:p.rootDirectory,framework:p.framework,crons:p.crons}));
  } else throw new Error('Unknown operation');
} catch(e) {console.error(e instanceof Error && !e.message.includes('https:') ? e.message : 'Operation failed; credential details withheld');process.exitCode=1;}
