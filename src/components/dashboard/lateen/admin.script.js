/* Admin dashboard logic — all data calls go through window.LateenAPI.admin */
function admEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function admMoney(n){const v=Number(n||0);return '£'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admInitials(name){if(!name)return '?';return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();}
function admWhen(iso){if(!iso)return '';const d=new Date(iso);const diff=Date.now()-d.getTime();const m=Math.floor(diff/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}

let admUsersCache=[];
let admFeeRows=[];
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
  document.getElementById('m-fees-month').textContent=admMoney(admSumFeesIn(y,m));
}
function admUpdateYearFees(){
  const sel=document.getElementById('m-year-picker');
  if(!sel||!sel.value)return;
  sel.dataset.year=sel.value;
  document.getElementById('m-fees-year').textContent=admMoney(admSumFeesIn(Number(sel.value),null));
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
}

async function admLoadMetrics(){
  try{
    const m=await window.LateenAPI.admin.getMetrics();
    admFeeRows=m.feeRows||[];
    document.getElementById('m-fees').textContent=admMoney(m.totalFees);
    admPopulateFeePickers();
    admUpdateMonthFees();
    admUpdateYearFees();
    document.getElementById('m-active').textContent=m.activeUsers.toLocaleString();
    document.getElementById('m-leads').textContent=m.leadsToday.toLocaleString();
    document.getElementById('m-users').textContent=m.totalUsers.toLocaleString();
    document.getElementById('m-products').textContent=m.totalProducts.toLocaleString();
  }catch(e){console.error('[admin] metrics',e);}
}

async function admLoadVerify(){
  const root=document.getElementById('verify-list');
  root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listPendingReceipts();
    if(!list.length){root.innerHTML='<div class="adm-empty">No receipts awaiting review.</div>';return;}
    root.innerHTML=list.map(o=>{
      const fee=Number(o.platform_fee||0)*Number(o.qty||0);
      const marketer=o.marketer&&o.marketer.full_name||'Unknown marketer';
      const phone=o.marketer&&o.marketer.phone||'';
      const product=o.product&&o.product.name||'Order';
      const thumb=o.receipt_url?`<img class="adm-thumb" src="${admEsc(o.receipt_url)}" alt="receipt" onclick="event.stopPropagation();admLightbox('${admEsc(o.receipt_url)}')" />`:`<div class="adm-thumb-empty">📄</div>`;
      return `<div class="adm-row" onclick="admToggleRow('v-${o.id}')">
        <div class="adm-row-top">
          ${thumb}
          <div class="adm-row-mid">
            <div class="adm-row-name">${admEsc(marketer)}</div>
            <div class="adm-row-sub">${admEsc(product)} · ${admEsc(phone)} · ${admWhen(o.created_at)}</div>
          </div>
          <div class="adm-row-amt">${admMoney(fee)}</div>
        </div>
        <div class="adm-expand" id="v-${o.id}">
          ${o.receipt_url?`<img class="adm-receipt-full" src="${admEsc(o.receipt_url)}" alt="receipt" onclick="admLightbox('${admEsc(o.receipt_url)}')"/>`:'<div class="adm-empty">No receipt image</div>'}
          <div class="adm-actions">
            <button class="adm-btn adm-btn-no" onclick="event.stopPropagation();admReject('${o.id}')">Reject</button>
            <button class="adm-btn adm-btn-ok" onclick="event.stopPropagation();admApprove('${o.id}')">Approve</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] verify',e);root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
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
  if(!confirm('Approve this order? Stock will be decremented and the marketer credited.'))return;
  try{await window.LateenAPI.admin.approveOrder(id);admLoadVerify();}catch(e){alert('Approve failed: '+e.message);}
}
async function admReject(id){
  if(!confirm('Reject this order? Receipt will be cleared.'))return;
  try{await window.LateenAPI.admin.rejectOrder(id);admLoadVerify();}catch(e){alert('Reject failed: '+e.message);}
}

async function admLoadPayouts(){
  const root=document.getElementById('payouts-list');
  root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listPayoutRequests();
    if(!list.length){root.innerHTML='<div class="adm-empty">No payout requests pending.</div>';return;}
    root.innerHTML=list.map(p=>{
      const u=p.user||{};
      const name=u.business_name||u.full_name||'Marketer';
      const phone=u.phone||'';
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
      return `<div class="adm-payout-card">
        <div class="adm-payout-row">
          <div class="adm-user-av">${admEsc(admInitials(name))}</div>
          <div class="adm-pay-info">
            <div class="adm-pay-name">${admEsc(name)}</div>
            <div class="adm-pay-sub">${admEsc(phone)} · ${admWhen(p.requested_at)}</div>
          </div>
          <div class="adm-pay-amt">${admMoney(p.amount)}</div>
          <button class="adm-btn adm-btn-acc" style="flex:0 0 auto;padding:0 14px;" onclick="admMarkPaid('${p.id}',${p.amount})">Paid</button>
        </div>
        ${detailsHtml}
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] payouts',e);root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

async function admMarkPaid(id,amt){
  if(!confirm('Confirm you have manually transferred '+admMoney(amt)+'? This will reduce the marketer\'s balance.'))return;
  try{await window.LateenAPI.admin.markPayoutPaid(id);admLoadPayouts();}catch(e){alert('Failed: '+e.message);}
}

let admUserRoleFilter='';
async function admLoadUsers(search){
  const root=document.getElementById('users-list');
  root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listAllUsers(search);
    admUsersCache=list;
    admRenderUsers(admApplyUserFilter(list));
  }catch(e){console.error('[admin] users',e);root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
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
    return `<div class="adm-user-row">
      <div class="adm-user-av">${admEsc(admInitials(name))}</div>
      <div style="flex:1;min-width:0;">
        <div class="adm-row-name">${admEsc(name)}</div>
        <div class="adm-row-sub">${admEsc(u.phone||'no phone')} · ${admWhen(u.created_at)}</div>
      </div>
      <div class="adm-user-actions">
        <span class="adm-role-pill ${pillClass}">${admEsc(role)}</span>
        ${goBtn}
      </div>
    </div>`;
  }).join('');
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

async function admLoadProducts(){
  const root=document.getElementById('products-grid');
  root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listAllProducts();
    if(!list.length){root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">No products yet.</div>';return;}
    root.innerHTML=list.map(p=>{
      const photo=Array.isArray(p.photos)&&p.photos[0];
      const img=photo?`<img class="adm-prod-img" src="${admEsc(photo)}" alt="${admEsc(p.name)}"/>`:`<div class="adm-prod-img-empty">📦</div>`;
      const isHidden=p.status==='hidden';
      const pill=isHidden?'<span class="adm-status-pill" style="background:rgba(224,112,112,0.85);color:#fff;">Hidden</span>':'';
      return `<div class="adm-prod" onclick="admOpenProduct('${p.id}')">
        <div class="adm-prod-img-wrap">${img}${pill}</div>
        <div class="adm-prod-body">
          <div class="adm-prod-name">${admEsc(p.name)}</div>
          <div class="adm-prod-shop">${admEsc(p.biz_name||'Shop')}</div>
          <div class="adm-prod-row">
            <span class="adm-prod-price">${admMoney(p.price)}</span>
            <button class="adm-prod-toggle ${isHidden?'hidden-state':'active'}" onclick="event.stopPropagation();admToggleProduct('${p.id}','${isHidden?'active':'hidden'}')">${isHidden?'Unhide':'Hide'}</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] products',e);root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">Failed to load.</div>';}
}

async function admToggleProduct(id,newStatus){
  try{await window.LateenAPI.admin.setProductStatus(id,newStatus);admLoadProducts();}catch(e){alert('Failed: '+e.message);}
}

function admClosePDetail(){document.getElementById('adm-pdetail').classList.remove('open');}

async function admOpenProduct(id){
  const modal=document.getElementById('adm-pdetail');
  const body=document.getElementById('adm-pdetail-body');
  body.innerHTML='<div class="adm-empty">Loading…</div>';
  modal.classList.add('open');
  try{
    const res=await window.LateenAPI.admin.getProductDetail(id);
    if(!res||!res.product){body.innerHTML='<div class="adm-empty">Product not found.</div>';return;}
    const p=res.product, owner=res.owner||{};
    const cur=(p.currency&&p.currency.symbol)||'£';
    const photos=Array.isArray(p.photos)?p.photos:[];
    const mainImg=photos[0]?`<img class="adm-pd-img" src="${admEsc(photos[0])}" alt="${admEsc(p.name)}" onclick="admLightbox('${admEsc(photos[0])}')"/>`:`<div class="adm-pd-img" style="display:flex;align-items:center;justify-content:center;font-size:48px;color:var(--txt-3);">📦</div>`;
    const thumbs=photos.length>1?`<div class="adm-pd-imgrow">${photos.map(u=>`<img src="${admEsc(u)}" alt="" onclick="admLightbox('${admEsc(u)}')"/>`).join('')}</div>`:'';
    const sizes=Array.isArray(p.sizes)&&p.sizes.length?`<div class="adm-pd-section">Sizes</div><div class="adm-pd-chips">${p.sizes.map(s=>`<span class="adm-pd-chip">${admEsc(s)}</span>`).join('')}</div>`:'';
    const colors=Array.isArray(p.colors)&&p.colors.length?`<div class="adm-pd-section">Colours</div><div class="adm-pd-chips">${p.colors.map(s=>`<span class="adm-pd-chip">${admEsc(s)}</span>`).join('')}</div>`:'';
    const CN={NG:'Nigeria',GH:'Ghana',EG:'Egypt',KE:'Kenya',ZA:'South Africa',MA:'Morocco'};
    const delivery=p.delivery&&typeof p.delivery==='object'?Object.entries(p.delivery):[];
    const deliveryHtml=delivery.length?`<div class="adm-pd-section">Delivery</div>`+delivery.map(([code,z])=>{
      const cities=z&&z.cities?Object.entries(z.cities):[];
      return `<div class="adm-pd-zone"><div class="adm-pd-zone-h">${admEsc(CN[code]||code)}</div>${cities.map(([city,c])=>`<div class="adm-pd-zone-r"><span>${admEsc(city)}</span><span style="color:var(--txt-2);">Ship ${cur}${Number(c.shipping||0).toFixed(2)} · Deliv ${cur}${Number(c.delivery||0).toFixed(2)}</span></div>`).join('')}</div>`;
    }).join(''):'';
    const ownerName=owner.business_name||owner.full_name||p.biz_name||'Unknown';
    const ownerOther=owner.business_name&&owner.full_name&&owner.business_name!==owner.full_name?`<div class="adm-pd-owner-row">Contact name: <span>${admEsc(owner.full_name)}</span></div>`:'';
    body.innerHTML=`
      ${mainImg}${thumbs}
      <div class="adm-pd-name">${admEsc(p.name)}</div>
      <div class="adm-pd-shop">Code: ${admEsc(p.code||'—')} · ${admEsc(p.category||'Uncategorised')}</div>
      <div class="adm-pd-grid">
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Price</div><div class="adm-pd-cell-v">${cur}${Number(p.price||0).toFixed(2)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">In stock</div><div class="adm-pd-cell-v">${Number(p.qty||0)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Commission</div><div class="adm-pd-cell-v">${p.comm_mode==='fixed'?cur+Number(p.comm_fixed||0).toFixed(2):Number(p.comm_pct||0)+'%'}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Platform fee</div><div class="adm-pd-cell-v">${cur}${Number(p.platform_fee||0).toFixed(2)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Sold</div><div class="adm-pd-cell-v">${Number(p.sold||0)}</div></div>
        <div class="adm-pd-cell"><div class="adm-pd-cell-l">Revenue</div><div class="adm-pd-cell-v">${cur}${Number(p.revenue||0).toFixed(2)}</div></div>
      </div>
      ${p.description?`<div class="adm-pd-section">Description</div><div class="adm-pd-desc">${admEsc(p.description)}</div>`:''}
      ${sizes}${colors}${deliveryHtml}
      <div class="adm-pd-section">Business owner</div>
      <div class="adm-pd-owner">
        <div class="adm-pd-owner-name">${admEsc(ownerName)}</div>
        ${ownerOther}
        <div class="adm-pd-owner-row">Phone: <span>${admEsc(owner.phone||p.biz_phone||'—')}</span></div>
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
