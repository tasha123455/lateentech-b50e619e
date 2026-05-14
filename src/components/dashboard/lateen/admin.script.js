/* Admin dashboard logic — all data calls go through window.LateenAPI.admin */
function admEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function admMoney(n){const v=Number(n||0);return '£'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function admInitials(name){if(!name)return '?';return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();}
function admWhen(iso){if(!iso)return '';const d=new Date(iso);const diff=Date.now()-d.getTime();const m=Math.floor(diff/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}

let admUsersCache=[];

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
    document.getElementById('m-fees').textContent=admMoney(m.totalFees);
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
      const name=p.user&&(p.user.business_name||p.user.full_name)||'Marketer';
      const phone=p.user&&p.user.phone||'';
      return `<div class="adm-payout-row">
        <div class="adm-user-av">${admEsc(admInitials(name))}</div>
        <div class="adm-pay-info">
          <div class="adm-pay-name">${admEsc(name)}</div>
          <div class="adm-pay-sub">${admEsc(phone)} · ${admWhen(p.requested_at)}</div>
        </div>
        <div class="adm-pay-amt">${admMoney(p.amount)}</div>
        <button class="adm-btn adm-btn-acc" style="flex:0 0 auto;padding:0 14px;" onclick="admMarkPaid('${p.id}',${p.amount})">Paid</button>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] payouts',e);root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

async function admMarkPaid(id,amt){
  if(!confirm('Confirm you have manually transferred '+admMoney(amt)+'? This will reduce the marketer\'s balance.'))return;
  try{await window.LateenAPI.admin.markPayoutPaid(id);admLoadPayouts();}catch(e){alert('Failed: '+e.message);}
}

async function admLoadUsers(search){
  const root=document.getElementById('users-list');
  root.innerHTML='<div class="adm-empty">Loading…</div>';
  try{
    const list=await window.LateenAPI.admin.listAllUsers(search);
    admUsersCache=list;
    admRenderUsers(list);
  }catch(e){console.error('[admin] users',e);root.innerHTML='<div class="adm-empty">Failed to load.</div>';}
}

function admRenderUsers(list){
  const root=document.getElementById('users-list');
  if(!list.length){root.innerHTML='<div class="adm-empty">No users found.</div>';return;}
  root.innerHTML=list.map(u=>{
    const name=u.business_name||u.full_name||'Unnamed';
    const role=u.role||'marketer';
    const pillClass=role==='admin'?'adm-role-admin':role==='business'?'adm-role-business':'adm-role-marketer';
    return `<div class="adm-user-row">
      <div class="adm-user-av">${admEsc(admInitials(name))}</div>
      <div style="flex:1;min-width:0;">
        <div class="adm-row-name">${admEsc(name)}</div>
        <div class="adm-row-sub">${admEsc(u.phone||'no phone')} · ${admWhen(u.created_at)}</div>
      </div>
      <span class="adm-role-pill ${pillClass}">${admEsc(role)}</span>
    </div>`;
  }).join('');
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
      return `<div class="adm-prod">
        <div class="adm-prod-img-wrap">${img}${pill}</div>
        <div class="adm-prod-body">
          <div class="adm-prod-name">${admEsc(p.name)}</div>
          <div class="adm-prod-shop">${admEsc(p.biz_name||'Shop')}</div>
          <div class="adm-prod-row">
            <span class="adm-prod-price">${admMoney(p.price)}</span>
            <button class="adm-prod-toggle ${isHidden?'hidden-state':'active'}" onclick="admToggleProduct('${p.id}','${isHidden?'active':'hidden'}')">${isHidden?'Unhide':'Hide'}</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error('[admin] products',e);root.innerHTML='<div class="adm-empty" style="grid-column:1/-1;">Failed to load.</div>';}
}

async function admToggleProduct(id,newStatus){
  try{await window.LateenAPI.admin.setProductStatus(id,newStatus);admLoadProducts();}catch(e){alert('Failed: '+e.message);}
}

/* boot */
admLoadMetrics();
