/* Admin dashboard logic — all data calls go through window.LateenAPI.admin */
function admEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function admMoney(n){const v=Number(n||0);return '\u2066د.ل\u2069'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admMoneyH(n){const v=Number(n||0);return '<span class="cur-sym">\u2066د.ل\u2069</span>'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admInitials(name){if(!name)return '?';return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();}
function admWhen(iso){if(!iso)return '';const d=new Date(iso);const diff=Date.now()-d.getTime();const m=Math.floor(diff/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}

/* Anti-flicker helpers. Every admin list below used to be reloaded on
   every nav click, every 10s poll, and every realtime event — and each
   reload wiped the section to "Loading…" and rebuilt the DOM from scratch
   even when nothing had changed, causing a visible blank flash each time.
   Now: "Loading…" only shows the very first time a section is opened, and
   the rebuild is skipped entirely when the new data matches what's on
   screen already. */
const __admSig={};
function __admFirstLoad(root){return !root||root.dataset.admLoaded!=='1';}
function __admMarkLoaded(root){if(root)root.dataset.admLoaded='1';}
function __admUnchanged(key,sig,first){
  if(!first&&__admSig[key]===sig)return true;
  __admSig[key]=sig;
  return false;
}

let admUsersCache=[];
let admFeeRows=[];
let admHomeRaw=null; // real {orders,profiles,products} rows behind the Home Analytics v2 page
const ADM_MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];

function admSumFeesIn(year,month){
  return admFeeRows.reduce((s,r)=>{
    const d=new Date(r.ts);
    if(d.getFullYear()!==year)return s;
    if(month!=null && d.getMonth()!==month)return s;
    return s+r.amount;
  },0);
}
function admPopulateFeePickers(){
  const now=new Date();
  const years=new Set([now.getFullYear()]);
  admFeeRows.forEach(r=>years.add(new Date(r.ts).getFullYear()));
  const yearList=[...years].sort((a,b)=>b-a);
  const yearSel=document.getElementById('m-year-picker');
  const monthSel=document.getElementById('m-month-picker');
  if(!yearSel||!monthSel)return;
  const prevYear=Number(yearSel.dataset.year||now.getFullYear());
  const prevMonth=monthSel.dataset.value||(now.getFullYear()+'-'+now.getMonth());
  yearSel.innerHTML=yearList.map(y=>`<option value="${y}">${y}</option>`).join('');
  yearSel.value=yearList.includes(prevYear)?prevYear:yearList[0];
  yearSel.dataset.year=yearSel.value;
  // Build month options across all years that have data, plus current month
  const monthKeys=new Set([now.getFullYear()+'-'+now.getMonth()]);
  admFeeRows.forEach(r=>{const d=new Date(r.ts);monthKeys.add(d.getFullYear()+'-'+d.getMonth());});
  const monthOpts=[...monthKeys].map(k=>{const [y,m]=k.split('-').map(Number);return {k,y,m,ts:new Date(y,m,1).getTime()};}).sort((a,b)=>b.ts-a.ts);
  monthSel.innerHTML=monthOpts.map(o=>`<option value="${o.k}">${ADM_MONTH_NAMES[o.m]} ${o.y}</option>`).join('');
  monthSel.value=monthOpts.find(o=>o.k===prevMonth)?prevMonth:monthOpts[0].k;
  monthSel.dataset.value=monthSel.value;
}
function admUpdateMonthFees(){
  const sel=document.getElementById('m-month-picker');
  if(!sel||!sel.value)return;
  sel.dataset.value=sel.value;
  const [y,m]=sel.value.split('-').map(Number);
  document.getElementById('m-fees-month').innerHTML=admMoneyH(admSumFeesIn(y,m));
}
function admUpdateYearFees(){
  const sel=document.getElementById('m-year-picker');
  if(!sel||!sel.value)return;
  sel.dataset.year=sel.value;
  document.getElementById('m-fees-year').innerHTML=admMoneyH(admSumFeesIn(Number(sel.value),null));
}

function admGo(pageId){
  document.querySelectorAll('.adm-page').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById(pageId); if(el) el.classList.add('active');
  document.querySelectorAll('.adm-nav-item').forEach(n=>n.classList.remove('active'));
  const nav=document.getElementById('nav-'+pageId); if(nav) nav.classList.add('active');
  if(pageId==='adm-home') admLoadMetrics();
  if(pageId==='adm-verify') admLoadVerify();
  if(pageId==='adm-payouts') admLoadPayouts();
  if(pageId==='adm-users') admLoadUsers('');
  if(pageId==='adm-products') admLoadProducts();
  if(pageId==='adm-employees') admLoadEmployees();
}

async function admLoadMetrics(){
  if(!document.getElementById('heroValue'))return; // v2 home analytics markup not present on this page
  try{
    const m=await window.LateenAPI.admin.getMetrics();
    admHomeRaw={orders:m.orders||[],profiles:m.profiles||[],products:m.products||[]};
    const setStat=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=Number(val||0).toLocaleString();};
    setStat('statActiveUsers',m.activeUsers);
    setStat('statTotalUsers',m.totalUsers);
    setStat('statTotalProducts',m.totalProducts);
    setStat('statPiecesSold',m.piecesSold);
    setStat('statSucceeded',m.succeededUpfronts);
    renderHero();
    renderChart();
  }catch(e){console.error('[admin] metrics',e);}
}

async function admLoadVerify(){
  const root=document.getElementById('verify-list');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listPendingReceipts();
    list.sort((a,b)=>{
      const at=new Date(a.updated_at||a.receipt_uploaded_at||a.created_at||0).getTime();
      const bt=new Date(b.updated_at||b.receipt_uploaded_at||b.created_at||0).getTime();
      return bt-at;
    });
    const sig=JSON.stringify(list.map(o=>[o.id,o.updated_at,o.receipt_uploaded_at,o.receipt_url,o.status]));
    if(__admUnchanged('verify',sig,first))return;
    __admMarkLoaded(root);
    if(!list.length){root.innerHTML='<div class="adm-empty">No receipts awaiting review.</div>';return;}
    root.innerHTML=list.map(o=>{
      const qty=Number(o.qty||0);
      const unitPrice=Number(o.unit_price||0);
      const marketerFee=Number(o.commission||0)*qty;
      const platformFee=Number(o.platform_fee||0)*qty;
      const productTotal=unitPrice*qty;
      const marketer=o.marketer&&o.marketer.full_name||'Unknown marketer';
      const phone=o.marketer&&o.marketer.phone||'';
      const email=o.marketer&&o.marketer.email||'';
      const product=o.product&&o.product.name||'Order';
      const prodPhoto=(o.product&&Array.isArray(o.product.photos)&&o.product.photos[0])||'';
      const prodThumb=prodPhoto?`<img class="adm-prod-thumb" src="${admEsc(prodPhoto)}" alt="" onclick="event.stopPropagation();admLightbox('${admEsc(prodPhoto)}')"/>`:'';
      const thumb=o.receipt_url?`<img class="adm-thumb" src="${admEsc(o.receipt_url)}" alt="receipt" onclick="event.stopPropagation();admLightbox('${admEsc(o.receipt_url)}')" />`:`<div class="adm-thumb-empty">📄</div>`;
      const upAt=o.receipt_uploaded_at?'Uploaded: '+admWhen(o.receipt_uploaded_at):'';
      const created='Created: '+admWhen(o.created_at);
      return `<div class="adm-row" onclick="admToggleRow('v-${o.id}')">
        <div class="adm-row-top">
          ${thumb}
          <div class="adm-row-mid">
            <div class="adm-row-name">${admEsc(marketer)}</div>
            <div class="adm-row-sub">${admEsc(product)} · ${admEsc(phone)}</div>
            ${email?`<div class="adm-row-sub">${admEsc(email)}</div>`:''}
            <div class="adm-row-sub" style="opacity:.7">${created}${upAt?' · '+upAt:''}</div>
            <div class="adm-row-sub" style="color:#e0c070">⏳ Pending verification</div>
          </div>
          <div class="adm-row-amt">${admMoneyH(platformFee)}</div>
        </div>
        <div class="adm-expand" id="v-${o.id}">
          ${o.receipt_url?`<img class="adm-receipt-full" src="${admEsc(o.receipt_url)}" alt="receipt" onclick="admLightbox('${admEsc(o.receipt_url)}')"/>`:'<div class="adm-empty">No receipt image</div>'}
          <div class="adm-order-detail">
            ${prodThumb}
            <div class="adm-order-detail-rows">
              <div class="adm-detail-row"><span>Price</span><span>${admMoneyH(unitPrice)}</span></div>
              <div class="adm-detail-row"><span>Qty</span><span>${qty}</span></div>
              <div class="adm-detail-row"><span>Total</span><span>${admMoneyH(productTotal)}</span></div>
              <div class="adm-detail-row"><span>Marketer fee</span><span>${admMoneyH(marketerFee)}</span></div>
              <div class="adm-detail-row"><span>Platform fee</span><span>${admMoneyH(platformFee)}</span></div>
            </div>
          </div>
          <div class="adm-actions">
            <button class="adm-btn adm-btn-no" onclick="event.stopPropagation();admReject('${o.id}')">Reject with note</button>
            <button class="adm-btn adm-btn-ok" onclick="event.stopPropagation();admApprove('${o.id}')">Approve &amp; forward</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] verify',e);if(first)root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

function admToggleRow(id){
  document.querySelectorAll('.adm-expand').forEach(x=>{if(x.id!==id)x.classList.remove('open');});
  const el=document.getElementById(id); if(el) el.classList.toggle('open');
}

function admLightbox(url){
  document.getElementById('adm-lightbox-img').src=url;
  document.getElementById('adm-lightbox').classList.add('open');
}

async function admApprove(id){
  if(!confirm('Approve this receipt? The order will be forwarded to the business owner and stock will be decremented.'))return;
  try{await window.LateenAPI.admin.approveOrder(id);admLoadVerify();}catch(e){alert('Approve failed: '+e.message);}
}
async function admReject(id){
  const notes=prompt('Reason for rejecting this receipt? (visible to the marketer)');
  if(notes===null)return;
  try{await window.LateenAPI.admin.rejectOrder(id,notes||'Receipt rejected');admLoadVerify();}catch(e){alert('Reject failed: '+e.message);}
}

async function admLoadPayouts(){
  const root=document.getElementById('payouts-list');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listPayoutRequests();
    const sig=JSON.stringify(list.map(p=>[p.id,p.requested_at,p.amount,p.wallet&&p.wallet.balance,(p.user&&p.user.payout_notes)||'']));
    if(__admUnchanged('payouts',sig,first))return;
    __admMarkLoaded(root);
    if(!list.length){root.innerHTML='<div class="adm-empty">No payout requests pending.</div>';return;}
    root.innerHTML=list.map(p=>{
      const u=p.user||{};
      const name=u.business_name||u.full_name||'Marketer';
      const phone=u.phone||'';
      const cur=p.wallet&&p.wallet.currency&&p.wallet.currency.symbol?p.wallet.currency.symbol:'$';
      const curCode=p.wallet&&p.wallet.currency&&p.wallet.currency.code?p.wallet.currency.code:'';
      const fmtAmt=(n)=>typeof window.__money==='function'?window.__money(n,cur,curCode):admMoney(n);
      const fmtAmtH=(n)=>typeof window.__moneyH==='function'?window.__moneyH(n,cur,curCode):admMoneyH(n);
      const detail=(label,val)=>val?`<div class="adm-pay-detail-row"><span class="adm-pay-detail-k">${admEsc(label)}</span><span class="adm-pay-detail-v">${admEsc(val)}</span></div>`:'';
      const hasAny=u.payout_method||u.payout_bank_name||u.payout_account_holder||u.payout_account_number||u.payout_iban||u.payout_swift||u.payout_notes;
      const detailsHtml=hasAny?`<div class="adm-pay-details">
        ${detail('Method',u.payout_method)}
        ${detail('Bank',u.payout_bank_name)}
        ${detail('Account holder',u.payout_account_holder)}
        ${detail('Account #',u.payout_account_number)}
        ${detail('IBAN',u.payout_iban)}
        ${detail('SWIFT/BIC',u.payout_swift)}
        ${detail('Notes',u.payout_notes)}
      </div>`:`<div class="adm-pay-details adm-pay-details-empty">No payout details on file — contact the marketer.</div>`;
      const liveBal=p.wallet&&p.wallet.balance!=null?Number(p.wallet.balance):Number(p.amount||0);
      return `<div class="adm-payout-card">
        <div class="adm-payout-row">
          <div class="adm-user-av">${admEsc(admInitials(name))}</div>
          <div class="adm-pay-info">
            <div class="adm-pay-name">${admEsc(name)}</div>
            <div class="adm-pay-sub">${admEsc(phone)} · ${admWhen(p.requested_at)}</div>
          </div>
          <div class="adm-pay-amt"><div>${fmtAmtH(liveBal)}</div></div>
          <button class="adm-btn adm-btn-acc" style="flex:0 0 auto;padding:0 14px;" onclick="admMarkPaid('${p.id}',${liveBal},'${encodeURIComponent(fmtAmt(liveBal))}')">Paid</button>
        </div>
        ${detailsHtml}
        <div style="display:flex;gap:6px;padding:10px 14px 12px;border-top:0.5px solid var(--border-2);">
          <input id="adm-note-${p.id}" type="text" placeholder="Send a note to the marketer (e.g. missing IBAN)" style="flex:1;height:34px;padding:0 10px;border-radius:8px;border:0.5px solid var(--border-2);background:#0f0f0f;color:#fff;font-size:12px;" />
          <button class="adm-btn" style="padding:0 12px;" onclick="admSendPayoutNote('${p.id}')">Send note</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] payouts',e);if(first)root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

async function admMarkPaid(id,amt,label){
  const shown=label?decodeURIComponent(label):admMoney(amt);
  if(!confirm('Confirm you have manually transferred '+shown+'? This will reduce the marketer\'s balance.'))return;
  try{await window.LateenAPI.admin.markPayoutPaid(id);await admLoadPayouts();if(document.getElementById('adm-home')?.classList.contains('active'))admLoadMetrics();}catch(e){alert('Failed: '+e.message);}
}
async function admSendPayoutNote(id){
  const el=document.getElementById('adm-note-'+id);
  const note=el?el.value.trim():'';
  if(!note){alert('Type a note first.');return;}
  if(!confirm('Send this note to the marketer? Their request will be marked failed so they can fix it and re-request.'))return;
  try{await window.LateenAPI.admin.notePayout(id,note);await admLoadPayouts();}catch(e){alert('Failed: '+e.message);}
}

let admUserRoleFilter='';
async function admLoadUsers(search){
  const root=document.getElementById('users-list');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listAllUsers(search);
    admUsersCache=list;
    const sig=JSON.stringify(list.map(u=>[u.id,u.role,u.banned_at,u.frozen_at,u.full_name,u.business_name,u.email,u.phone]));
    if(__admUnchanged('users:'+search,sig,first))return;
    __admMarkLoaded(root);
    admRenderUsers(admApplyUserFilter(list));
  }catch(e){console.error('[admin] users',e);if(first)root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

function admApplyUserFilter(list){
  if(!admUserRoleFilter)return list;
  return list.filter(u=>(u.role||'marketer')===admUserRoleFilter);
}

function admSetUserFilter(role,el){
  admUserRoleFilter=role;
  document.querySelectorAll('.adm-filter-chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  admRenderUsers(admApplyUserFilter(admUsersCache));
}

function admRenderUsers(list){
  const root=document.getElementById('users-list');
  if(!list.length){root.innerHTML='<div class="adm-empty">No users found.</div>';return;}
  root.innerHTML=list.map(u=>{
    const name=u.business_name||u.full_name||'Unnamed';
    const role=u.role||'marketer';
    const pillClass=role==='admin'?'adm-role-admin':role==='business'?'adm-role-business':'adm-role-marketer';
    const canImpersonate=role==='marketer'||role==='business';
    const goBtn=canImpersonate?`<button class="adm-go-btn" onclick="admGoToAccount('${u.id}','${role}','${admEsc(name).replace(/'/g,"&#39;")}')">Go to Account</button>`:'';
    const isBanned=!!u.banned_at;
    const isFrozen=!!u.frozen_at;
    const freezeBtn=canImpersonate?`<button class="adm-go-btn" style="background:${isFrozen?'#cce5ff':'#e2e3e5'};color:${isFrozen?'#004085':'#495057'};border-color:${isFrozen?'#b8daff':'#d6d8db'};" onclick="admToggleFreeze('${u.id}','${admEsc(name).replace(/'/g,"&#39;")}',${isFrozen})">${isFrozen?'Unfreeze':'Freeze'}</button>`:'';
    const banBtn=`<button class="adm-go-btn" style="background:${isBanned?'#e2e3e5':'#fff3cd'};color:${isBanned?'#495057':'#856404'};border-color:${isBanned?'#d6d8db':'#ffeeba'};" onclick="admToggleBan('${u.id}','${admEsc(name).replace(/'/g,"&#39;")}',${isBanned})">${isBanned?'Unban':'Ban Email'}</button>`;
    const flags=(isBanned?'<span style="font-size:11px;color:#c00;font-weight:600;margin-inline-end:8px;">Banned</span>':'')+(isFrozen?'<span style="font-size:11px;color:#004085;font-weight:600;">Frozen</span>':'');
    return `<div class="adm-user-row">
      <div class="adm-user-av">${admEsc(admInitials(name))}</div>
      <div style="flex:1;min-width:0;">
        <div class="adm-row-name">${admEsc(name)}</div>
        <div class="adm-row-sub">${admEsc(u.email||'no email')} · ${admEsc(u.phone||'no phone')} · ${admWhen(u.created_at)}</div>
        ${flags?`<div style="margin-top:2px;">${flags}</div>`:''}
      </div>
      <div class="adm-user-actions">
        <span class="adm-role-pill ${pillClass}">${admEsc(role)}</span>
        ${goBtn}
        ${freezeBtn}
        <button class="adm-go-btn" style="background:#fee;color:#c00;border-color:#fcc;" onclick="admDeleteUser('${u.id}','${admEsc(name).replace(/'/g,"&#39;")}')">Remove</button>
        ${banBtn}
      </div>
    </div>`;
  }).join('');
}

async function admDeleteUser(userId,name){
  if(!confirm('Permanently delete '+name+'\u2019s account?\n\nThe account and all their data will be removed from the database. They can register again with the same email. This cannot be undone.'))return;
  try{
    await window.LateenAPI.admin.deleteUser(userId);
    admLoadUsers(document.getElementById('user-search').value||'');
  }catch(e){alert('Failed: '+e.message);}
}

async function admToggleBan(userId,name,isBanned){
  if(isBanned){
    if(!confirm('Unban '+name+'\u2019s account? They\u2019ll be able to sign in again.'))return;
    try{await window.LateenAPI.admin.unbanUser(userId);admLoadUsers(document.getElementById('user-search').value||'');}catch(e){alert('Failed: '+e.message);}
  }else{
    if(!confirm('Ban '+name+'\u2019s account?\n\nThey\u2019ll be signed out immediately and won\u2019t be able to sign back in until you unban them.'))return;
    try{await window.LateenAPI.admin.banUser(userId);admLoadUsers(document.getElementById('user-search').value||'');}catch(e){alert('Failed: '+e.message);}
  }
}

async function admToggleFreeze(userId,name,isFrozen){
  if(isFrozen){
    if(!confirm('Unfreeze '+name+'\u2019s account? They\u2019ll be able to submit orders / list products again.'))return;
    try{await window.LateenAPI.admin.unfreezeUser(userId);admLoadUsers(document.getElementById('user-search').value||'');}catch(e){alert('Failed: '+e.message);}
  }else{
    if(!confirm('Freeze '+name+'\u2019s account?\n\nThey\u2019ll stay signed in but won\u2019t be able to submit orders, list products, or verify/fail orders until you unfreeze them.'))return;
    try{await window.LateenAPI.admin.freezeUser(userId);admLoadUsers(document.getElementById('user-search').value||'');}catch(e){alert('Failed: '+e.message);}
  }
}

function admGoToAccount(userId,role,name){
  if(!confirm('Open '+name+'\u2019s account?\n\nYou\u2019ll see their dashboard for support purposes. You can exit anytime via the banner at the top.'))return;
  try{
    sessionStorage.setItem('lateen_impersonate',JSON.stringify({userId:userId,role:role,name:name}));
    window.location.reload();
  }catch(e){alert('Failed: '+e.message);}
}

let admUserSearchTimer=null;
function admUserSearch(v){
  clearTimeout(admUserSearchTimer);
  admUserSearchTimer=setTimeout(()=>admLoadUsers(v),250);
}

let admProductSearchQ='';
let admProductSearchTimer=null;
function admProductSearch(v){
  admProductSearchQ=v||'';
  clearTimeout(admProductSearchTimer);
  admProductSearchTimer=setTimeout(admLoadProducts,250);
}

async function admLoadProducts(){
  const root=document.getElementById('products-grid');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listAllProducts(admProductSearchQ);
    const sig=JSON.stringify(list.map(p=>[p.id,p.status,p.price,p.name,(Array.isArray(p.photos)&&p.photos[0])||'']));
    if(__admUnchanged('products:'+admProductSearchQ,sig,first))return;
    __admMarkLoaded(root);
    if(!list.length){root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">'+(admProductSearchQ?'No products match your search.':'No products yet.')+'</div>';return;}
    root.innerHTML=list.map(p=>{
      const photo=Array.isArray(p.photos)&&p.photos[0];
      const img=photo?`<img src="${admEsc(photo)}" alt="${admEsc(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>`:'📦';
      const isHidden=p.status==='hidden';
      const pill=isHidden?'<span class="adm-status-pill">Hidden</span>':'';
      const nameAttr=admEsc(p.name).replace(/'/g,"&#39;");
      const eyeIcon=isHidden
        ?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        :'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.77 21.77 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.77 21.77 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      return `<div class="c" onclick="admOpenProduct('${p.id}')">
        <div class="ci2">
          ${img}
          ${pill}
          <div class="adm-prod-del-ov" onclick="event.stopPropagation();admDeleteProduct('${p.id}','${nameAttr}')" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </div>
          <div class="adm-prod-hide-ov" onclick="event.stopPropagation();admToggleProduct('${p.id}','${isHidden?'active':'hidden'}')">
            <div class="adm-prod-hide-circle${isHidden?' on':''}">${eyeIcon}</div>
            <span>${isHidden?'Unhide':'Hide'}</span>
          </div>
        </div>
        <div class="cb2">
          <div class="cn">${admEsc(p.name)}</div>
          <div class="cr">
            <div class="cpr">${admMoneyH(p.price)}</div>
            <div class="cco">${Number(p.comm_pct||0)}%</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] products',e);if(first)root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">Failed to load.</div>';}
}

async function admToggleProduct(id,newStatus){
  try{await window.LateenAPI.admin.setProductStatus(id,newStatus);admLoadProducts();}catch(e){alert('Failed: '+e.message);}
}

async function admDeleteProduct(id,name){
  if(!confirm('Permanently delete "'+name+'"?\n\nIt will disappear from marketer browsing and saved products right away. This cannot be undone.'))return;
  try{
    await window.LateenAPI.admin.deleteProduct(id);
    admClosePDetail();
    admLoadProducts();
  }catch(e){alert('Failed: '+e.message);}
}

function admClosePDetail(){document.getElementById('adm-pdetail').classList.remove('open');}

function __admEffectiveQty(p){
  const groups=(p&&p.variant_groups)||[];
  if(!groups.length)return Number(p&&p.qty)||0;
  const groupTotals=[];
  groups.forEach(g=>{
    let gTotal=0,gTracked=false;
    (g&&g.items||[]).forEach(it=>{
      const q=it&&it.qty;
      if(q!==null&&q!==undefined&&q!==''&&Number.isFinite(Number(q))){gTracked=true;gTotal+=Math.max(0,Number(q));}
    });
    if(gTracked)groupTotals.push(gTotal);
  });
  return groupTotals.length?Math.min(...groupTotals):(Number(p&&p.qty)||0);
}
async function admOpenProduct(id){
  const modal=document.getElementById('adm-pdetail');
  const body=document.getElementById('adm-pdetail-body');
  body.innerHTML='<div class="adm-empty">Loading…</div>';
  modal.classList.add('open');
  try{
    const res=await window.LateenAPI.admin.getProductDetail(id);
    if(!res||!res.product){body.innerHTML='<div class="adm-empty">Product not found.</div>';return;}
    const p=res.product, owner=res.owner||{};
    const cur=(p.currency&&p.currency.symbol)||'$';
    const curH='<span class="cur-sym">'+cur+'</span>';
    const photos=Array.isArray(p.photos)?p.photos:[];
    const mainImg=photos[0]?`<img class="adm-pd-img" src="${admEsc(photos[0])}" alt="${admEsc(p.name)}" onclick="admLightbox('${admEsc(photos[0])}')"/>`:`<div class="adm-pd-img" style="display:flex;align-items:center;justify-content:center;font-size:48px;color:var(--txt-3);">📦</div>`;
    const thumbs=photos.length>1?`<div class="adm-pd-imgrow">${photos.map(u=>`<img src="${admEsc(u)}" alt="" onclick="admLightbox('${admEsc(u)}')"/>`).join('')}</div>`:'';
    const sizes=Array.isArray(p.sizes)&&p.sizes.length?`<div class="adm-pd-section">Sizes</div><div class="adm-pd-chips">${p.sizes.map(s=>`<span class="adm-pd-chip">${admEsc(s)}</span>`).join('')}</div>`:'';
    const colors=Array.isArray(p.colors)&&p.colors.length?`<div class="adm-pd-section">Colours</div><div class="adm-pd-chips">${p.colors.map(s=>`<span class="adm-pd-chip">${admEsc(s)}</span>`).join('')}</div>`:'';
    const CN={NG:'Nigeria',GH:'Ghana',EG:'Egypt',KE:'Kenya',ZA:'South Africa',MA:'Morocco'};
    const delivery=p.delivery&&typeof p.delivery==='object'?Object.entries(p.delivery):[];
    const deliveryHtml=delivery.length?`<div class="adm-pd-section">Delivery</div>`+delivery.map(([code,z])=>{
      const cities=z&&z.cities?Object.entries(z.cities):[];
      return `<div class="adm-pd-zone"><div class="adm-pd-zone-h">${admEsc(CN[code]||code)}</div>${cities.map(([city,c])=>`<div class="adm-pd-zone-r"><span>${admEsc(city)}</span><span style="color:var(--txt-2);">Ship ${curH}${Number(c.shipping||0).toFixed(2)} · Deliv ${curH}${Number(c.delivery||0).toFixed(2)}</span></div>`).join('')}</div>`;
    }).join(''):'';
    const ownerName=owner.business_name||owner.full_name||p.biz_name||'Unknown';
    const ownerOther=owner.business_name&&owner.full_name&&owner.business_name!==owner.full_name?`<div class="adm-pd-owner-row">Contact name: <span>${admEsc(owner.full_name)}</span></div>`:'';
    body.innerHTML=`
      ${mainImg}${thumbs}
      <div class="adm-pd-name">${admEsc(p.name)}</div>
      <div class="adm-pd-shop">Code: ${admEsc(p.code||'—')} · ${admEsc(p.category||'Uncategorised')}</div>
      <div class="adm-pd-grid">
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Price</div><div class="adm-pd-cell-v">${curH}${Number(p.price||0).toFixed(2)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">In stock</div><div class="adm-pd-cell-v">${__admEffectiveQty(p)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Commission</div><div class="adm-pd-cell-v">${p.comm_mode==='fixed'?curH+Number(p.comm_fixed||0).toFixed(2):Number(p.comm_pct||0)+'%'}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Platform fee</div><div class="adm-pd-cell-v">${curH}${Number(p.platform_fee||0).toFixed(2)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Sold</div><div class="adm-pd-cell-v">${Number(p.sold||0)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Revenue</div><div class="adm-pd-cell-v">${curH}${Number(p.revenue||0).toFixed(2)}</div></div>
      </div>
      ${p.description?`<div class="adm-pd-section">Description</div><div class="adm-pd-desc">${admEsc(p.description)}</div>`:''}
      ${sizes}${colors}${deliveryHtml}
      <div class="adm-pd-section">Business owner</div>
      <div class="adm-pd-owner">
        <div class="adm-pd-owner-name">${admEsc(ownerName)}</div>
        ${ownerOther}
        <div class="adm-pd-owner-row">Phone: <span>${admEsc(owner.phone||'—')}</span></div>
        <div class="adm-pd-owner-row">Joined: <span>${owner.created_at?admWhen(owner.created_at):'—'}</span></div>
        <div class="adm-pd-owner-row" style="margin-top:8px;">
          <button class="adm-go-btn" onclick="admGoToAccount('${p.business_id}','business','${admEsc(ownerName).replace(/'/g,'&#39;')}')">Go to Account</button>
        </div>
      </div>
    `;
  }catch(e){console.error('[admin] product detail',e);body.innerHTML='<div class="adm-empty">Failed to load: '+admEsc(e.message||'')+'</div>';}
}

/* boot */
admLoadMetrics();
setInterval(()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}},10000);
if(window.LateenAPI&&window.LateenAPI.subscribe){window.__lateenUnsubs=window.__lateenUnsubs||[];window.__lateenUnsubs.push(window.LateenAPI.subscribe('admin-wallets',()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}}));window.__lateenUnsubs.push(window.LateenAPI.subscribe('admin-payouts',()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}}));}

/* ========== Employees & Payroll ========== */
let admEmpCache=[];
let admEmpFilter=''; // '', 'pending', 'paid'
let admEmpSearchQ='';

function admEmpPeriod(){const d=new Date();return {y:d.getFullYear(),m:d.getMonth()+1};}
function admEmpIsPaid(emp,p){return (emp.payments||[]).some(x=>x.period_year===p.y&&x.period_month===p.m);}
function admEmpFmtDate(d){if(!d)return '—';const dt=new Date(d);return dt.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}
function admEmpNextPayday(p){const next=p.m===12?{y:p.y+1,m:1}:{y:p.y,m:p.m+1};return ADM_MONTH_NAMES[next.m-1]+' '+next.y;}

async function admLoadEmployees(){
  const root=document.getElementById('employees-list');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    admEmpCache=await window.LateenAPI.admin.listEmployees(admEmpSearchQ);
    const sig=JSON.stringify(admEmpCache.map(e=>[e.id,e.monthly_salary,e.job_title,e.email,e.notes,JSON.stringify(e.payments||[])]));
    if(__admUnchanged('employees:'+admEmpSearchQ,sig,first))return;
    __admMarkLoaded(root);
    admRenderEmployees();
  }catch(e){console.error('[admin] employees',e);if(first)root.innerHTML='<div class="adm-empty">Failed to load: '+admEsc(e.message||'')+'</div>';}
}

function admRenderEmployees(){
  const root=document.getElementById('employees-list');
  const p=admEmpPeriod();
  const periodLabel=ADM_MONTH_NAMES[p.m-1]+' '+p.y;
  let totalSalary=0,paidAmt=0,pendingAmt=0,paidCount=0;
  admEmpCache.forEach(e=>{
    const sal=Number(e.monthly_salary||0);
    totalSalary+=sal;
    if(admEmpIsPaid(e,p)){paidAmt+=sal;paidCount++;}else{pendingAmt+=sal;}
  });
  document.getElementById('emp-total-salary').innerHTML=admMoneyH(totalSalary);
  document.getElementById('emp-paid-amt').innerHTML=admMoneyH(paidAmt);
  document.getElementById('emp-pending-amt').innerHTML=admMoneyH(pendingAmt);
  document.getElementById('emp-count').textContent=admEmpCache.length;
  document.getElementById('emp-paid-count').textContent=paidCount;

  const filtered=admEmpCache.filter(e=>{
    const paid=admEmpIsPaid(e,p);
    if(admEmpFilter==='paid'&&!paid)return false;
    if(admEmpFilter==='pending'&&paid)return false;
    return true;
  });
  if(!filtered.length){root.innerHTML='<div class="adm-empty">No employees match.</div>';return;}
  root.innerHTML=filtered.map(e=>{
    const paid=admEmpIsPaid(e,p);
    const status=paid?'<span style="color:#2dbd8f">Paid · '+periodLabel+'</span>':'<span style="color:#e07070">Pending · '+periodLabel+'</span>';
    const payday=paid?admEmpNextPayday(p):periodLabel;
    return `<div class="adm-emp-row">
      <div class="adm-emp-top">
        <div class="adm-emp-av">${admEsc(admInitials(e.full_name))}</div>
        <div style="flex:1;min-width:0;">
          <div class="adm-emp-name">${admEsc(e.full_name)} <span style="color:#9e9b97;font-weight:400;">· ${admEsc(e.employee_number)}</span></div>
          <div class="adm-emp-sub">${admEsc(e.job_title||'—')} · ${admEsc(e.email||'no email')}</div>
        </div>
        <div style="text-align:right;font-size:13px;font-weight:500;color:#f5b441;">${admMoneyH(e.monthly_salary)}</div>
      </div>
      <div class="adm-emp-meta">
        <div>Hired <b>${admEmpFmtDate(e.hired_at)}</b></div>
        <div>Payday <b>${admEsc(payday)}</b></div>
        <div style="grid-column:1/-1;">Status: ${status}</div>
        ${e.notes?`<div style="grid-column:1/-1;color:#9e9b97;font-style:italic;">${admEsc(e.notes)}</div>`:''}
      </div>
      <div class="adm-emp-actions">
        <button class="adm-emp-pay-btn ${paid?'paid':''}" ${paid?'disabled':''} onclick="admPayEmp('${e.id}',${e.monthly_salary})">${paid?'Paid ✓':'Mark as Paid'}</button>
        <button class="adm-emp-link-btn" onclick="admOpenEmpHist('${e.id}')">History</button>
        <button class="adm-emp-link-btn" onclick="admOpenEmpForm('${e.id}')">Edit</button>
      </div>
    </div>`;
  }).join('');
}

function admSetEmpFilter(f,el){
  admEmpFilter=f;
  document.querySelectorAll('[data-emp-filter]').forEach(b=>b.classList.remove('on'));
  if(el)el.classList.add('on');
  admRenderEmployees();
}
let admEmpSearchTimer=null;
function admEmpSearch(q){
  admEmpSearchQ=q;
  clearTimeout(admEmpSearchTimer);
  admEmpSearchTimer=setTimeout(admLoadEmployees,250);
}

async function admPayEmp(id,amount){
  const p=admEmpPeriod();
  const e=admEmpCache.find(x=>x.id===id);
  if(!e)return;
  if(!confirm('Mark '+e.full_name+' as paid for '+ADM_MONTH_NAMES[p.m-1]+' '+p.y+' ('+admMoney(amount)+')?'))return;
  try{
    await window.LateenAPI.admin.payEmployee({employee_id:id,period_year:p.y,period_month:p.m,amount:Number(amount)});
    await admLoadEmployees();
  }catch(err){alert('Failed: '+err.message);}
}

function admOpenEmpForm(id){
  const modal=document.getElementById('adm-emp-form');
  const title=document.getElementById('adm-emp-form-title');
  const delBtn=document.getElementById('emp-delete-btn');
  const e=id?admEmpCache.find(x=>x.id===id):null;
  document.getElementById('emp-id').value=e?e.id:'';
  document.getElementById('emp-name').value=e?(e.full_name||''):'';
  document.getElementById('emp-num').value=e?(e.employee_number||''):'';
  document.getElementById('emp-job').value=e?(e.job_title||''):'';
  document.getElementById('emp-email').value=e?(e.email||''):'';
  document.getElementById('emp-salary').value=e?(e.monthly_salary||0):'';
  document.getElementById('emp-hired').value=e?(e.hired_at||'').slice(0,10):new Date().toISOString().slice(0,10);
  document.getElementById('emp-notes').value=e?(e.notes||''):'';
  title.textContent=e?'Edit Employee':'New Employee';
  delBtn.style.display=e?'block':'none';
  modal.classList.add('open');
}
function admCloseEmpForm(){document.getElementById('adm-emp-form').classList.remove('open');}

async function admSaveEmp(){
  const v=id=>document.getElementById(id).value.trim();
  const payload={
    full_name:v('emp-name'),
    employee_number:v('emp-num'),
    job_title:v('emp-job')||null,
    email:v('emp-email')||null,
    monthly_salary:Number(v('emp-salary'))||0,
    hired_at:v('emp-hired')||new Date().toISOString().slice(0,10),
    notes:v('emp-notes')||null,
  };
  if(!payload.full_name||!payload.employee_number){alert('Name and employee number are required.');return;}
  const id=v('emp-id');
  if(id)payload.id=id;
  try{
    await window.LateenAPI.admin.upsertEmployee(payload);
    admCloseEmpForm();
    await admLoadEmployees();
  }catch(e){alert('Save failed: '+e.message);}
}

async function admDeleteEmp(){
  const id=document.getElementById('emp-id').value;
  if(!id)return;
  if(!confirm('Delete this employee and their payment history? This cannot be undone.'))return;
  try{
    await window.LateenAPI.admin.deleteEmployee(id);
    admCloseEmpForm();
    await admLoadEmployees();
  }catch(e){alert('Delete failed: '+e.message);}
}

function admOpenEmpHist(id){
  const e=admEmpCache.find(x=>x.id===id);
  const modal=document.getElementById('adm-emp-hist');
  const body=document.getElementById('adm-emp-hist-body');
  if(!e){body.innerHTML='<div class="adm-empty">Not found.</div>';modal.classList.add('open');return;}
  const pays=(e.payments||[]).slice().sort((a,b)=>(b.period_year-a.period_year)||(b.period_month-a.period_month));
  const total=pays.reduce((s,p)=>s+Number(p.amount||0),0);
  body.innerHTML=`
    <div style="padding:18px 18px 8px;">
      <div style="font-size:16px;font-weight:600;">${admEsc(e.full_name)}</div>
      <div style="font-size:12px;color:#9e9b97;margin-top:2px;">${admEsc(e.employee_number)} · ${admEsc(e.job_title||'—')}</div>
      <div style="margin-top:10px;font-size:13px;">Total paid: <b style="color:#2dbd8f;">${admMoneyH(total)}</b> across ${pays.length} payment${pays.length===1?'':'s'}</div>
    </div>
    <div class="adm-section" style="margin:0 18px 18px;">
      ${pays.length?pays.map(p=>`<div class="adm-emp-hist-row"><span>${ADM_MONTH_NAMES[p.period_month-1]} ${p.period_year}</span><span style="color:#9e9b97;">${admEmpFmtDate(p.paid_at)}</span><b>${admMoneyH(p.amount)}</b></div>`).join(''):'<div class="adm-empty">No payments recorded yet.</div>'}
    </div>`;
  modal.classList.add('open');
}
function admCloseEmpHist(){document.getElementById('adm-emp-hist').classList.remove('open');}

/* ========== Home Analytics v2 (pasted from dashboard-analytics-v2-1.html, unchanged) ========== */
  const arMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  function pad(n){ return String(n).padStart(2,'0'); }

  function buildDays(n){
    const list = [];
    const today = new Date();
    for(let i=0;i<n;i++){
      const d = new Date(today);
      d.setDate(d.getDate()-i);
      const key = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
      const label = d.getDate()+' '+arMonths[d.getMonth()];
      list.push({key,label});
    }
    return list;
  }
  function buildMonths(){
    const list = [];
    const today = new Date();
    const year = today.getFullYear();
    for(let m=today.getMonth(); m>=0; m--){
      list.push({ key: year+'-'+pad(m+1), label: arMonths[m]+' '+year });
    }
    return list;
  }
  function buildYears(){
    const y = new Date().getFullYear();
    return [y,y-1,y-2].map(v => ({ key:String(v), label:String(v) }));
  }

  const dayItems = buildDays(14);
  const monthItems = buildMonths();
  const yearItems = buildYears();
  const dayMap = Object.fromEntries(dayItems.map(i=>[i.key,i.label]));
  const monthMap = Object.fromEntries(monthItems.map(i=>[i.key,i.label]));

  const selected = { day:null, month:null, year:null };

  // Real platform-fee sum for whichever day/month/year is selected (or all-time
  // if none is). Reads from admHomeRaw.orders, populated by admLoadMetrics().
  function getFees(){
    const raw = admHomeRaw;
    if(!raw) return 0;
    let rows = raw.orders;
    if(selected.year){
      const y = Number(selected.year);
      rows = rows.filter(o => new Date(o.created_at).getFullYear() === y);
    } else if(selected.month){
      const [y,m] = selected.month.split('-').map(Number);
      rows = rows.filter(o => {
        const d = new Date(o.created_at);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });
    } else if(selected.day){
      rows = rows.filter(o => {
        const d = new Date(o.created_at);
        return (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())) === selected.day;
      });
    }
    const sum = rows.reduce((s,o) => s + Number(o.fee||0), 0);
    return Math.round(sum*100)/100;
  }

  // Real point-in-time snapshot of a metric "as of" a given timestamp — e.g.
  // total users who had signed up by then, or the rolling-30-day active-user
  // count ending then. Used for both the stat-card totals and every point on
  // the chart, so the chart and the "final" value are always consistent.
  function metricValueAsOf(key, ts){
    const raw = admHomeRaw;
    if(!raw) return 0;
    if(key === 'totalUsers'){
      return raw.profiles.filter(p => new Date(p.created_at).getTime() <= ts).length;
    }
    if(key === 'totalProducts'){
      return raw.products.filter(p => new Date(p.created_at).getTime() <= ts).length;
    }
    if(key === 'piecesSold'){
      return raw.orders.reduce((s,o) => {
        if(!o.confirmed_at) return s;
        return new Date(o.confirmed_at).getTime() <= ts ? s + Number(o.qty||0) : s;
      }, 0);
    }
    if(key === 'succeeded'){
      return raw.orders.filter(o => o.reviewed_at && new Date(o.reviewed_at).getTime() <= ts).length;
    }
    if(key === 'activeUsers'){
      const windowStart = ts - 30*86400000;
      const set = new Set();
      raw.orders.forEach(o => {
        const t = new Date(o.created_at).getTime();
        if(t > windowStart && t <= ts){ set.add(o.marketer_id); set.add(o.business_id); }
      });
      return set.size;
    }
    return 0;
  }

  function renderHero(){
    const fees = getFees();
    document.getElementById('heroValue').innerHTML = '<span class="cur-sym">د.ل</span>' + fees.toFixed(2);
    let sub = 'إجمالي الأرباح من الطلبيات المؤكدة والمسلّمة';
    if(selected.year) sub = 'إجمالي أرباح عام ' + selected.year;
    else if(selected.month) sub = 'إجمالي أرباح شهر ' + monthMap[selected.month];
    else if(selected.day) sub = 'إجمالي أرباح يوم ' + dayMap[selected.day];
    document.getElementById('heroSub').textContent = sub;
  }

  function buildDropdown(listEl, items, filterKey, rangeName){
    listEl.innerHTML = '';
    const clearItem = document.createElement('div');
    clearItem.className = 'dd-item clear';
    clearItem.textContent = 'إلغاء التحديد';
    clearItem.addEventListener('click', (e) => {
      e.stopPropagation();
      selected[filterKey] = null;
      updateTabLabel(filterKey);
      closeDropdown(rangeName);
      renderHero();
      renderChart();
    });
    listEl.appendChild(clearItem);

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'dd-item';
      el.textContent = item.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selected.day = null; selected.month = null; selected.year = null;
        selected[filterKey] = item.key;
        resetOtherTabs(filterKey);
        updateTabLabel(filterKey);
        closeDropdown(rangeName);
        renderHero();
        renderChart();
      });
      listEl.appendChild(el);
    });
  }

  const rangeMeta = {
    daily:   { key:'day',   defaultLabel:'يوم', list: document.getElementById('dailyList') },
    monthly: { key:'month', defaultLabel:'شهر', list: document.getElementById('monthlyList') },
    yearly:  { key:'year',  defaultLabel:'سنة', list: document.getElementById('yearlyList') }
  };

  buildDropdown(rangeMeta.daily.list, dayItems, 'day', 'daily');
  buildDropdown(rangeMeta.monthly.list, monthItems, 'month', 'monthly');
  buildDropdown(rangeMeta.yearly.list, yearItems, 'year', 'yearly');

  const rangeTabs = document.querySelectorAll('.range-tab');

  function resetOtherTabs(exceptKey){
    Object.keys(rangeMeta).forEach(r => {
      if(rangeMeta[r].key !== exceptKey){
        const tab = document.querySelector(`.range-tab[data-range="${r}"]`);
        tab.innerHTML = rangeMeta[r].defaultLabel + ' <span class="chev">▾</span>';
        tab.classList.remove('active');
      }
    });
  }

  function updateTabLabel(filterKey){
    const rangeName = Object.keys(rangeMeta).find(r => rangeMeta[r].key === filterKey);
    const tab = document.querySelector(`.range-tab[data-range="${rangeName}"]`);
    const val = selected[filterKey];
    let labelText = rangeMeta[rangeName].defaultLabel;
    if(val){
      if(filterKey === 'day') labelText = dayMap[val];
      else if(filterKey === 'month') labelText = monthMap[val];
      else labelText = val;
    }
    tab.innerHTML = labelText + ' <span class="chev">▾</span>';
    tab.classList.toggle('active', !!val);
    updateAllTabState();
  }

  function updateAllTabState(){
    const allTab = document.querySelector('.range-tab[data-range="all"]');
    const anySelected = selected.day || selected.month || selected.year;
    allTab.classList.toggle('active', !anySelected);
  }

  function closeDropdown(rangeName){
    rangeMeta[rangeName].list.classList.remove('open');
    document.querySelector(`.range-tab[data-range="${rangeName}"]`).classList.remove('open');
  }
  function closeAllDropdowns(){ Object.keys(rangeMeta).forEach(closeDropdown); }

  rangeTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const range = tab.dataset.range;

      if(range === 'all'){
        closeAllDropdowns();
        selected.day = null; selected.month = null; selected.year = null;
        Object.keys(rangeMeta).forEach(r => {
          const t = document.querySelector(`.range-tab[data-range="${r}"]`);
          t.innerHTML = rangeMeta[r].defaultLabel + ' <span class="chev">▾</span>';
          t.classList.remove('active');
        });
        tab.classList.add('active');
        renderHero();
        renderChart();
        return;
      }

      const isOpen = rangeMeta[range].list.classList.contains('open');
      closeAllDropdowns();
      if(!isOpen){
        rangeMeta[range].list.classList.add('open');
        tab.classList.add('open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if(!e.target.closest('.range-tab') && !e.target.closest('.dropdown-list')){
      closeAllDropdowns();
    }
  });

  // ---- Analytics chart ----
  function buildChartDates(n){
    const arr = [];
    const today = new Date();
    for(let i=n-1;i>=0;i--){
      const d = new Date(today);
      d.setDate(d.getDate()-i);
      arr.push(d.getDate()+'/'+(d.getMonth()+1));
    }
    return arr;
  }

  const CHART_LEN = 14;

  const metrics = [
    { key:'activeUsers',   label:'المستخدمون النشطون', color:'#7fa8d9', data: [] },
    { key:'totalUsers',    label:'إجمالي المستخدمين',  color:'#9d8fd9', data: [] },
    { key:'totalProducts', label:'إجمالي المنتجات',    color:'#d98fa0', data: [] },
    { key:'piecesSold',    label:'Pieces Sold',        color:'#7fd9a8', data: [] },
    { key:'succeeded',     label:'Succeeded Upfronts', color:'#caa05a', data: [] }
  ];

  function daysInMonth(year, month){ return new Date(year, month, 0).getDate(); }

  // Mirrors the same day/month/year selection used by the hero card (getFees),
  // and returns the real end-of-bucket timestamp for each chart point so
  // metricValueAsOf() can compute a true snapshot at each one.
  function getChartConfig(){
    if(selected.year){
      const year = parseInt(selected.year, 10);
      const isCurrentYear = year === new Date().getFullYear();
      const monthCount = isCurrentYear ? (new Date().getMonth()+1) : 12;
      const labels = arMonths.slice(0, monthCount);
      const ends = [];
      for(let m=1; m<=monthCount; m++){ ends.push(new Date(year, m, 0, 23,59,59,999).getTime()); }
      return { labels, len: monthCount, ends };
    }
    if(selected.month){
      const [y, m] = selected.month.split('-').map(Number);
      const today = new Date();
      const isCurrentMonth = (y === today.getFullYear() && m === today.getMonth()+1);
      const dayCount = isCurrentMonth ? today.getDate() : daysInMonth(y, m);
      const labels = [];
      const ends = [];
      for(let d=1; d<=dayCount; d++){
        labels.push(String(d));
        ends.push(new Date(y, m-1, d, 23,59,59,999).getTime());
      }
      return { labels, len: dayCount, ends };
    }
    if(selected.day){
      const [y,m,d] = selected.day.split('-').map(Number);
      const labels = [];
      const ends = [];
      for(let h=0; h<24; h+=2){
        labels.push(pad(h)+':00');
        ends.push(new Date(y, m-1, d, h+2, 0, 0, 0).getTime()-1);
      }
      return { labels, len: labels.length, ends };
    }
    // Default: last 14 days, one point per day. "Today" uses the current
    // instant rather than end-of-day so the last point is truly live.
    const today = new Date();
    const ends = [];
    for(let i=CHART_LEN-1; i>=0; i--){
      if(i===0){ ends.push(Date.now()); continue; }
      const d = new Date(today);
      d.setDate(d.getDate()-i);
      ends.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999).getTime());
    }
    return { labels: buildChartDates(CHART_LEN), len: CHART_LEN, ends };
  }

  function buildMetricSeries(key, ends){
    return ends.map(ts => metricValueAsOf(key, ts));
  }

  function updateChartTitle(){
    const titleEl = document.querySelector('.chart-title');
    let text = 'الأداء عبر آخر 14 يوماً';
    if(selected.year) text = 'الأداء الشهري لعام ' + selected.year;
    else if(selected.month) text = 'الأداء اليومي لشهر ' + monthMap[selected.month];
    else if(selected.day) text = 'الأداء بالساعة ليوم ' + dayMap[selected.day];
    titleEl.textContent = text;
  }

  const ctx = document.getElementById('analyticsChart').getContext('2d');
  const analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: metrics.map(m => ({
        label: m.label,
        data: m.data,
        borderColor: m.color,
        backgroundColor: m.color,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: m.color,
        borderWidth: 2,
        tension: 0.35,
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          backgroundColor: '#1d1d20',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Cairo', size: 11 },
          bodyFont: { family: 'Cairo', size: 11 },
          titleColor: '#9c9c9c',
          bodyColor: '#f3f3f1'
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#6b6b6b', font: { family: 'Cairo', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
          border: { display: false },
          ticks: { color: '#6b6b6b', font: { family: 'Cairo', size: 10 }, precision: 0, maxTicksLimit: 5 }
        }
      }
    }
  });

  function renderChart(){
    const cfg = getChartConfig();
    metrics.forEach(m => { m.data = buildMetricSeries(m.key, cfg.ends); });
    analyticsChart.data.labels = cfg.labels;
    analyticsChart.data.datasets.forEach((ds, i) => { ds.data = metrics[i].data; });
    updateChartTitle();
    analyticsChart.update();
  }

  function setChartFilter(key){
    analyticsChart.data.datasets.forEach((ds, i) => {
      const m = metrics[i];
      if(key === 'all'){
        ds.hidden = false;
        ds.fill = false;
      } else {
        ds.hidden = m.key !== key;
        ds.fill = m.key === key ? 'origin' : false;
        ds.backgroundColor = m.color + '26';
      }
    });
    analyticsChart.update();
  }

  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.metric;
      chips.forEach(c => {
        c.classList.remove('active');
        c.style.background = '';
        c.style.color = '';
        c.style.borderColor = '';
      });
      chip.classList.add('active');
      if(key !== 'all'){
        const m = metrics.find(mm => mm.key === key);
        chip.style.background = m.color + '22';
        chip.style.color = m.color;
        chip.style.borderColor = m.color + '55';
      }
      setChartFilter(key);
    });
  });

  admLoadMetrics(); // first real load of the Home Analytics v2 page

/* persist page across refresh — mirrors the same fix already shipped for
   the business/marketer dashboards, so returning to a backgrounded admin
   tab lands back on the same section instead of resetting to Home. */
(function(){
  const K='lateen_adm_page';
  const _g=admGo;
  admGo=function(id){try{sessionStorage.setItem(K,id);}catch(e){}return _g.apply(this,arguments);};
  window.admGo=admGo;
  try{
    const sv=sessionStorage.getItem(K);
    if(sv&&document.getElementById(sv))_g(sv);
  }catch(e){}
})();
