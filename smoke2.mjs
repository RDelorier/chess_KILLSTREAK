// CDP smoke test for the hidden Minecraft unlock + Minecraft board.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
const FILE = 'file://' + join(process.cwd(), 'index.html');
const prof = mkdtempSync(join(tmpdir(), 'arena-'));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`,
  `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--window-size=1280,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);const j=await r.json();if(j.webSocketDebuggerUrl)return j.webSocketDebuggerUrl;}catch{}await sleep(150);}throw new Error('no chrome');}
let ws,idc=0;const pending=new Map(),evH=[];
function send(method,params={},sessionId){const id=++idc;const msg={id,method,params};if(sessionId)msg.sessionId=sessionId;return new Promise((res,rej)=>{pending.set(id,{res,rej});ws.send(JSON.stringify(msg));});}
function connect(url){return new Promise(res=>{ws=new WebSocket(url);ws.onopen=()=>res();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}else if(m.method)evH.forEach(h=>h(m));};});}
let sid;
async function evalJS(expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true},sid);if(r.exceptionDetails)throw new Error('JS ERR: '+r.exceptionDetails.text+' :: '+expr);return r.result.value;}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'},sid);writeFileSync(name,Buffer.from(r.data,'base64'));return name;}
async function click(sel){return evalJS(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return'NO-ELEMENT';el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return'ok';})()`);}
const clickSq=(r,c)=>click(`.sq[data-r="${r}"][data-c="${c}"]`);
const log=[];let allOk=true;
function step(ok,msg){allOk=ok&&allOk;log.push((ok?'✅':'❌')+' '+msg);console.log((ok?'PASS':'FAIL')+': '+msg);}

(async()=>{
  await connect(await getWsUrl());
  const{targetInfos}=await send('Target.getTargets');
  const page=targetInfos.find(t=>t.type==='page');
  const at=await send('Target.attachToTarget',{targetId:page.targetId,flatten:true});sid=at.sessionId;
  await send('Page.enable',{},sid);await send('Runtime.enable',{},sid);
  await send('Page.navigate',{url:FILE},sid);await sleep(1100);

  await click('#startBtn');await sleep(300);

  // 1. no false unlock at start
  step(await evalJS(`!G.owned.piece.includes('minecraft')`), 'Minecraft skin NOT unlocked at game start');

  // 2. hidden skin absent from shop (piece tab) before unlock
  await click('#shopBtn');await sleep(80);
  await click('#shopTabs button[data-t="piece"]');await sleep(80);
  step(await evalJS(`!document.querySelector('#shopGrid [data-buy="minecraft"]') && !document.querySelector('#shopGrid [data-eq="minecraft"]')`),
    '🔍 Secret Minecraft skin is hidden in shop before unlock');
  // 2b. Minecraft BOARD must NOT be purchasable in shop (unlock-only)
  await click('#shopTabs button[data-t="theme"]');await sleep(80);
  step(await evalJS(`!document.querySelector('#shopGrid [data-buy="minecraft"]') && !document.querySelector('#shopGrid [data-eq="minecraft"]')`),
    '🔍 Minecraft board is NOT in the shop before unlock');
  await click('#closeShop');await sleep(60);

  // 3. arrange a pawn wall: white pawns c4,d-pending,e4; only 3 white pawns total
  await evalJS(`
    G.mode='1v1';
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=G.state.board[r][c];if(p&&p.t==='p'&&p.c==='w')G.state.board[r][c]=null;}
    G.state.board[4][2]={t:'p',c:'w'};   // c4
    G.state.board[4][4]={t:'p',c:'w'};   // e4
    G.state.board[5][3]={t:'p',c:'w'};   // d3 -> will advance to d4
    G.state.turn='w';G.selected=null;G.legalForSel=[];renderAll();'ok'`);
  step(await evalJS(`!G.owned.piece.includes('minecraft')`), 'Still locked while wall is incomplete (gap at d4)');

  // complete the wall via a real move d3->d4 (5,3)->(4,3)
  await clickSq(5,3);
  const tgt=await evalJS(`G.legalForSel.some(m=>m.tr===4&&m.tc===3)`);
  step(tgt, 'Pawn at d3 can legally advance to d4');
  await clickSq(4,3);
  await sleep(400);

  // 4. unlock fired — grants BOTH skin and board, equips both
  const u=await evalJS(`({pOwn:G.owned.piece.includes('minecraft'),tOwn:G.owned.theme.includes('minecraft'),
    pEq:G.equipped.piece,tEq:G.equipped.theme,
    bCls:document.getElementById('board').className,wCls:document.querySelector('.board-wrap').className})`);
  step(u.pOwn, 'Pawn wall (c4-d4-e4) UNLOCKS Minecraft skin');
  step(u.tOwn, 'Same unlock ALSO grants the Minecraft board');
  step(u.pEq==='minecraft' && u.bCls.includes('skin-mc'), 'Minecraft skin auto-equipped (skin-mc)');
  step(u.tEq==='minecraft' && u.wCls.includes('theme-mc'), 'Minecraft board auto-equipped (theme-mc)');
  await shot('mc1-unlocked.png');

  // 5. both now visible/equipped in shop (owned, not purchasable)
  await click('#shopBtn');await sleep(80);
  await click('#shopTabs button[data-t="piece"]');await sleep(80);
  step(await evalJS(`[...document.querySelectorAll('#shopGrid .nm')].some(n=>/Minecraft/.test(n.textContent))`),
    'Unlocked Minecraft skin now shows in shop (owned)');
  await click('#shopTabs button[data-t="theme"]');await sleep(80);
  const t=await evalJS(`({shows:[...document.querySelectorAll('#shopGrid .nm')].some(n=>/Minecraft/.test(n.textContent)),
    buyable:!!document.querySelector('#shopGrid [data-buy="minecraft"]')})`);
  step(t.shows && !t.buyable, 'Minecraft board shows in shop as owned (never purchasable)');
  await click('#closeShop');await sleep(80);
  await shot('mc2-board.png');

  console.log('\n'+log.join('\n'));
  console.log('\n'+(allOk?'MINECRAFT SMOKE: ALL PASS ✓':'MINECRAFT SMOKE: FAILURES ✗'));
  chrome.kill();process.exit(allOk?0:1);
})().catch(e=>{console.error('DRIVER ERROR:',e);chrome.kill();process.exit(2);});
