/* Admin dashboard logic — all data calls go through window.LateenAPI.admin */
function admEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function admMoney(n){const v=Number(n||0);return '\u2066د.ل\u2069'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admMoneyH(n){const v=Number(n||0);return '<span class="cur-sym">\u2066د.ل\u2069</span>'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admInitials(name){if(!name)return '?';return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();}
function admWhen(iso){if(!iso)return '';const d=new Date(iso);const diff=Date.now()-d.getTime();const m=Math.floor(diff/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}
function admWhenFull(iso){if(!iso)return '';const d=new Date(iso);const day=d.getDate();const month=d.toLocaleString('en-US',{month:'short'});const year=d.getFullYear();let h=d.getHours();const mins=String(d.getMinutes()).padStart(2,'0');const ampm=h>=12?'PM':'AM';h=h%12;if(h===0)h=12;return `${day} ${month} ${year}, ${h}:${mins} ${ampm}`;}

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
  if(pageId==='adm-products'){admLoadProducts();admLoadReports();}
  if(pageId==='adm-employees') admLoadEmployees();
}

async function admLoadMetrics(){
  if(!document.getElementById('heroValue'))return; // v2 home analytics markup not present on this page
  try{
    const m=await window.LateenAPI.admin.getMetrics();
    admHomeRaw={orders:m.orders||[],profiles:m.profiles||[],products:m.products||[],employeePayments:m.employeePayments||[]};
    const setStat=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=Number(val||0).toLocaleString();};
    setStat('statActiveUsers',m.activeUsers);
    setStat('statTotalUsers',m.totalUsers);
    setStat('statTotalProducts',m.totalProducts);
    setStat('statPiecesSold',m.piecesSold);
    setStat('statSucceeded',m.succeededUpfronts);
    setStat('statSucceededPieces',m.succeededPiecesSold);
    const heroErr=document.getElementById('heroError'); if(heroErr) heroErr.remove();
    renderHero();
    renderChart();
  }catch(e){
    console.error('[admin] metrics',e);
    const hero=document.getElementById('heroValue');
    if(hero){
      hero.innerHTML='<span class="cur-sym">د.ل</span>—';
      let err=document.getElementById('heroError');
      if(!err){
        err=document.createElement('div');
        err.id='heroError';
        err.style.cssText='margin-top:8px;font-size:11.5px;color:var(--danger);';
        hero.parentElement.appendChild(err);
      }
      err.textContent='Failed to load: '+(e&&e.message?e.message:'unknown error');
    }
  }
}

let __admVerifyMarketers=[];
let __admVerifySearchQ='';
let __admMktDetailId=null;
let __admMktDetailTab='new';
let __admMktDetailSearch='';

async function admLoadVerify(){
  const root=document.getElementById('verify-list');
  const first=__admFirstLoad(root);
  if(first) root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const [pending,history]=await Promise.all([
      window.LateenAPI.admin.listPendingReceipts(),
      window.LateenAPI.admin.listReceiptHistory(),
    ]);
    const sig=JSON.stringify([
      pending.map(o=>[o.id,o.updated_at,o.receipt_uploaded_at,o.receipt_url,o.status]),
      history.map(o=>[o.id,o.reviewed_at,o.status,o.admin_notes,o.refunded_at]),
    ]);
    if(__admUnchanged('verify',sig,first))return;
    __admMarkLoaded(root);

    const byMkt=new Map();
    const addTo=(o,bucket)=>{
      const mid=o.marketer_id;
      if(!byMkt.has(mid)){
        byMkt.set(mid,{
          id:mid,
          name:(o.marketer&&o.marketer.full_name)||'Unknown marketer',
          phone:(o.marketer&&o.marketer.phone)||'',
          email:(o.marketer&&o.marketer.email)||'',
          pending:[],
          history:[],
        });
      }
      byMkt.get(mid)[bucket].push(o);
    };
    pending.forEach(o=>addTo(o,'pending'));
    history.forEach(o=>addTo(o,'history'));

    __admVerifyMarketers=[...byMkt.values()].sort((a,b)=>b.pending.length-a.pending.length);
    admRenderVerifyList();
    admRenderMktDetail();
  }catch(e){console.error('[admin] verify',e);if(first)root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

function admVerifySearch(q){
  __admVerifySearchQ=(q||'').trim().toLowerCase();
  admRenderVerifyList();
}

function admRenderVerifyList(){
  const root=document.getElementById('verify-list');
  const q=__admVerifySearchQ;
  const list=__admVerifyMarketers.filter(m=>!q||m.name.toLowerCase().includes(q)||m.phone.toLowerCase().includes(q)||m.email.toLowerCase().includes(q));
  if(!list.length){
    root.innerHTML=`<div class="adm-empty">${__admVerifyMarketers.length?'No marketers match your search.':'No receipts awaiting review.'}</div>`;
    return;
  }
  root.innerHTML=list.map(m=>{
    const badge=m.pending.length
      ? `<span class="adm-mkt-badge">${m.pending.length} pending</span>`
      : `<span class="adm-mkt-badge clear">All clear</span>`;
    const contact=admEsc([m.phone,m.email].filter(Boolean).join(' · '));
    return `<div class="adm-mkt-row" onclick="admOpenMktDetail('${m.id}')">
      <div class="adm-mkt-av" data-no-i18n>${admEsc(admInitials(m.name))}</div>
      <div class="adm-mkt-main">
        <div class="adm-mkt-name-row"><span class="adm-mkt-name" data-no-i18n>${admEsc(m.name)}</span>${badge}</div>
        <div class="adm-mkt-contact">${contact}</div>
      </div>
      <div class="adm-mkt-chev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></div>
    </div>`;
  }).join('');
}

function admOpenMktDetail(id){
  __admMktDetailId=id;
  __admMktDetailTab='new';
  __admMktDetailSearch='';
  admRenderMktDetailShell();
  document.getElementById('adm-mkt-detail').classList.add('open');
}
function admCloseMktDetail(){
  document.getElementById('adm-mkt-detail').classList.remove('open');
  __admMktDetailId=null;
}
function admMktDetailTab(tab){
  __admMktDetailTab=tab;
  const nb=document.getElementById('adm-mkt-tab-new');
  const hb=document.getElementById('adm-mkt-tab-history');
  if(nb)nb.classList.toggle('on',tab==='new');
  if(hb)hb.classList.toggle('on',tab==='history');
  admRenderMktDetailList();
}
function admMktDetailSearch(q){
  __admMktDetailSearch=(q||'').trim().toLowerCase();
  admRenderMktDetailList();
}

// Called after a background data refresh (e.g. post approve/reject/refund).
// Updates counts + the card list in place; never rebuilds the header/search
// input, so a marketer that's mid-typed-search doesn't lose focus or text.
function admRenderMktDetail(){
  if(!__admMktDetailId)return;
  if(!document.getElementById('adm-mkt-detail-body'))return;
  if(!document.getElementById('adm-mkt-search')){admRenderMktDetailShell();return;}
  const m=__admVerifyMarketers.find(x=>x.id===__admMktDetailId);
  if(!m)return;
  const nb=document.getElementById('adm-mkt-tab-new');
  const hb=document.getElementById('adm-mkt-tab-history');
  if(nb)nb.textContent=`New (${m.pending.length})`;
  if(hb)hb.textContent=`History (${m.history.length})`;
  admRenderMktDetailList();
}

function admRenderMktDetailShell(){
  const body=document.getElementById('adm-mkt-detail-body');
  if(!body)return;
  const m=__admVerifyMarketers.find(x=>x.id===__admMktDetailId);
  if(!m){body.innerHTML='<div class="adm-empty">This marketer has no receipts to show.</div>';return;}
  const contact=admEsc([m.phone,m.email].filter(Boolean).join(' · '));
  body.innerHTML=`
    <div class="adm-mkt-detail-head">
      <div class="adm-mkt-av" data-no-i18n>${admEsc(admInitials(m.name))}</div>
      <div>
        <div class="adm-mkt-detail-name" data-no-i18n>${admEsc(m.name)}</div>
        <div class="adm-mkt-detail-contact">${contact}</div>
      </div>
    </div>
    <div class="adm-filter-row">
      <button class="adm-filter-chip ${__admMktDetailTab==='new'?'on':''}" id="adm-mkt-tab-new" onclick="admMktDetailTab('new')">New (${m.pending.length})</button>
      <button class="adm-filter-chip ${__admMktDetailTab==='history'?'on':''}" id="adm-mkt-tab-history" onclick="admMktDetailTab('history')">History (${m.history.length})</button>
    </div>
    <input class="adm-search" id="adm-mkt-search" placeholder="Search by product, customer name, phone, or order code" value="${admEsc(__admMktDetailSearch)}" oninput="admMktDetailSearch(this.value)" />
    <div id="adm-mkt-detail-list"></div>
  `;
  admRenderMktDetailList();
}

function admRenderMktDetailList(){
  const listRoot=document.getElementById('adm-mkt-detail-list');
  if(!listRoot)return;
  const m=__admVerifyMarketers.find(x=>x.id===__admMktDetailId);
  if(!m)return;
  const q=__admMktDetailSearch;
  const baseList=__admMktDetailTab==='new'?m.pending:m.history;
  const matches=o=>{
    const product=((o.product&&o.product.name)||'').toLowerCase();
    const custName=(o.customer_name||'').toLowerCase();
    const custPhone=(o.customer_phone||'').toLowerCase();
    const orderCode=('#'+(o.order_number||String(o.id||'').slice(0,8))).toLowerCase();
    return product.includes(q)||custName.includes(q)||custPhone.includes(q)||orderCode.includes(q);
  };
  const list=q?baseList.filter(matches):baseList;
  if(!list.length){
    listRoot.innerHTML=q
      ? '<div class="adm-empty">No receipts match your search.</div>'
      : (__admMktDetailTab==='new'
          ? '<div class="adm-empty">No pending receipts. This marketer is all caught up.</div>'
          : '<div class="adm-empty">No reviewed receipts yet.</div>');
    return;
  }
  listRoot.innerHTML=list.map(o=>admMktDetailCard(o)).join('');
}

function admMktDetailCard(o){
  const qty=Number(o.qty||0);
  const unitPrice=Number(o.unit_price||0);
  const marketerFee=Number(o.commission||0)*qty;
  const platformFee=Number(o.platform_fee||0)*qty;
  const productTotal=unitPrice*qty;
  const product=(o.product&&o.product.name)||'Order';
  const customerName=o.customer_name||'';
  const customerPhone=o.customer_phone||'';
  const prodPhoto=(o.product&&Array.isArray(o.product.photos)&&o.product.photos[0])||'';
  const prodThumb=prodPhoto
    ?`<img class="adm-prod-thumb" src="${admEsc(prodPhoto)}" alt="" onclick="admLightbox('${admEsc(prodPhoto)}')"/>`
    :`<div class="adm-thumb-empty" style="width:44px;height:44px;">📦</div>`;
  const receiptThumb=o.receipt_url
    ?`<img class="adm-thumb" src="${admEsc(o.receipt_url)}" alt="receipt" onclick="admLightbox('${admEsc(o.receipt_url)}')"/>`
    :`<div class="adm-thumb-empty">📄</div>`;

  const isRefunded=!!o.refunded_at;
  const statusPill=isRefunded
    ?'<span class="adm-recpt-status adm-status-refunded">↺ Refunded</span>'
    :o.status==='pending'
    ?'<span class="adm-recpt-status adm-status-pending">⏳ Pending verification</span>'
    :o.status==='approved'
    ?'<span class="adm-recpt-status adm-status-approved">✓ Approved</span>'
    :'<span class="adm-recpt-status adm-status-rejected">✕ Rejected</span>';

  const created='Created: '+admWhenFull(o.created_at);
  const uploaded=o.receipt_uploaded_at?'Uploaded: '+admWhenFull(o.receipt_uploaded_at):'';
  const orderCode='#'+(o.order_number||String(o.id||'').slice(0,8).toUpperCase());
  const detailsSub=`<details class="adm-order-details" style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:#9e9b97;list-style:none;">▸ Order code &amp; timestamps</summary><div style="margin-top:6px;font-size:12px;color:#c9c8c4;line-height:1.6;"><div><span data-no-i18n>${admEsc(orderCode)}</span></div><div>${created}</div>${uploaded?`<div>${uploaded}</div>`:''}</div></details>`;
  const customerLine=(customerName||customerPhone)
    ?`<div class="adm-row-sub" style="margin-top:2px;">Customer: <span data-no-i18n>${admEsc([customerName,customerPhone].filter(Boolean).join(' · '))}</span></div>`
    :'';

  const noteBlock=(o.status==='rejected')
    ?`<div class="adm-note-block"><div class="adm-note-block-label">Admin note</div><div class="adm-note-block-text">${o.admin_notes&&String(o.admin_notes).trim()?`<span data-no-i18n>${admEsc(o.admin_notes)}</span>`:'No note was provided.'}</div></div>`
    :'';

  const reviewedLine=(o.status!=='pending'&&o.reviewed_at)
    ?`<div class="adm-row-sub" style="opacity:.7;margin-top:6px;">Reviewed: ${admWhenFull(o.reviewed_at)}${isRefunded?' · Refunded: '+admWhenFull(o.refunded_at):''}</div>`
    :'';

  const actions=o.status==='pending'
    ?`<div class="adm-actions" style="margin-top:10px;">
        <button class="adm-btn adm-btn-no" onclick="admReject('${o.id}')">Reject with note</button>
        <button class="adm-btn adm-btn-ok" onclick="admApprove('${o.id}')">Approve &amp; forward</button>
      </div>`
    :'';

  // Refunding only ever makes sense for a receipt the admin already approved
  // (that's the only point real platform-fee revenue was counted), and only
  // once — the button disappears the moment refunded_at is set.
  const refundBtn=(o.status==='approved'&&!isRefunded)
    ?`<button class="adm-btn-refund" onclick="admRefundOrder('${o.id}')">Refund customer</button>`
    :'';

  return `<div class="adm-recpt-card">
    <div class="adm-row-top" style="align-items:flex-start;">
      <div class="adm-thumbs-row">
        <div class="adm-thumb-block">${prodThumb}<span class="adm-thumb-block-label">Product</span></div>
        <div class="adm-thumb-block">${receiptThumb}<span class="adm-thumb-block-label">Receipt</span></div>
      </div>
      <div class="adm-row-mid">
        <div class="adm-row-name">${admEsc(product)}</div>
        <div style="margin-top:5px;">${statusPill}</div>
      </div>
      <div class="adm-row-amt">${admMoneyH(platformFee)}</div>
    </div>
    ${detailsSub}
    ${customerLine}
    ${noteBlock}
    <div class="adm-order-detail-rows" style="margin-top:8px;">
      <div class="adm-detail-row"><span>Price</span><span>${admMoneyH(unitPrice)}</span></div>
      <div class="adm-detail-row"><span>Qty</span><span>${qty}</span></div>
      <div class="adm-detail-row"><span>Total</span><span>${admMoneyH(productTotal)}</span></div>
      <div class="adm-detail-row"><span>Marketer fee</span><span>${admMoneyH(marketerFee)}</span></div>
      <div class="adm-detail-row"><span>Platform fee</span><span>${admMoneyH(platformFee)}</span></div>
    </div>
    ${reviewedLine}
    ${actions}
    ${refundBtn}
  </div>`;
}

function admLightbox(url){
  document.getElementById('adm-lightbox-img').src=url;
  document.getElementById('adm-lightbox').classList.add('open');
}

async function admApprove(id){
  if(!confirm('Approve this receipt? The order will be forwarded to the business owner.'))return;
  try{await window.LateenAPI.admin.approveOrder(id);admLoadVerify();}catch(e){alert('Approve failed: '+e.message);}
}
async function admReject(id){
  const notes=prompt('Reason for rejecting this receipt? (visible to the marketer)');
  if(notes===null)return;
  try{await window.LateenAPI.admin.rejectOrder(id,notes||'Receipt rejected');admLoadVerify();}catch(e){alert('Reject failed: '+e.message);}
}
async function admRefundOrder(id){
  if(!confirm("Refund this order?\n\nThis removes its platform fee from your total platform fee metrics on the Home page, and deducts the marketer's fee for this order from their wallet balance. It does not change the order's status elsewhere in the app. This can't be undone."))return;
  const comment=prompt('Add a note for the marketer? (optional — leave blank to skip)');
  if(comment===null)return;
  try{
    await window.LateenAPI.admin.refundOrder(id,comment.trim());
    admLoadVerify();
    admLoadMetrics();
  }catch(e){alert('Refund failed: '+e.message);}
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
      const detail=(label,val)=>val?`<div class="adm-pay-detail-row"><span class="adm-pay-detail-k">${admEsc(label)}</span><span class="adm-pay-detail-v" data-no-i18n>${admEsc(val)}</span></div>`:'';
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
          <div class="adm-user-av" data-no-i18n>${admEsc(admInitials(name))}</div>
          <div class="adm-pay-info">
            <div class="adm-pay-name" data-no-i18n>${admEsc(name)}</div>
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
    const uid=u.id;
    const name=u.business_name||u.full_name||'Unnamed';
    const nameSafe=admEsc(name).replace(/'/g,"&#39;");
    const role=u.role||'marketer';
    const pillClass=role==='admin'?'adm-role-admin':role==='business'?'adm-role-business':'adm-role-marketer';
    const canImpersonate=role==='marketer'||role==='business';
    const goBtn=canImpersonate?`<button class="adm-go-btn" onclick="admGoToAccount('${uid}','${role}','${nameSafe}')">Go to Account</button>`:'';
    const isBanned=!!u.banned_at;
    const isFrozen=!!u.frozen_at;
    const freezeBtn=canImpersonate?`<button class="adm-go-btn" style="background:${isFrozen?'#cce5ff':'#e2e3e5'};color:${isFrozen?'#004085':'#495057'};border-color:${isFrozen?'#b8daff':'#d6d8db'};" onclick="admToggleFreeze('${uid}','${nameSafe}',${isFrozen})">${isFrozen?'Unfreeze':'Freeze'}</button>`:'';
    const banBtn=`<button class="adm-go-btn" style="background:${isBanned?'#e2e3e5':'#fff3cd'};color:${isBanned?'#495057':'#856404'};border-color:${isBanned?'#d6d8db':'#ffeeba'};" onclick="admToggleBan('${uid}','${nameSafe}',${isBanned})">${isBanned?'Unban':'Ban Email'}</button>`;
    const flags=(isBanned?'<span style="font-size:11px;color:#c00;font-weight:600;margin-inline-end:8px;">Banned</span>':'')+(isFrozen?'<span style="font-size:11px;color:#004085;font-weight:600;">Frozen</span>':'');
    return `<div class="adm-user-card">
      <div class="adm-user-row" onclick="admToggleUserCard('${uid}')">
        <div class="adm-user-av" data-no-i18n>${admEsc(admInitials(name))}</div>
        <div style="flex:1;min-width:0;">
          <div class="adm-row-name" data-no-i18n>${admEsc(name)}</div>
          <div class="adm-row-sub">${admEsc(u.email||'no email')} · ${admEsc(u.phone||'no phone')} · ${admWhen(u.created_at)}</div>
          ${flags?`<div style="margin-top:2px;">${flags}</div>`:''}
        </div>
        <span class="adm-role-pill ${pillClass}">${admEsc(role)}</span>
        <span class="adm-user-chev" id="chev-${uid}">▾</span>
      </div>
      <div class="adm-expand" id="exp-${uid}">
        <div class="adm-user-actions">
          ${goBtn}
          ${freezeBtn}
          <button class="adm-go-btn" style="background:#fee;color:#c00;border-color:#fcc;" onclick="admDeleteUser('${uid}','${nameSafe}')">Remove</button>
          ${banBtn}
        </div>
        <div class="adm-notif-box">
          <div class="adm-notif-lbl">Notification title (what they see first)</div>
          <input type="text" class="adm-notif-inp" id="un-title-${uid}" placeholder="e.g. Your account was reviewed" />
          <div class="adm-notif-lbl">Notification content (shown when tapped)</div>
          <textarea class="adm-notif-textarea" id="un-body-${uid}" placeholder="Full message…"></textarea>
          <div class="adm-notif-photo-row">
            <div class="adm-notif-photo-add" id="un-photo-add-${uid}" onclick="document.getElementById('un-photo-input-${uid}').click()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="adm-notif-photo-preview" id="un-photo-preview-${uid}" style="display:none;">
              <img id="un-photo-img-${uid}" src="" onclick="admLightbox(document.getElementById('un-photo-img-${uid}').src)"/>
              <button type="button" class="adm-notif-photo-x" onclick="admRemoveUserNotifPhoto('${uid}')">×</button>
            </div>
            <input type="file" id="un-photo-input-${uid}" accept="image/*" style="display:none" onchange="admPickUserNotifPhoto('${uid}',this)"/>
            <span class="adm-notif-hint" id="un-photo-hint-${uid}">Attach photo (optional)</span>
          </div>
          <button class="adm-notif-send-btn" id="un-send-${uid}" onclick="admSendUserNotification('${uid}','${nameSafe}')">Send Notification</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

let admUserNotifPhoto={};
function admToggleUserCard(uid){
  const exp=document.getElementById('exp-'+uid);
  const chev=document.getElementById('chev-'+uid);
  if(!exp)return;
  const isOpen=exp.classList.toggle('open');
  if(chev)chev.classList.toggle('open',isOpen);
}
async function admPickUserNotifPhoto(uid,inp){
  const file=inp&&inp.files&&inp.files[0];if(!file)return;
  const hint=document.getElementById('un-photo-hint-'+uid);
  if(hint)hint.textContent='Uploading…';
  try{
    if(!window.LateenAPI||!window.LateenAPI.uploadPhoto)throw new Error('no uploader');
    const url=await window.LateenAPI.uploadPhoto(file);
    admUserNotifPhoto[uid]=url;
    const prev=document.getElementById('un-photo-preview-'+uid);
    const img=document.getElementById('un-photo-img-'+uid);
    const add=document.getElementById('un-photo-add-'+uid);
    if(img)img.src=url;
    if(prev)prev.style.display='block';
    if(add)add.style.display='none';
    if(hint)hint.textContent='';
  }catch(e){console.error('[admin] notif photo upload',e);if(hint)hint.textContent='Upload failed, try again.';}
  if(inp)inp.value='';
}
function admRemoveUserNotifPhoto(uid){
  delete admUserNotifPhoto[uid];
  const prev=document.getElementById('un-photo-preview-'+uid);
  const add=document.getElementById('un-photo-add-'+uid);
  const hint=document.getElementById('un-photo-hint-'+uid);
  if(prev)prev.style.display='none';
  if(add)add.style.display='flex';
  if(hint)hint.textContent='Attach photo (optional)';
}
async function admSendUserNotification(uid,name){
  const titleEl=document.getElementById('un-title-'+uid);
  const bodyEl=document.getElementById('un-body-'+uid);
  const title=titleEl?titleEl.value.trim():'';
  const body=bodyEl?bodyEl.value.trim():'';
  if(!title){alert('Type the notification title first.');return;}
  const btn=document.getElementById('un-send-'+uid);
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    await window.LateenAPI.admin.sendUserNotification(uid,title,body,admUserNotifPhoto[uid]||null);
    if(titleEl)titleEl.value='';
    if(bodyEl)bodyEl.value='';
    admRemoveUserNotifPhoto(uid);
    alert('Notification sent to '+name+'.');
    admToggleUserCard(uid);
  }catch(e){alert('Failed: '+e.message);}
  if(btn){btn.disabled=false;btn.textContent='Send Notification';}
}

let admBroadcastPhotoUrl=null;
function admToggleBroadcastPanel(){
  const panel=document.getElementById('adm-broadcast-panel');
  if(panel)panel.classList.toggle('open');
}
async function admPickBroadcastPhoto(inp){
  const file=inp&&inp.files&&inp.files[0];if(!file)return;
  const hint=document.getElementById('bn-photo-hint');
  if(hint)hint.textContent='Uploading…';
  try{
    if(!window.LateenAPI||!window.LateenAPI.uploadPhoto)throw new Error('no uploader');
    const url=await window.LateenAPI.uploadPhoto(file);
    admBroadcastPhotoUrl=url;
    const prev=document.getElementById('bn-photo-preview');
    const img=document.getElementById('bn-photo-img');
    const add=document.getElementById('bn-photo-add');
    if(img)img.src=url;
    if(prev)prev.style.display='block';
    if(add)add.style.display='none';
    if(hint)hint.textContent='';
  }catch(e){console.error('[admin] broadcast photo upload',e);if(hint)hint.textContent='Upload failed, try again.';}
  if(inp)inp.value='';
}
function admRemoveBroadcastPhoto(){
  admBroadcastPhotoUrl=null;
  const prev=document.getElementById('bn-photo-preview');
  const add=document.getElementById('bn-photo-add');
  const hint=document.getElementById('bn-photo-hint');
  if(prev)prev.style.display='none';
  if(add)add.style.display='flex';
  if(hint)hint.textContent='Attach photo (optional)';
}
async function admSendBroadcastNotification(){
  const titleEl=document.getElementById('bn-title');
  const bodyEl=document.getElementById('bn-body');
  const title=titleEl?titleEl.value.trim():'';
  const body=bodyEl?bodyEl.value.trim():'';
  if(!title){alert('Type the notification title first.');return;}
  if(!confirm('Send this notification to ALL marketers?'))return;
  const btn=document.getElementById('bn-send-btn');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    const count=await window.LateenAPI.admin.broadcastNotification(title,body,admBroadcastPhotoUrl);
    if(titleEl)titleEl.value='';
    if(bodyEl)bodyEl.value='';
    admRemoveBroadcastPhoto();
    alert('Notification sent to '+count+' marketer(s).');
    admToggleBroadcastPanel();
  }catch(e){alert('Failed: '+e.message);}
  if(btn){btn.disabled=false;btn.textContent='Send to All Marketers';}
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
      const img=photo?`<img src="${admEsc(photo)}" alt="${admEsc(p.name)}" data-no-i18n style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>`:'📦';
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
          <div class="cn" data-no-i18n>${admEsc(p.name)}</div>
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
    const gallery=photos.length
      ?`<div class="pd-gallery"><div class="pd-gallery-track" id="admPdGalleryTrack">${photos.map(u=>`<div class="pd-gallery-slide" onclick="admLightbox('${admEsc(u)}')"><img src="${admEsc(u)}" alt=""/></div>`).join('')}</div>${photos.length>1?`<div class="pd-gallery-dots" id="admPdGalleryDots">${photos.map((_,i)=>`<span class="pd-gd-dot${i===0?' on':''}"></span>`).join('')}</div>`:''}</div>`
      :`<div class="pd-gallery pd-gallery-empty"><div class="pd-gallery-slide" style="font-size:64px;">📦</div></div>`;
    const descBlock=p.description?`<div class="pd-sec-ttl">Description</div><div class="pd-desc" data-no-i18n>${admEsc(p.description)}</div>`:'';

    // Earn box — same 3-row breakdown as the marketer's sheet (commission,
    // platform fee, deposit = the two combined), reworded from "your" to
    // "marketer's" since it's the admin looking at someone else's earning.
    const commVal=p.comm_mode==='fixed'?curH+Number(p.comm_fixed||0).toFixed(2):Number(p.comm_pct||0)+'%';
    const earnAmt=p.comm_mode==='fixed'?Number(p.comm_fixed||0):Number(p.price||0)*Number(p.comm_pct||0)/100;
    const platFee=Number(p.platform_fee||0);
    const deposit=earnAmt+platFee;

    const icPrice='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    const icStock='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>';
    const icSold='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    const icRevenue='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
    const icPin='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
    const icPeople='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    const chev='<svg class="pd-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    // Variant groups — same derivation the marketer's browse card uses:
    // real variant_groups if the business set them up, else Size/Colour
    // built from the plain sizes/colors arrays.
    const __hasQty=v=>v&&typeof v==='object'&&v.qty!==undefined&&v.qty!==null&&v.qty!==''&&Number.isFinite(Number(v.qty));
    const __ni=v=>typeof v==='string'?{val:v,photo:'',qty:null}:{val:(v&&v.val)||'',photo:(v&&v.photo)||'',qty:__hasQty(v)?Math.max(0,Number(v.qty)):null};
    const vg=(p.variant_groups&&p.variant_groups.length)
      ?p.variant_groups.map(g=>({name:g.name||'',items:(g.items||[]).map(__ni).filter(x=>x.val)})).filter(g=>g.items.length)
      :[...(p.sizes&&p.sizes.length?[{name:'Size',items:p.sizes.map(__ni)}]:[]),...(p.colors&&p.colors.length?[{name:'Colour',items:p.colors.map(__ni)}]:[])];
    const variantChev='<svg class="pd-variant-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const variantBlock=vg.map((g,gi)=>`<div class="pd-variant"><div class="pd-variant-lbl" data-no-i18n>${admEsc(g.name)}</div><div class="pd-variant-sel-wrap"><select class="pd-variant-sel" data-no-i18n id="admPdVsel${gi}">${g.items.map(x=>{
      const q=x.qty;
      const oos=q===0;
      const suffix=q===null?'':(q>0?` · ${q} left`:' · out of stock');
      return `<option value="${admEsc(x.val)}"${oos?' disabled':''}>${admEsc(x.val)}${suffix}</option>`;
    }).join('')}</select>${variantChev}</div></div>`).join('');

    // Ships to — collapsible, same as the marketer sheet.
    const CN={NG:'Nigeria',GH:'Ghana',EG:'Egypt',KE:'Kenya',ZA:'South Africa',MA:'Morocco'};
    const deliveryEntries=p.delivery&&typeof p.delivery==='object'?Object.entries(p.delivery):[];
    const cityCount=deliveryEntries.reduce((n,[,z])=>n+Object.keys((z&&z.cities)||{}).length,0);
    const cityText=cityCount?(cityCount===1?'1 city':cityCount+' cities'):'—';
    const zonesInner=deliveryEntries.map(([code,z])=>{
      const cities=z&&z.cities?Object.entries(z.cities):[];
      return `<div class="pd-zone-card"><div class="pd-zone-hd">${admEsc(CN[code]||code)}</div>${cities.map(([city,c])=>`<div class="pd-zone-city"><span data-no-i18n>${admEsc(city)}</span><span>Ship ${curH}${Number(c.shipping||0).toFixed(2)} · Deliver ${curH}${Number(c.delivery||0).toFixed(2)}</span></div>`).join('')}</div>`;
    }).join('');
    const shipsToRow=deliveryEntries.length?`<div class="pd-row pd-row-tap" onclick="admPdToggle('admPdZones')">
        <div class="pd-row-ic">${icPin}</div>
        <div class="pd-row-lbl">Delivery to</div>
        <div class="pd-row-val">${cityText}${chev.replace('class="pd-chev"','class="pd-chev" id="admPdZonesChev"')}</div>
      </div>
      <div id="admPdZones" class="pd-zones" style="display:none;">${zonesInner}</div>`:'';

    // Stock — collapsible per-variant breakdown when variants are tracked.
    const qty=__admEffectiveQty(p);
    const low=qty>0&&qty<=20;
    const stockRow=`<div class="pd-row${vg.length?' pd-row-tap':''}"${vg.length?` onclick="admPdToggle('admPdStock')"`:''}>
        <div class="pd-row-ic">${icStock}</div>
        <div class="pd-row-lbl">In stock</div>
        <div class="pd-row-val${low?' am':''}">${qty} pcs${vg.length?chev.replace('class="pd-chev"','class="pd-chev" id="admPdStockChev"'):''}</div>
      </div>
      ${vg.length?`<div id="admPdStock" class="pd-zones" style="display:none;">${vg.map(g=>`<div class="pd-zone-card"><div class="pd-zone-hd" data-no-i18n>${admEsc(g.name)}</div>${g.items.map(it=>`<div class="pd-zone-city"><span data-no-i18n>${admEsc(it.val)}</span><span>${it.qty===null?'—':it.qty+' pcs'}</span></div>`).join('')}</div>`).join('')}</div>`:''}`;

    const ownerName=owner.business_name||owner.full_name||p.biz_name||'Unknown';
    const ownerOther=owner.business_name&&owner.full_name&&owner.business_name!==owner.full_name?`<div class="adm-pd-owner-row">Business owner name: <span data-no-i18n>${admEsc(owner.full_name)}</span></div>`:'';
    const ownerEmail=owner.email?`<div class="adm-pd-owner-row">Email: <span>${admEsc(owner.email)}</span></div>`:'';

    body.innerHTML=`
      <div class="pd-card">
        <div class="pd-hd-row">
          <div class="pd-hd-name" data-no-i18n>${admEsc(p.name)}</div>
          <div class="pd-hd-code"><span class="pd-hd-code-lbl">Product code:</span> <span data-no-i18n>${admEsc(p.code||'—')}</span></div>
        </div>
      </div>
      ${gallery}
      ${descBlock}
      <div class="pd-earn">
        <div class="pd-earn-lbl">Marketer's earning per sale</div>
        <div class="pd-earn-val">${curH}${earnAmt.toFixed(2)}</div>
        <div class="pd-earn-divider"></div>
        <div class="pd-earn-rows">
          <div class="pd-earn-row"><span class="pd-earn-row-lbl">Commission</span><span class="pd-earn-row-val pu">${commVal}</span></div>
          <div class="pd-earn-row"><span class="pd-earn-row-lbl">Platform fee</span><span class="pd-earn-row-val">${curH}${platFee.toFixed(2)}</span></div>
          <div class="pd-earn-row"><span class="pd-earn-row-lbl">Deposit (with platform fee)</span><span class="pd-earn-row-val">${curH}${deposit.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="pd-row"><div class="pd-row-ic">${icPrice}</div><div class="pd-row-lbl">Product price</div><div class="pd-row-val">${curH}${Number(p.price||0).toFixed(2)}</div></div>
      ${variantBlock}
      ${shipsToRow}
      ${stockRow}
      <div class="pd-row"><div class="pd-row-ic">${icPeople}</div><div class="pd-row-lbl">Active marketers</div><div class="pd-row-val" id="admPdActMkt">…</div></div>
      <div class="pd-row"><div class="pd-row-ic">${icSold}</div><div class="pd-row-lbl">Sold</div><div class="pd-row-val">${Number(p.sold||0)}</div></div>
      <div class="pd-row"><div class="pd-row-ic">${icRevenue}</div><div class="pd-row-lbl">Revenue</div><div class="pd-row-val">${curH}${Number(p.revenue||0).toFixed(2)}</div></div>
      <div class="pd-sec-ttl">Business owner</div>
      <div class="adm-pd-owner">
        <div class="adm-pd-owner-name" data-no-i18n>${admEsc(ownerName)}</div>
        ${ownerOther}
        <div class="adm-pd-owner-row">Phone: <span>${admEsc(owner.phone||'—')}</span></div>
        ${ownerEmail}
        <div class="adm-pd-owner-row">Joined: <span>${owner.created_at?admWhen(owner.created_at):'—'}</span></div>
        <div class="adm-pd-owner-row" style="margin-top:8px;">
          <button class="adm-go-btn" onclick="admGoToAccount('${p.business_id}','business','${admEsc(ownerName).replace(/'/g,'&#39;')}')">Go to Account</button>
        </div>
      </div>
    `;

    // Gallery dot sync on scroll (matches the marketer sheet's behaviour).
    const track=document.getElementById('admPdGalleryTrack');
    const dots=document.getElementById('admPdGalleryDots');
    if(track&&dots){
      track.addEventListener('scroll',()=>{
        const w=track.clientWidth||1;
        const i=Math.round(Math.abs(track.scrollLeft)/w);
        [...dots.children].forEach((d,k)=>d.classList.toggle('on',k===i));
      });
    }
    // Live active-marketers count (same shared RPC the marketer sheet uses).
    try{
      window.LateenAPI.activeMarketersCounts([p.id]).then(m=>{
        const el=document.getElementById('admPdActMkt');
        if(el)el.textContent=String(m[p.id]||0);
      }).catch(()=>{const el=document.getElementById('admPdActMkt');if(el)el.textContent='0';});
    }catch(e){}
  }catch(e){console.error('[admin] product detail',e);body.innerHTML='<div class="adm-empty">Failed to load: '+admEsc(e.message||'')+'</div>';}
}

function admPdToggle(id){
  const el=document.getElementById(id);
  if(!el)return;
  const isOpen=el.style.display!=='none';
  el.style.display=isOpen?'none':'flex';
  const chev=document.getElementById(id+'Chev');
  if(chev)chev.classList.toggle('open',!isOpen);
}

/* ========== Reports ========== */
let admReportsCache=[];
let admReportFilter='';
function admReportTypeLabel(t){return t==='product'?'Product':(t==='merchant'?'Merchant':'Other');}
async function admLoadReports(){
  try{
    admReportsCache=await window.LateenAPI.admin.listReports();
  }catch(e){console.error('[admin] listReports',e);return;}
  const openCount=admReportsCache.filter(r=>r.status==='open').length;
  const badge=document.getElementById('adm-reports-count');
  if(badge){badge.style.display=openCount>0?'inline-block':'none';badge.textContent=String(openCount);}
  if(document.getElementById('adm-reports-ov')?.classList.contains('open'))admRenderReports();
}
function admSetReportFilter(f,el){
  admReportFilter=f;
  document.querySelectorAll('#reports-filter-row .adm-filter-chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  admRenderReports();
}
function admOpenReports(){
  const ov=document.getElementById('adm-reports-ov');
  if(!ov)return;
  ov.classList.add('open');
  if(!admReportsCache.length){
    const root=document.getElementById('reports-list');
    if(root)root.innerHTML='<div class="adm-empty">Loading…</div>';
  }else{
    admRenderReports();
  }
  admLoadReports();
}
function admCloseReports(){
  const ov=document.getElementById('adm-reports-ov');
  if(ov)ov.classList.remove('open');
}
function admRenderReports(){
  const root=document.getElementById('reports-list');
  if(!root)return;
  const list=admReportFilter?admReportsCache.filter(r=>r.status===admReportFilter):admReportsCache;
  if(!list.length){root.innerHTML='<div class="adm-empty">No reports'+(admReportFilter?' in this filter':'')+'.</div>';return;}
  root.innerHTML=list.map(r=>{
    const reporter=r.reporter||{};
    const business=r.business||{};
    const product=r.product||{};
    const reporterName=reporter.full_name||'Unknown marketer';
    const businessName=business.business_name||business.full_name||'Unknown business';
    const reporterNameSafe=admEsc(reporterName).replace(/'/g,'&#39;');
    const businessNameSafe=admEsc(businessName).replace(/'/g,'&#39;');
    const isOpen=r.status==='open';
    const photo=Array.isArray(product.photos)?product.photos[0]:null;
    const thumb=photo?`<img class="rpt-mini-thumb" src="${admEsc(photo)}" alt=""/>`:`<div class="rpt-mini-thumb-empty">📦</div>`;
    const prodBlock=r.product_id?`<div class="rpt-mini-prod" onclick="admOpenProduct('${r.product_id}')">
        ${thumb}
        <div class="rpt-mini-info">
          <div class="rpt-name">${product.name?`<span data-no-i18n>${admEsc(product.name)}</span>`:'Product no longer available'}</div>
          <div class="rpt-sub">${product.price!=null?admMoney(product.price):''}${product.code?' · <span data-no-i18n>'+admEsc(product.code)+'</span>':''}</div>
        </div>
      </div>`:'';
    const bizRow=r.business_id?`<div class="rpt-biz-row">
        <div style="min-width:0;">
          <div class="rpt-name" data-no-i18n>${admEsc(businessName)}</div>
          <div class="rpt-sub">${admEsc(business.phone||'no phone')}</div>
        </div>
        <button class="adm-go-btn" onclick="admGoToAccount('${r.business_id}','business','${businessNameSafe}')">Go to business account</button>
      </div>`:'';
    const commentBlock=isOpen
      ?`<div class="rpt-comment-box">
          <textarea class="rpt-comment-ta" id="rpt-comment-${r.id}" placeholder="Write your review of this report — the marketer will see it as 'Report reviewed'"></textarea>
          <button class="adm-btn adm-btn-acc" style="width:100%;" onclick="admResolveReport('${r.id}')">Send review to marketer</button>
        </div>`
      :`<div class="rpt-resolved-note"><b>Admin comment:</b> <span data-no-i18n>${admEsc(r.admin_comment||'')}</span><div style="margin-top:4px;opacity:0.8;font-size:11px;">Reviewed ${admWhen(r.resolved_at)}</div></div>`;
    return `<div class="rpt-card">
      <div class="rpt-top">
        <span class="rpt-type-pill">${admReportTypeLabel(r.report_type)}</span>
        <span class="rpt-status-pill ${isOpen?'rpt-status-open':'rpt-status-resolved'}">${isOpen?'Open':'Resolved'}</span>
      </div>
      <div class="rpt-reporter-row">
        <div class="adm-user-av" data-no-i18n>${admEsc(admInitials(reporterName))}</div>
        <div style="flex:1;min-width:120px;">
          <div class="rpt-name" data-no-i18n>${admEsc(reporterName)}</div>
          <div class="rpt-sub">${admEsc(reporter.phone||'no phone')} · ${admWhen(r.created_at)}</div>
        </div>
        <button class="adm-go-btn" onclick="admGoToAccount('${r.reporter_id}','marketer','${reporterNameSafe}')">Go to marketer account</button>
      </div>
      <div class="rpt-msg" data-no-i18n>${admEsc(r.message)}</div>
      ${prodBlock}
      ${bizRow}
      ${commentBlock}
    </div>`;
  }).join('');
}
async function admResolveReport(id){
  const ta=document.getElementById('rpt-comment-'+id);
  const comment=(ta&&ta.value||'').trim();
  if(!comment){alert('Write a comment before sending your review.');return;}
  if(!confirm('Send this review to the marketer? They will be notified as "Report reviewed".'))return;
  try{
    await window.LateenAPI.admin.resolveReport(id,comment);
    await admLoadReports();
  }catch(e){alert('Failed: '+e.message);}
}

/* boot */
admLoadMetrics();
admLoadReports();
setInterval(()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}},10000);
if(window.LateenAPI&&window.LateenAPI.subscribe){window.__lateenUnsubs=window.__lateenUnsubs||[];window.__lateenUnsubs.push(window.LateenAPI.subscribe('admin-wallets',()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}}));window.__lateenUnsubs.push(window.LateenAPI.subscribe('admin-payouts',()=>{try{if(document.getElementById('adm-payouts')?.classList.contains('active'))admLoadPayouts();}catch(e){}}));window.__lateenUnsubs.push(window.LateenAPI.subscribe('admin-reports',()=>{admLoadReports();}));}

/* ========== Employees & Payroll ========== */
let admEmpCache=[];
let admEmpFilter=''; // '', 'pending', 'paid'
let admEmpSearchQ='';

function admEmpFmtDate(d){if(!d)return '—';const dt=new Date(d);return dt.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}
/* Every employee's payday is exactly 30 days after they were hired, then
   every 30 days after that — not tied to the calendar month. This returns
   the employee's *current* pay cycle: a (y,m) key used to look up/record
   payments (kept compatible with the employee_payments table's existing
   period_year/period_month columns, just counted from hire date instead of
   the calendar), plus the real payday date for this cycle and the next one. */
function admEmpCycle(emp){
  const hired=new Date((emp.hired_at||new Date().toISOString().slice(0,10))+'T00:00:00');
  const now=new Date();
  const daysSince=Math.max(0,Math.floor((now-hired)/86400000));
  const cycleIndex=Math.floor(daysSince/30);
  const totalMonths=hired.getFullYear()*12+hired.getMonth()+cycleIndex;
  const y=Math.floor(totalMonths/12), m=(totalMonths%12)+1;
  // QA/testing account: employee_number "5050505050" is payable on hire date
  // (and every 30 days thereafter) instead of waiting a full month.
  const isQA=String(emp.employee_number||'').trim()==='5050505050';
  const payday=new Date(hired); payday.setDate(payday.getDate()+(cycleIndex+(isQA?0:1))*30);
  const nextPayday=new Date(hired); nextPayday.setDate(nextPayday.getDate()+(cycleIndex+(isQA?1:2))*30);
  return {y,m,cycleIndex,payday,nextPayday};
}
function admEmpIsPaid(emp,cyc){return (emp.payments||[]).some(x=>x.period_year===cyc.y&&x.period_month===cyc.m);}
/* A freshly-listed employee's cycle payday is 30 days out -- the pay button
   should not be actionable ("Mark as Paid") before that date arrives. Until
   then it just shows a greyed-out "Pending" state. */
function admEmpIsDue(cyc){return new Date()>=cyc.payday;}

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
  const cycles=new Map();
  let totalSalary=0,paidAmt=0,pendingAmt=0,paidCount=0;
  admEmpCache.forEach(e=>{
    const cyc=admEmpCycle(e);
    cycles.set(e.id,cyc);
    const sal=Number(e.monthly_salary||0);
    totalSalary+=sal;
    if(admEmpIsPaid(e,cyc)){paidAmt+=sal;paidCount++;}else{pendingAmt+=sal;}
  });
  document.getElementById('emp-total-salary').innerHTML=admMoneyH(totalSalary);
  document.getElementById('emp-paid-amt').innerHTML=admMoneyH(paidAmt);
  document.getElementById('emp-pending-amt').innerHTML=admMoneyH(pendingAmt);
  document.getElementById('emp-count').textContent=admEmpCache.length;
  document.getElementById('emp-paid-count').textContent=paidCount;

  const filtered=admEmpCache.filter(e=>{
    const paid=admEmpIsPaid(e,cycles.get(e.id));
    if(admEmpFilter==='paid'&&!paid)return false;
    if(admEmpFilter==='pending'&&paid)return false;
    return true;
  });
  if(!filtered.length){root.innerHTML='<div class="adm-empty">No employees match.</div>';return;}
  root.innerHTML=filtered.map(e=>{
    const cyc=cycles.get(e.id);
    const paid=admEmpIsPaid(e,cyc);
    const due=admEmpIsDue(cyc);
    const paydayLabel=admEmpFmtDate(paid?cyc.nextPayday:cyc.payday);
    const status=paid?'<span style="color:#2dbd8f">Paid · next due '+paydayLabel+'</span>':(due?'<span style="color:#e07070">Pending · due '+paydayLabel+'</span>':'<span style="color:#9e9b97">Pending · due '+paydayLabel+'</span>');
    const btnClass=paid?'paid':(due?'':'not-due');
    const btnLabel=paid?'Paid ✓':(due?'Mark as Paid':'Pending');
    const btnDisabled=paid||!due;
    return `<div class="adm-emp-row">
      <div class="adm-emp-top">
        <div class="adm-emp-av" data-no-i18n>${admEsc(admInitials(e.full_name))}</div>
        <div style="flex:1;min-width:0;">
          <div class="adm-emp-name" data-no-i18n>${admEsc(e.full_name)} <span style="color:#9e9b97;font-weight:400;">· ${admEsc(e.employee_number)}</span></div>
          <div class="adm-emp-sub" data-no-i18n>${admEsc(e.job_title||'—')} · ${admEsc(e.email||'no email')}</div>
        </div>
        <div style="text-align:right;font-size:13px;font-weight:500;color:#f5b441;">${admMoneyH(e.monthly_salary)}</div>
      </div>
      <div class="adm-emp-meta">
        <div>Hired <b>${admEmpFmtDate(e.hired_at)}</b></div>
        <div>Payday <b>${admEsc(paydayLabel)}</b></div>
        <div style="grid-column:1/-1;">Status: ${status}</div>
        ${e.notes?`<div style="grid-column:1/-1;color:#9e9b97;font-style:italic;" data-no-i18n>${admEsc(e.notes)}</div>`:''}
      </div>
      <div class="adm-emp-actions">
        <button class="adm-emp-pay-btn ${btnClass}" ${btnDisabled?'disabled':''} onclick="admPayEmp('${e.id}',${e.monthly_salary})">${btnLabel}</button>
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
  const e=admEmpCache.find(x=>x.id===id);
  if(!e)return;
  const cyc=admEmpCycle(e);
  if(admEmpIsPaid(e,cyc))return;
  if(!admEmpIsDue(cyc))return;
  const due=admEmpFmtDate(cyc.payday);
  if(!confirm('Mark '+e.full_name+' as paid for the cycle due '+due+' ('+admMoney(amount)+')?'))return;
  try{
    await window.LateenAPI.admin.payEmployee({employee_id:id,period_year:cyc.y,period_month:cyc.m,amount:Number(amount)});
    await admLoadEmployees();
    if(document.getElementById('adm-home')?.classList.contains('active'))admLoadMetrics();
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
      <div style="font-size:16px;font-weight:600;" data-no-i18n>${admEsc(e.full_name)}</div>
      <div style="font-size:12px;color:#9e9b97;margin-top:2px;" data-no-i18n>${admEsc(e.employee_number)} · ${admEsc(e.job_title||'—')}</div>
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

  // Real employee-salary-paid sum for whichever day/month/year is selected
  // (or all-time if none is) — same filter logic as getFees(), but reading
  // admHomeRaw.employeePayments (paid_at is when a salary was actually marked
  // paid). These rows survive an employee being deleted, so a deletion never
  // changes this total. Used to derive total profit = fees − salaries paid.
  function getEmployeeSalaryPaid(){
    const raw = admHomeRaw;
    if(!raw || !raw.employeePayments) return 0;
    let rows = raw.employeePayments;
    if(selected.year){
      const y = Number(selected.year);
      rows = rows.filter(p => new Date(p.paid_at).getFullYear() === y);
    } else if(selected.month){
      const [y,m] = selected.month.split('-').map(Number);
      rows = rows.filter(p => {
        const d = new Date(p.paid_at);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });
    } else if(selected.day){
      rows = rows.filter(p => {
        const d = new Date(p.paid_at);
        return (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())) === selected.day;
      });
    }
    const sum = rows.reduce((s,p) => s + Number(p.amount||0), 0);
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
      // A refunded order no longer counts as a successful upfront.
      return raw.orders.filter(o => o.reviewed_at && !o.refunded_at && new Date(o.reviewed_at).getTime() <= ts).length;
    }
    if(key === 'succeededPieces'){
      // Same "succeeded" definition as the Pieces sold box in the business
      // breakdown and marketer analytics page (status === 'delivered'),
      // totaled across every order on the platform.
      return raw.orders.reduce((s,o) => {
        if(!o.delivered_at) return s;
        return new Date(o.delivered_at).getTime() <= ts ? s + Number(o.qty||0) : s;
      }, 0);
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
    renderProfitCard();
  }

  // Total profit = platform fees minus employee salaries actually marked as
  // paid, both counted within the same day/month/year filter as the hero
  // card above. Lives collapsed under the hero card; only re-renders its
  // numbers eagerly (cheap), the panel itself only opens on tap.
  let admProfitOpen = false;
  function renderProfitCard(){
    const valEl = document.getElementById('heroProfitValue');
    if(!valEl) return; // markup not present on this page
    const fees = getFees();
    const salaries = getEmployeeSalaryPaid();
    const profit = Math.round((fees - salaries) * 100) / 100;
    valEl.innerHTML = '<span class="cur-sym">د.ل</span>' + profit.toFixed(2);
    const bd = document.getElementById('heroProfitBreakdown');
    if(bd) bd.innerHTML = 'رسوم المنصة ' + admMoneyH(fees) + ' − رواتب الموظفين المدفوعة ' + admMoneyH(salaries);
  }
function admToggleProfitCard(){
    admProfitOpen = !admProfitOpen;
    const toggle = document.getElementById('heroProfitToggle');
    const panel = document.getElementById('heroProfitPanel');
    if(toggle) toggle.classList.toggle('open', admProfitOpen);
    if(panel) panel.classList.toggle('open', admProfitOpen);
    if(admProfitOpen) renderProfitCard();
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
    { key:'succeeded',     label:'Succeeded Upfronts', color:'#caa05a', data: [] },
    { key:'succeededPieces', label:'Succeeded Pieces Sold', color:'#5ec9c4', data: [] }
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
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 12,
        pointBackgroundColor: m.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        borderWidth: 2,
        tension: 0.35,
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          rtl: true,
          displayColors: true,
          backgroundColor: '#1d1d20',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Cairo', size: 11 },
          bodyFont: { family: 'Cairo', size: 11 },
          titleColor: '#9c9c9c',
          bodyColor: '#f3f3f1',
          callbacks: {
            label: (ctx) => ' ' + (ctx.dataset.label || '') + ': ' + Number(ctx.parsed.y || 0).toLocaleString()
          }
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
