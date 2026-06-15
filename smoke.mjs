// CDP smoke test for OMNI ARENA — drives the real page over DevTools Protocol.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const FILE = 'file://' + join(process.cwd(), 'index.html');
const prof = mkdtempSync(join(tmpdir(), 'arena-'));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--window-size=1280,900', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error('Chrome did not come up');
}

let ws, idc = 0;
const pending = new Map();
const evHandlers = [];
function send(method, params = {}, sessionId) {
  const id = ++idc;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify(msg));
  });
}
function connect(url) {
  return new Promise((res) => {
    ws = new WebSocket(url);
    ws.onopen = () => res();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        evHandlers.forEach(h => h(m));
      }
    };
  });
}

let sid;
async function evalJS(expr) {
  const r = await send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.exceptionDetails) throw new Error('JS ERR: ' + r.exceptionDetails.text + ' :: ' + expr);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, sid);
  writeFileSync(name, Buffer.from(r.data, 'base64'));
  return name;
}
async function clickSel(sel) {
  return evalJS(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});
    if(!el)return 'NO-ELEMENT';
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return 'ok';})()`);
}
async function clickSq(r, c) { return clickSel(`.sq[data-r="${r}"][data-c="${c}"]`); }

const log = [];
function step(ok, msg) { log.push((ok ? '✅' : '❌') + ' ' + msg); console.log((ok?'PASS':'FAIL')+': '+msg); return ok; }

(async () => {
  const wsUrl = await getWsUrl();
  // attach to the about:blank page target
  await connect(wsUrl);
  const { targetInfos } = await send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page');
  const at = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  sid = at.sessionId;
  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);

  // navigate
  await send('Page.navigate', { url: FILE }, sid);
  await sleep(1200);

  let allOk = true;

  // 1. setup overlay visible at load
  const setupShown = await evalJS(`document.getElementById('setup').classList.contains('show')`);
  allOk &= step(setupShown, 'Setup overlay shown on load');
  await shot('shot1-setup.png');

  // 2. start a match vs AI (defaults: ai / strategist)
  await clickSel('#startBtn');
  await sleep(400);
  const started = await evalJS(`G.active && !document.getElementById('setup').classList.contains('show')`);
  allOk &= step(started, 'Match starts (vs AI), board active, overlay hidden');
  const pieceCount = await evalJS(`G.state.board.flat().filter(Boolean).length`);
  allOk &= step(pieceCount === 32, `Initial board has 32 pieces (got ${pieceCount})`);

  // 3. make a legal move e2->e4  (e2 = row6/col4, e4 = row4/col4)
  await clickSq(6, 4);
  const sel = await evalJS(`!!G.selected && G.selected.r===6 && G.selected.c===4`);
  allOk &= step(sel, 'Selecting white e2 pawn highlights it');
  const targets = await evalJS(`G.legalForSel.length`);
  allOk &= step(targets === 2, `e2 pawn shows 2 legal targets (got ${targets})`);
  await shot('shot2-selected.png');
  await clickSq(4, 4);
  await sleep(450);
  const moved = await evalJS(`G.state.board[4][4] && G.state.board[4][4].t==='p' && G.state.board[4][4].c==='w' && !G.state.board[6][4]`);
  allOk &= step(moved, 'Pawn moved to e4, origin empty');

  // 4. AI responds (turn returns to white, a black piece moved)
  let aiMoved = false;
  for (let i = 0; i < 40; i++) {
    const t = await evalJS(`({turn:G.state.turn, thinking:G.thinking, moves:G.moveNo})`);
    if (t.turn === 'w' && !t.thinking && t.moves >= 2) { aiMoved = true; break; }
    await sleep(150);
  }
  allOk &= step(aiMoved, 'AI bot made a reply move, turn back to White');
  await shot('shot3-after-ai.png');

  // 5. PROBE: click empty square deselects / no crash
  await clickSq(6, 0);                 // select a-pawn
  await clickSq(3, 7);                 // click far empty square (not a legal target)
  const deselected = await evalJS(`G.selected===null`);
  allOk &= step(deselected, '🔍 Clicking a non-target empty square clears selection');

  // 6. PROBE: clicking opponent piece does nothing illegal
  const before = await evalJS(`G.moveNo`);
  await clickSq(0, 0);                 // black rook (not your turn-color)
  const afterClick = await evalJS(`({sel:G.selected, mv:G.moveNo})`);
  allOk &= step(afterClick.sel === null && afterClick.mv === before, '🔍 Clicking enemy piece selects nothing / no move');

  // 7. PROBE: Fake-Out arming flow
  await clickSel('#fakeBtn');
  const arming = await evalJS(`G.arming`);
  allOk &= step(arming, '🔍 Fake-Out button enters arming mode');
  await clickSq(6, 3);                 // arm the d2 pawn
  const armed = await evalJS(`({armed:G.armed, charges:G.fake.w, arming:G.arming})`);
  allOk &= step(armed.armed && armed.armed.r===6 && armed.armed.c===3 && armed.charges===1 && !armed.arming,
    `🔍 Arming a piece sets bait + consumes a charge (charges left ${armed.charges})`);
  await shot('shot4-fakeout-armed.png');

  // 8. PROBE: Shop buy + equip
  const startCoins = await evalJS(`G.coins`);
  await clickSel('#shopBtn');
  const shopOpen = await evalJS(`document.getElementById('shop').classList.contains('show')`);
  allOk &= step(shopOpen, '🔍 Shop opens');
  // buy the fire trail (price 80) — switch to trails tab first
  await clickSel('#shopTabs button[data-t="trail"]');
  await sleep(100);
  await clickSel('#shopGrid [data-buy="fire"]');
  await sleep(100);
  const afterBuy = await evalJS(`({coins:G.coins, owned:G.owned.trail.includes('fire'), equipped:G.equipped.trail})`);
  allOk &= step(afterBuy.coins === startCoins - 80 && afterBuy.owned && afterBuy.equipped === 'fire',
    `🔍 Buying Fire trail debits 80 gold + auto-equips (coins ${startCoins}->${afterBuy.coins})`);
  await shot('shot5-shop.png');
  // buy something unaffordable should be disabled — check cosmic theme (700) button disabled
  await clickSel('#shopTabs button[data-t="theme"]');
  await sleep(100);
  const cosmicDisabled = await evalJS(`(()=>{const b=document.querySelector('#shopGrid [data-buy="cosmic"]');return b?b.disabled:'no-btn';})()`);
  allOk &= step(cosmicDisabled === true, `🔍 Unaffordable item (Cosmic 700) button is disabled (coins ${afterBuy.coins})`);
  await clickSel('#closeShop');

  // 9. PROBE: persistence — reload, coins/owned survive localStorage
  await send('Page.navigate', { url: FILE }, sid);
  await sleep(1000);
  const persisted = await evalJS(`({coins:G.coins, fire:G.owned.trail.includes('fire')})`);
  allOk &= step(persisted.coins === afterBuy.coins && persisted.fire,
    `🔍 Reload: coins (${persisted.coins}) and owned trail persist via localStorage`);

  console.log('\n' + log.join('\n'));
  console.log('\n' + (allOk ? 'SMOKE TEST: ALL PASS ✓' : 'SMOKE TEST: FAILURES ✗'));

  chrome.kill();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('DRIVER ERROR:', e); chrome.kill(); process.exit(2); });
