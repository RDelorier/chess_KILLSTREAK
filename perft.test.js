// Perft validation of the OMNI ARENA engine (standard chess rules).
const N_OFF=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const K_OFF=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTH=[[-1,0],[1,0],[0,-1],[0,1]];
const ALL8=K_OFF;
const inB=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const opp=c=>c==='w'?'b':'w';
function initialBoard(){const back=['r','n','b','q','k','b','n','r'];const bd=Array.from({length:8},()=>Array(8).fill(null));for(let c=0;c<8;c++){bd[0][c]={t:back[c],c:'b'};bd[1][c]={t:'p',c:'b'};bd[6][c]={t:'p',c:'w'};bd[7][c]={t:back[c],c:'w'};}return bd;}
function newState(){return{board:initialBoard(),turn:'w',castling:{wK:true,wQ:true,bK:true,bQ:true},ep:null};}
function cloneBoard(bd){return bd.map(row=>row.map(c=>c?{...c}:null));}
function isAttacked(bd,r,c,by){const dir=by==='w'?1:-1;for(const dc of[-1,1]){const pr=r+dir,pc=c+dc;if(inB(pr,pc)){const q=bd[pr][pc];if(q&&q.c===by&&q.t==='p')return true;}}for(const[dr,dc]of N_OFF){const pr=r+dr,pc=c+dc;if(inB(pr,pc)){const q=bd[pr][pc];if(q&&q.c===by&&q.t==='n')return true;}}for(const[dr,dc]of K_OFF){const pr=r+dr,pc=c+dc;if(inB(pr,pc)){const q=bd[pr][pc];if(q&&q.c===by&&q.t==='k')return true;}}for(const[dr,dc]of ALL8){const pr=r+2*dr,pc=c+2*dc;if(inB(pr,pc)){const q=bd[pr][pc];if(q&&q.c===by&&q.t==='u')return true;}}for(const[dr,dc]of DIAG){let pr=r+dr,pc=c+dc;while(inB(pr,pc)){const q=bd[pr][pc];if(q){if(q.c===by&&(q.t==='b'||q.t==='q'))return true;break;}pr+=dr;pc+=dc;}}for(const[dr,dc]of ORTH){let pr=r+dr,pc=c+dc;while(inB(pr,pc)){const q=bd[pr][pc];if(q){if(q.c===by&&(q.t==='r'||q.t==='q'))return true;break;}pr+=dr;pc+=dc;}}return false;}
function findKing(bd,color){for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=bd[r][c];if(p&&p.t==='k'&&p.c===color)return[r,c];}return null;}
function inCheck(st,color){const k=findKing(st.board,color);if(!k)return false;return isAttacked(st.board,k[0],k[1],opp(color));}
function genPiece(st,r,c){const bd=st.board,p=bd[r][c],moves=[];if(!p)return moves;const me=p.c,en=opp(me);const add=(tr,tc,flag,promo)=>moves.push({fr:r,fc:c,tr,tc,flag:flag||'normal',promo:promo||null});if(p.t==='p'){const d=me==='w'?-1:1,startRow=me==='w'?6:1,promoRow=me==='w'?0:7;const one=r+d;if(inB(one,c)&&!bd[one][c]){if(one===promoRow){for(const pt of['q','r','b','n'])add(one,c,'promo',pt);}else add(one,c,'normal');const two=r+2*d;if(r===startRow&&!bd[two][c])add(two,c,'double');}for(const dc of[-1,1]){const cr=r+d,cc=c+dc;if(!inB(cr,cc))continue;const q=bd[cr][cc];if(q&&q.c===en){if(cr===promoRow){for(const pt of['q','r','b','n'])add(cr,cc,'promo',pt);}else add(cr,cc,'normal');}else if(!q&&st.ep&&st.ep.r===cr&&st.ep.c===cc)add(cr,cc,'ep');}}else if(p.t==='n'){for(const[dr,dc]of N_OFF){const tr=r+dr,tc=c+dc;if(inB(tr,tc)){const q=bd[tr][tc];if(!q||q.c===en)add(tr,tc);}}}else if(p.t==='u'){for(const[dr,dc]of ALL8){const tr=r+2*dr,tc=c+2*dc;if(inB(tr,tc)){const q=bd[tr][tc];if(!q||q.c===en)add(tr,tc);}}}else if(p.t==='k'){for(const[dr,dc]of K_OFF){const tr=r+dr,tc=c+dc;if(inB(tr,tc)){const q=bd[tr][tc];if(!q||q.c===en)add(tr,tc);}}addCastle(st,r,c,me,add);}else{const dirs=p.t==='b'?DIAG:p.t==='r'?ORTH:ALL8;for(const[dr,dc]of dirs){let tr=r+dr,tc=c+dc;while(inB(tr,tc)){const q=bd[tr][tc];if(!q){add(tr,tc);}else{if(q.c===en)add(tr,tc);break;}tr+=dr;tc+=dc;}}}return moves;}
function addCastle(st,r,c,me,add){if((me==='w'&&r!==7)||(me==='b'&&r!==0)||c!==4)return;const bd=st.board,en=opp(me),rt=st.castling;if(inCheck(st,me))return;const k=me==='w'?rt.wK:rt.bK,q=me==='w'?rt.wQ:rt.bQ;if(k&&!bd[r][5]&&!bd[r][6]&&!isAttacked(bd,r,5,en)&&!isAttacked(bd,r,6,en)){const rk=bd[r][7];if(rk&&rk.t==='r'&&rk.c===me)add(r,6,'castleK');}if(q&&!bd[r][3]&&!bd[r][2]&&!bd[r][1]&&!isAttacked(bd,r,3,en)&&!isAttacked(bd,r,2,en)){const rk=bd[r][0];if(rk&&rk.t==='r'&&rk.c===me)add(r,2,'castleQ');}}
function applyMove(st,m){const bd=cloneBoard(st.board);const ns={board:bd,turn:opp(st.turn),castling:{...st.castling},ep:null};const p=bd[m.fr][m.fc],me=p.c;bd[m.tr][m.tc]=p;bd[m.fr][m.fc]=null;if(m.flag==='double')ns.ep={r:(m.fr+m.tr)/2,c:m.fc};if(m.flag==='ep')bd[m.fr][m.tc]=null;if(m.flag==='promo')bd[m.tr][m.tc]={t:m.promo,c:me};if(m.flag==='castleK'){bd[m.fr][5]=bd[m.fr][7];bd[m.fr][7]=null;}if(m.flag==='castleQ'){bd[m.fr][3]=bd[m.fr][0];bd[m.fr][0]=null;}if(p.t==='k'){if(me==='w'){ns.castling.wK=ns.castling.wQ=false;}else{ns.castling.bK=ns.castling.bQ=false;}}if(m.fr===7&&m.fc===0)ns.castling.wQ=false;if(m.fr===7&&m.fc===7)ns.castling.wK=false;if(m.fr===0&&m.fc===0)ns.castling.bQ=false;if(m.fr===0&&m.fc===7)ns.castling.bK=false;if(m.tr===7&&m.tc===0)ns.castling.wQ=false;if(m.tr===7&&m.tc===7)ns.castling.wK=false;if(m.tr===0&&m.tc===0)ns.castling.bQ=false;if(m.tr===0&&m.tc===7)ns.castling.bK=false;return ns;}
function pseudoAll(st,color){const r=[];for(let i=0;i<8;i++)for(let j=0;j<8;j++){const p=st.board[i][j];if(p&&p.c===color)r.push(...genPiece(st,i,j));}return r;}
function legalMoves(st,color){const r=[];for(const m of pseudoAll(st,color)){const ns=applyMove(st,m);if(!inCheck(ns,color))r.push(m);}return r;}

function perft(st,depth){
  if(depth===0)return 1;
  const moves=legalMoves(st,st.turn);
  if(depth===1)return moves.length;
  let n=0;
  for(const m of moves)n+=perft(applyMove(st,m),depth-1);
  return n;
}

const expected={1:20,2:400,3:8902,4:197281};
let ok=true;
for(const d of [1,2,3,4]){
  const got=perft(newState(),d);
  const pass=got===expected[d];
  if(!pass)ok=false;
  console.log(`perft(${d}) = ${got}  expected ${expected[d]}  ${pass?'PASS':'FAIL'}`);
}
console.log(ok?'\nALL PERFT TESTS PASSED ✓':'\nPERFT MISMATCH ✗');
process.exit(ok?0:1);
