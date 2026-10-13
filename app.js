/* Unidos Sempre — painel estático com demonstração local e modo Supabase.
   Sem credenciais hardcoded; permissões reais no banco (schema.sql). */
(() => {
  'use strict';
  const CONFIG = window.UNIDOS_SEMPRE_CONFIG || {};
  const remote = !!(CONFIG.supabaseUrl?.trim() && CONFIG.supabaseAnonKey?.trim());
  const STORE_KEY = 'unidos-sempre-demo-v1';
  const names = { dashboard:'Visão geral', clients:'Clientes', purchases:'Compras', orders:'Pedidos', monitor:'Monitoramento', settings:'Configurações' };
  const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
  const dateBR = v => v ? new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
  const datetimeBR = v => v ? new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  const pad = n => String(n).padStart(2,'0');
  const inputDT = v => {const d = v ? new Date(v) : new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const id = () => (window.crypto?.randomUUID?.() || 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = esc;
  const ago = hours => new Date(Date.now()-hours*36e5).toISOString();
  const PRICE = { 'Celeiro':{5:3,10:5,20:7,30:11.5}, 'Silo':{5:3,10:5,20:7,30:12}, 'Terreno':{5:3,10:5,20:7,30:11} };
  let db=null, supa=null, session=null, profile=null, demoRole='admin', page='dashboard', modalOpen=false;
  let filters={clients:'',purchases:'',orders:'',monitor:'',kind:'todos',status:'todos'};
  let toastTimer=null;
  const $ = s=>document.querySelector(s);
  const clientName = x=>db.clients.find(c=>c.id===x)?.name || 'Cliente não encontrado';
  const purchaseName = x=>x ? (db.purchases.find(p=>p.id===x)?.name || 'Compra arquivada') : 'Sem compra vinculada';
  const isAdmin = () => !remote ? demoRole==='admin' : profile?.role==='admin';
  const ownClientId = () => remote ? profile?.client_id : db.clients[0]?.id;
  const showClients = () => isAdmin() ? db.clients : db.clients.filter(c=>c.id===ownClientId());
  const showOrders = () => isAdmin() ? db.orders : db.orders.filter(o=>o.client_id===ownClientId());
  const showPurchases = () => isAdmin() ? db.purchases : db.purchases.filter(p=>showOrders().some(o=>o.purchase_id===p.id));
  const orderStatus = o => (o.delivery_status==='coletado'||o.collected_at) ? 'coletado' : o.supplier_sent_at && Date.now()-new Date(o.supplier_sent_at).getTime()>20*36e5 ? 'expirado' : o.delivery_status || 'pendente';
  const remaining = o => (new Date(o.supplier_sent_at).getTime()+20*36e5-Date.now())/36e5;
  const urgency = () => showOrders().filter(o=>orderStatus(o)!=='coletado' && o.supplier_sent_at && remaining(o)<=4).sort((a,b)=>remaining(a)-remaining(b));
  const paidOrders = arr=>arr.filter(o=>o.paid);
  const total = arr=>arr.reduce((s,o)=>s+(+o.amount||0),0);

  function seed(){
    const clients=['Ana Souza','Carlos Lima','Mariana Silva','Rafael Santos','Jéssica Alves','Lucas Pereira','Beatriz Costa','Fernanda Rocha'].map((name,i)=>({id:id(),name,tag:['#ABC123XYZ','#BCE234KLM','#CDD345NOP','#DEF456QRS','#EFG567TUV','#FGH678WXY','#GHI789ZA1','#HIJ890BC2'][i],phone:'',active:i!==6,notes:'Cliente de demonstração',created_at:ago(24*(17-i*2))}));
    const purchases=[{id:id(),name:'Compra conjunta — Outubro A',kind:'conjunta',status:'andamento',notes:'Lote para kits mensais.',created_at:ago(24*12)},{id:id(),name:'Compra conjunta — Outubro B',kind:'conjunta',status:'aberta',notes:'Novos participantes.',created_at:ago(24*4)},{id:id(),name:'Pedidos individuais',kind:'individual',status:'andamento',notes:'Compras individuais do mês.',created_at:ago(24*14)}];
    const defs=[
      [0,0,'Celeiro',30,1,true,'solicitado',2], [1,0,'Silo',30,1,true,'solicitado',17], [2,0,'Terreno',10,2,true,'coletado',29],
      [3,1,'Celeiro',5,1,false,'pendente',null], [4,1,'Silo',20,1,true,'solicitado',19], [5,1,'Terreno',30,1,false,'pendente',null],
      [6,2,'Silo',5,1,true,'coletado',38],[7,2,'Celeiro',20,1,true,'solicitado',10], [0,2,'Terreno',5,2,true,'coletado',32],
      [1,0,'Celeiro',10,1,false,'pendente',null],[2,1,'Terreno',30,1,true,'solicitado',21], [3,2,'Silo',30,1,true,'coletado',40]
    ];
    const orders=defs.map(([c,p,item,duration,quantity,paid,delivery_status,h],i)=>({id:id(),client_id:clients[c].id,purchase_id:purchases[p].id,item,duration,quantity,amount:PRICE[item][duration]*quantity,paid,delivery_status,supplier_sent_at:h===null?null:ago(h),collected_at:delivery_status==='coletado'?ago(Math.max(0,h-10)):null,notes:'',created_at:ago(24*(12-i*.7))}));
    return {clients,purchases,orders};
  }
  function persist(){if(!remote){try{localStorage.setItem(STORE_KEY,JSON.stringify(db));}catch{/* Navegadores que bloqueiam armazenamento local mantêm dados na sessão. */}}}
  function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.className='toast'+(error?' error':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,3800);}
  function roleText(){return remote?(isAdmin()?'Administrador':'Cliente'):(isAdmin()?'Administrador · demonstração':'Cliente · demonstração');}
  function showLogin(){ $('#app').hidden=true;$('#login-screen').hidden=false; }
  function showApp(){
    $('#login-screen').hidden=true;$('#app').hidden=false;
    const avatar = isAdmin()?'AD':(showClients()[0]?.name||'CL').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
    $('#side-avatar').textContent=avatar;$('#top-avatar').textContent=avatar;
    $('#side-name').textContent=remote?(profile?.display_name || session?.user?.email || 'Cliente'):(isAdmin()?'Administrador':showClients()[0]?.name||'Cliente');
    $('#side-role').textContent=roleText();$('#logout-side').hidden=!remote;
    $('#sync-pill').innerHTML=`<span class="online-dot"></span>${remote?'Dados sincronizados':'Modo demonstração'}`;
    $('#sync-pill').className='sync-pill'+(remote?'':' demo');
    $('#today-text').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'short'});
    render();
  }
  async function init(){
    setupEvents();
    if(!remote){ try{db=JSON.parse(localStorage.getItem(STORE_KEY)||'null')||seed();}catch{db=seed();} persist();showApp();return; }
    try{
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=res;s.onerror=()=>rej(Error('Não foi possível carregar a biblioteca Supabase.'));document.head.appendChild(s);});
      supa=window.supabase.createClient(CONFIG.supabaseUrl.trim(),CONFIG.supabaseAnonKey.trim(),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      const {data,error}=await supa.auth.getSession();if(error)throw error;
      session=data.session;if(session){await loadRemote();showApp();}else showLogin();
    }catch(e){showLogin();$('#login-error').textContent=`Erro de configuração: ${e.message}`;}
  }
  async function loadRemote(){
    const user = session?.user;if(!user)throw Error('É preciso entrar na sua conta.');
    const p=await supa.from('profiles').select('id,display_name,role,client_id').eq('id',user.id).single();if(p.error)throw Error('Perfil de usuário não encontrado. Confira o schema.sql e a criação da conta.');profile=p.data;
    const tables=await Promise.all(['clients','purchases','orders'].map(t=>supa.from(t).select('*').order('created_at',{ascending:false})));
    tables.forEach(r=>{if(r.error)throw Error(r.error.message);});
    db={clients:tables[0].data,purchases:tables[1].data,orders:tables[2].data};
  }
  async function mutate(table,method,record){
    if(!isAdmin())throw Error('Acesso permitido somente para administradores.');
    if(remote){let q=supa.from(table);let result;
      if(method==='insert') result=await q.insert(record).select();
      else if(method==='update')result=await q.update(record).eq('id',record.id).select();
      else result=await q.delete().eq('id',record.id).select();
      if(result.error)throw Error(result.error.message);
      await loadRemote();
    }else{
      if(method==='insert')db[table].unshift(record);
      if(method==='update'){const i=db[table].findIndex(x=>x.id===record.id);if(i>=0)db[table][i]={...db[table][i],...record};}
      if(method==='delete')db[table]=db[table].filter(x=>x.id!==record.id);
      persist();
    }
  }
  function statusPill(status){const opt={coletado:['Coletado','green'],solicitado:['Solicitado','blue'],expirado:['Prazo encerrado','red'],pendente:['Pendente','amber'],aberta:['Aberta','blue'],andamento:['Em andamento','amber'],finalizada:['Finalizada','green'],cancelada:['Cancelada','gray'],ativo:['Ativo','green'],inativo:['Inativo','gray']};const [label,color]=opt[status]||[status,'gray'];return `<span class="pill ${color}">${esc(label)}</span>`;}
  function pageHead(eyebrow,title,desc,buttons=''){return `<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div><div class="head-actions">${buttons}</div></div>`;}
  function canAddBtn(kind,label){return isAdmin()?`<button class="btn btn-primary" data-action="open" data-kind="${kind}">＋ ${label}</button>`:'';}
  function empty(title,desc){return `<div class="empty"><div class="empty-visual">☷</div><h3>${title}</h3><p>${desc}</p></div>`;}
  function rowActions(table,id){return isAdmin()?`<button class="table-action" data-action="edit" data-table="${table}" data-id="${attr(id)}">Editar</button><button class="table-action danger" data-action="delete" data-table="${table}" data-id="${attr(id)}">Excluir</button>`:'';}
  function dashboard(){
    const orders=showOrders(), clients=showClients(), late=urgency(), open=orders.filter(o=>orderStatus(o)!=='coletado'), moneyPaid=total(paidOrders(orders));
    const newest=[...orders].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
    const monthStats=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));return {month:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),n:total(orders.filter(o=>{const x=new Date(o.created_at);return x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear()&&o.paid;}))};});
    const max=Math.max(1,...monthStats.map(x=>x.n));
    return pageHead('SEU CENTRO DE CONTROLE',isAdmin()?'Visão geral':'Minha área','Acompanhe seus clientes, pedidos e prazos de forma centralizada.',isAdmin()?canAddBtn('order','Novo pedido'):'')+
      `<section class="dashboard-hero"><div class="hero-copy"><span class="eyebrow">✦ UNIDOS SEMPRE</span><h2>${isAdmin()?'Tudo organizado. Sempre juntos.':'Seus kits, sempre acompanhados.'}</h2><p>${isAdmin()?'Acompanhe compras conjuntas e individuais, verifique pagamentos e não perca nenhum prazo de coleta.':'Confira o andamento dos seus pedidos, pagamentos e solicitações enviadas pelo fornecedor.'}</p></div><div class="hero-symbol">❋</div></section>`+
      (late.length?`<div class="alert-strip">⚠ <span><strong>${late.length} ${late.length===1?'pedido exige':'pedidos exigem'} atenção.</strong> Há solicitações próximas ou além do limite de 20 horas. <button class="table-action" data-nav="monitor">Ver alertas →</button></span></div>`:'')+
      `<div class="stats-grid">${statCard('Clientes',clients.length,'♧','blue',isAdmin()?'Cadastrados no sistema':'Sua conta')}${statCard('Pedidos',orders.length,'▤','amber','Total registrado')}${statCard('Pendentes',open.length,'◷','red','Aguardando coleta')}${statCard('Valor pago',money(moneyPaid),'↗','green','Somatório de pedidos pagos')}</div>`+
      `<div class="grid-two"><section class="panel"><div class="panel-head"><h3>Pedidos recentes</h3><button class="table-action" data-nav="orders">Ver todos →</button></div><div class="table-scroll"><table class="table"><thead><tr><th>Cliente / Item</th><th>Valor</th><th>Situação</th></tr></thead><tbody>${newest.length?newest.map(o=>`<tr><td><strong>${esc(clientName(o.client_id))}</strong><small>${esc(o.item)} · ${o.duration} dias</small></td><td>${money(o.amount)}</td><td>${statusPill(orderStatus(o))}</td></tr>`).join(''):`<tr><td colspan="3">${empty('Nenhum pedido','Os pedidos aparecerão aqui.')}</td></tr>`}</tbody></table></div></section>`+
      `<section class="panel"><div class="panel-head"><h3>Pagamentos por mês</h3><span class="chart-legend"><span class="legend-dot"></span> Pagos</span></div><div class="panel-body"><div class="chart-bars">${monthStats.map(x=>`<div class="bar-unit"><span class="bar-value">${x.n?money(x.n):'—'}</span><div class="bar" style="--bar-height:${Math.max(3,Math.round(x.n/max*124))}px"></div><span class="bar-month">${esc(x.month)}</span></div>`).join('')}</div></div></section></div>`;
  }
  function statCard(label,num,ic,color,foot){return `<section class="stat-card"><div class="stat-head"><span>${label}</span><span class="stat-icon ${color}">${ic}</span></div><div class="stat-num">${num}</div><div class="stat-foot">${foot}</div></section>`;}
  function filterSection(key,placeholder,extra=''){return `<div class="filters"><label class="field-search"><span>⌕</span><input aria-label="Pesquisar" data-filter="${key}" placeholder="${placeholder}" value="${attr(filters[key])}"></label>${extra}</div>`;}
  function clientsPage(){
    const q=filters.clients.toLowerCase();const arr=showClients().filter(c=>[c.name,c.tag,c.phone].some(x=>String(x||'').toLowerCase().includes(q)));
    return pageHead('CADASTRO E ORGANIZAÇÃO','Clientes','Organize contatos, tags de fazenda e situação de cada cliente.',canAddBtn('client','Novo cliente'))+
      filterSection('clients','Pesquisar nome, tag ou telefone...')+
      `<section class="panel"><div class="table-scroll"><table class="table"><thead><tr><th>Cliente</th><th>Tag Hay Day</th><th>Telefone</th><th>Status</th><th>Pedidos</th>${isAdmin()?'<th class="actions-col">Ações</th>':''}</tr></thead><tbody>${arr.length?arr.map(c=>`<tr><td><strong>${esc(c.name)}</strong><small>Desde ${dateBR(c.created_at)}</small></td><td><span class="tag">${esc(c.tag||'—')}</span></td><td>${esc(c.phone||'—')}</td><td>${statusPill(c.active?'ativo':'inativo')}</td><td>${showOrders().filter(o=>o.client_id===c.id).length}</td>${isAdmin()?`<td class="actions-col">${rowActions('clients',c.id)}</td>`:''}</tr>`).join(''):`<tr><td colspan="6">${empty('Nenhum cliente encontrado','Cadastre seu primeiro cliente ou ajuste sua busca.')}</td></tr>`}</tbody></table></div></section>`;
  }
  function purchasesPage(){
    const q=filters.purchases.toLowerCase();const arr=showPurchases().filter(p=>(p.name+' '+p.notes).toLowerCase().includes(q)&&(filters.kind==='todos'||p.kind===filters.kind));
    return pageHead('COMPRAS E LOTES','Compras','Separe compras conjuntas e individuais e acompanhe seus lotes.',canAddBtn('purchase','Nova compra'))+
      filterSection('purchases','Pesquisar compras...',`<select data-filter="kind" aria-label="Tipo de compra"><option value="todos">Todos os tipos</option><option value="conjunta" ${filters.kind==='conjunta'?'selected':''}>Compra conjunta</option><option value="individual" ${filters.kind==='individual'?'selected':''}>Compra individual</option></select>`)+
      `<section class="panel"><div class="table-scroll"><table class="table"><thead><tr><th>Compra / Lote</th><th>Modalidade</th><th>Status</th><th>Pedidos</th><th>Total</th>${isAdmin()?'<th class="actions-col">Ações</th>':''}</tr></thead><tbody>${arr.length?arr.map(p=>{const oo=showOrders().filter(o=>o.purchase_id===p.id);return `<tr><td><strong>${esc(p.name)}</strong><small>Aberta em ${dateBR(p.created_at)}</small></td><td>${p.kind==='conjunta'?'👥 Conjunta':'👤 Individual'}</td><td>${statusPill(p.status)}</td><td>${oo.length}</td><td><strong>${money(total(oo))}</strong></td>${isAdmin()?`<td class="actions-col">${rowActions('purchases',p.id)}</td>`:''}</tr>`;}).join(''):`<tr><td colspan="6">${empty('Nenhuma compra encontrada','Crie uma compra conjunta ou individual.')}</td></tr>`}</tbody></table></div></section>`;
  }
  function ordersPage(){
    const q=filters.orders.toLowerCase();const arr=showOrders().filter(o=>[clientName(o.client_id),o.item,purchaseName(o.purchase_id)].some(x=>x.toLowerCase().includes(q))&&(filters.status==='todos'||orderStatus(o)===filters.status));
    return pageHead('PEDIDOS E PAGAMENTOS','Pedidos','Controle kits, valores, solicitações do fornecedor e confirmações de coleta.',canAddBtn('order','Novo pedido'))+
      filterSection('orders','Buscar cliente, item ou compra...',`<select data-filter="status" aria-label="Status do pedido">${[['todos','Todos os status'],['pendente','Pendentes'],['solicitado','Solicitados'],['coletado','Coletados'],['expirado','Prazo encerrado']].map(([v,l])=>`<option value="${v}" ${filters.status===v?'selected':''}>${l}</option>`).join('')}</select>`)+
      `<section class="panel"><div class="table-scroll"><table class="table"><thead><tr><th>Cliente / Compra</th><th>Kit</th><th>Valor</th><th>Pagamento</th><th>Entrega</th><th>Prazo</th>${isAdmin()?'<th class="actions-col">Ações</th>':''}</tr></thead><tbody>${arr.length?arr.map(o=>`<tr><td><strong>${esc(clientName(o.client_id))}</strong><small>${esc(purchaseName(o.purchase_id))}</small></td><td><strong>${esc(o.item)}</strong><small>${o.duration} dias · ${o.quantity||1}x</small></td><td>${money(o.amount)}</td><td>${o.paid?statusPill('coletado').replace('Coletado','Pago'):`<span class="pill amber">Não pago</span>`}</td><td>${statusPill(orderStatus(o))}</td><td class="small-mono">${o.supplier_sent_at&&orderStatus(o)!=='coletado'?`<span class="${remaining(o)<=0?'text-red':remaining(o)<=4?'text-gold':''}">${formatRemain(o)}</span>`:o.collected_at?dateBR(o.collected_at):'—'}</td>${isAdmin()?`<td class="actions-col">${o.delivery_status!=='coletado'?`<button class="table-action" data-action="collect" data-id="${attr(o.id)}">Coletado ✓</button>`:''}${rowActions('orders',o.id)}</td>`:''}</tr>`).join(''):`<tr><td colspan="7">${empty('Nenhum pedido encontrado','Cadastre um pedido ou altere os filtros.')}</td></tr>`}</tbody></table></div></section>`;
  }
  function formatRemain(o){const hrs=remaining(o);if(hrs<=0)return 'Expirado';const h=Math.floor(hrs),m=Math.floor((hrs-h)*60);return `${h}h ${pad(m)}min`;}
  function monitorPage(){
    const arr=showOrders(),sent=arr.filter(o=>o.supplier_sent_at && orderStatus(o)!=='coletado'),late=sent.filter(o=>remaining(o)<=0),soon=sent.filter(o=>remaining(o)>0&&remaining(o)<=4),done=arr.filter(o=>orderStatus(o)==='coletado');
    const active=sent.sort((a,b)=>remaining(a)-remaining(b));
    return pageHead('ATENÇÃO AOS PRAZOS','Monitoramento','Acompanhe o prazo de 20 horas para coletar kits após o envio do fornecedor.',isAdmin()?canAddBtn('order','Novo pedido'):'')+
      `<div class="notice warn"><strong>Regra de coleta:</strong> após o envio da solicitação pelo fornecedor, o cliente tem até 20 horas para coletar o kit no Hay Day. O aviso é calculado automaticamente ao abrir o painel; a entrega dentro do jogo não acontece automaticamente.</div>`+
      `<div class="monitor-grid"><div class="monitor-box urgent"><h3>Prazo encerrado</h3><strong>${late.length}</strong><small>Solicitações acima de 20 horas</small></div><div class="monitor-box soon"><h3>Próximos do limite</h3><strong>${soon.length}</strong><small>4 horas ou menos restantes</small></div><div class="monitor-box done"><h3>Kits coletados</h3><strong>${done.length}</strong><small>Pedidos confirmados</small></div></div>`+
      `<section class="panel"><div class="panel-head"><h3>Solicitações em acompanhamento</h3><small>${active.length} aguardando coleta</small></div><div class="table-scroll"><table class="table"><thead><tr><th>Cliente / Kit</th><th>Enviado pelo fornecedor</th><th>Prazo restante</th><th>Situação</th>${isAdmin()?'<th class="actions-col">Ações</th>':''}</tr></thead><tbody>${active.length?active.map(o=>{const pct=Math.max(0,Math.min(100,remaining(o)/20*100));return `<tr><td><strong>${esc(clientName(o.client_id))}</strong><small>${esc(o.item)} · ${o.duration} dias</small></td><td>${datetimeBR(o.supplier_sent_at)}</td><td style="min-width:145px"><strong class="${remaining(o)<=0?'text-red':remaining(o)<=4?'text-gold':'text-green'}">${formatRemain(o)}</strong><div class="progress-track"><div class="progress-fill" style="--progress:${pct.toFixed(0)}%"></div></div></td><td>${statusPill(orderStatus(o))}</td>${isAdmin()?`<td class="actions-col"><button class="table-action" data-action="copy" data-id="${attr(o.id)}">Copiar aviso</button><button class="table-action" data-action="collect" data-id="${attr(o.id)}">Confirmar coleta</button></td>`:''}</tr>`;}).join(''):`<tr><td colspan="5">${empty('Nenhuma coleta pendente','As solicitações ativas aparecerão aqui.')}</td></tr>`}</tbody></table></div></section>`;
  }
  function settingsPage(){
    return pageHead('PREFERÊNCIAS E DADOS','Configurações','Exportação, tipo de acesso e informações do sistema.')+
      `<div class="notice ${remote?'':'warn'}"><strong>${remote?'Modo conectado ao Supabase':'Modo demonstração local'}</strong><br>${remote?'As informações vêm do banco Supabase e as permissões são verificadas no servidor por políticas RLS.':'Os dados deste exemplo ficam apenas no navegador atual. Não são sincronizados entre dispositivos. O seletor de perfil é uma simulação, não um login seguro.'}</div>`+
      `<section class="panel setting-card"><h3>Meu acesso</h3><div class="setting-line"><strong>Perfil</strong><span>${esc(roleText())}</span></div><div class="setting-line"><strong>Armazenamento</strong><span>${remote?'Supabase (compartilhado)':'Local no navegador'}</span></div>${remote?`<div class="setting-line"><strong>Conta</strong><span>${esc(session?.user?.email||'—')}</span></div>`:`<div class="setting-line"><strong>Trocar perfil demonstrativo</strong><select class="form-control" id="role-select"><option value="admin" ${demoRole==='admin'?'selected':''}>Administrador</option><option value="usuario" ${demoRole==='usuario'?'selected':''}>Usuário / cliente</option></select></div>`}</section>`+
      `<section class="panel setting-card"><h3>Backup e relatórios</h3><p>Exporte os dados visíveis para você. Os arquivos CSV podem ser abertos em Excel e Google Planilhas. O backup JSON do modo demonstração também pode ser importado.</p><div class="setting-actions"><button class="btn btn-secondary" data-action="exportcsv">↓ Exportar planilha CSV</button>${isAdmin()?`<button class="btn btn-secondary" data-action="backup">↓ Backup JSON</button>`:''}${!remote&&isAdmin()?`<label class="btn btn-secondary" for="restore-file">↑ Importar backup JSON</label><input id="restore-file" type="file" accept="application/json,.json" hidden>`:''}</div></section>`+
      (!remote&&isAdmin()?`<section class="panel setting-card"><h3>Reiniciar a demonstração</h3><p>Restaura os exemplos fictícios de clientes, compras e pedidos. Todos os registros locais editados serão substituídos.</p><button class="btn btn-danger" data-action="reset">Restaurar dados de demonstração</button></section>`:'')+
      `<section class="panel setting-card"><h3>Sobre o projeto</h3><p>Unidos Sempre — painel preparado para GitHub Pages. Sem bot do Telegram. O GitHub hospeda a interface; para uso real com vários usuários, configure o Supabase usando o arquivo <strong>schema.sql</strong> e o guia <strong>README.md</strong>.</p></section>`;
  }
  function render(){
    $('#crumb-current').textContent=names[page];
    document.querySelectorAll('[data-nav]').forEach(el=>{if(el.classList.contains('nav-link'))el.classList.toggle('active',el.dataset.nav===page);});
    const alerts=urgency().length;$('#alert-count').hidden=!alerts;$('#alert-count').textContent=alerts;
    $('#content').innerHTML=({dashboard,clients:clientsPage,purchases:purchasesPage,orders:ordersPage,monitor:monitorPage,settings:settingsPage})[page]();
  }
  function modalFields(kind,record){
    const v=(field,otherwise='')=>attr(record?.[field]??otherwise);
    const fld=(key,title,type='text',optional='')=>`<div class="form-group"><label for="m-${key}">${title}</label><input class="form-control" id="m-${key}" name="${key}" type="${type}" value="${v(key)}" ${optional}></div>`;
    const select=(key,title,options)=>`<div class="form-group"><label for="m-${key}">${title}</label><select class="form-control" id="m-${key}" name="${key}">${options.map(([value,label])=>`<option value="${attr(value)}" ${String(record?.[key]??'')===String(value)?'selected':''}>${esc(label)}</option>`).join('')}</select></div>`;
    const notes=`<div class="form-group full-col"><label for="m-notes">Observações</label><textarea class="form-control" id="m-notes" name="notes" placeholder="Informações adicionais">${esc(record?.notes||'')}</textarea></div>`;
    if(kind==='client')return fld('name','Nome do cliente','text','required maxlength="100"')+fld('tag','Tag Hay Day','text','placeholder="#ABC123" maxlength="30"')+fld('phone','Telefone / WhatsApp','tel','placeholder="(00) 90000-0000" maxlength="30"')+select('active','Situação',[[true,'Ativo'],[false,'Inativo']])+notes;
    if(kind==='purchase')return fld('name','Nome da compra / lote','text','required maxlength="100"')+select('kind','Modalidade',[['conjunta','Compra conjunta'],['individual','Compra individual']])+select('status','Situação',[['aberta','Aberta'],['andamento','Em andamento'],['finalizada','Finalizada'],['cancelada','Cancelada']])+notes;
    if(kind==='order'){
      const selClient=select('client_id','Cliente',db.clients.map(c=>[c.id,c.name]));
      const selPurchase=select('purchase_id','Compra vinculada',[['','Sem compra vinculada'],...db.purchases.map(p=>[p.id,p.name])]);
      const item=select('item','Tipo de kit',[['Celeiro','Celeiro'],['Silo','Silo'],['Terreno','Terreno']]);
      const duration=select('duration','Duração (dias)',[[5,'5 dias'],[10,'10 dias'],[20,'20 dias'],[30,'30 dias']]);
      const qty=fld('quantity','Quantidade','number','min="1" max="1000" required');
      const amount=fld('amount','Valor total (R$)','number','min="0" step="0.01" required');
      const paid=select('paid','Pagamento',[[false,'Aguardando pagamento'],[true,'Pago']]);
      const stat=select('delivery_status','Entrega',[['pendente','Pendente'],['solicitado','Solicitado ao fornecedor'],['coletado','Coletado']]);
      const sent=`<div class="form-group"><label for="m-supplier_sent_at">Solicitação enviada em</label><input class="form-control" id="m-supplier_sent_at" name="supplier_sent_at" type="datetime-local" value="${attr(record?.supplier_sent_at?inputDT(record.supplier_sent_at):'')}"><div class="form-hint">Inicia o prazo de 20 horas.</div></div>`;
      return selClient+selPurchase+item+duration+qty+amount+paid+stat+sent+notes;
    }
    return '';
  }
  function openModal(kind,record){
    if(!isAdmin()){toast('Acesso exclusivo do administrador.',true);return;}
    if(kind==='order'&&!db.clients.length){toast('Cadastre pelo menos um cliente antes de criar pedidos.',true);return;}
    const title=kind==='client'?'cliente':kind==='purchase'?'compra':'pedido';modalOpen=true;
    $('#modal-layer').hidden=false;
    $('#modal-layer').innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">${record?'Editar':'Novo'} ${title}</h2><p>Preencha os campos e salve as informações.</p></div><button class="modal-close" data-action="close" aria-label="Fechar">×</button></div><form id="record-form" data-kind="${kind}" data-id="${record?.id||''}"><div class="modal-fields">${modalFields(kind,record)}</div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-action="close">Cancelar</button><button class="btn btn-primary" type="submit">Salvar ${title}</button></div></form></div>`;
    if(kind==='order'){
      if(!record){$('#m-item').value='Celeiro';$('#m-duration').value='5';$('#m-quantity').value='1';$('#m-paid').value='false';$('#m-delivery_status').value='pendente';calcPrice();}
    }
    $('#modal-layer').querySelector('input,select,textarea')?.focus();
  }
  function closeModal(){modalOpen=false;$('#modal-layer').hidden=true;$('#modal-layer').innerHTML='';}
  function calcPrice(){const item=$('#m-item')?.value,duration=+$('#m-duration')?.value,quantity=+$('#m-quantity')?.value||1;const el=$('#m-amount');if(el&&PRICE[item]?.[duration]!=null)el.value=(PRICE[item][duration]*quantity).toFixed(2);}
  async function saveRecord(form){
    const kind=form.dataset.kind, table={client:'clients',purchase:'purchases',order:'orders'}[kind],recordId=form.dataset.id;
    const existing=recordId?db[table].find(x=>x.id===recordId):null;
    const x=Object.fromEntries(new FormData(form).entries());
    x.name=x.name?.trim();x.notes=x.notes?.trim()||'';
    if(kind==='client'){
      if(!x.name)throw Error('Informe o nome do cliente.');x.tag=(x.tag||'').trim().toUpperCase();x.phone=(x.phone||'').trim();x.active=x.active==='true';
    }else if(kind==='purchase'){
      if(!x.name)throw Error('Informe o nome da compra.');
    }else{
      if(!x.client_id||!db.clients.some(c=>c.id===x.client_id))throw Error('Selecione um cliente válido.');
      x.purchase_id=x.purchase_id||null;x.duration=Number(x.duration);x.quantity=Number(x.quantity);x.amount=Number(x.amount);x.paid=x.paid==='true';
      if(!Number.isFinite(x.amount)||x.amount<0||!Number.isInteger(x.quantity)||x.quantity<1)throw Error('Confira a quantidade e o valor.');
      x.supplier_sent_at=x.supplier_sent_at?new Date(x.supplier_sent_at).toISOString():null;
      x.collected_at=x.delivery_status==='coletado'?(existing?.collected_at||new Date().toISOString()):null;
    }
    const record={...x,...(recordId?{id:recordId}:{id:id(),created_at:new Date().toISOString()})};
    await mutate(table,recordId?'update':'insert',record);
    closeModal();render();toast(`${kind==='client'?'Cliente':kind==='purchase'?'Compra':'Pedido'} ${recordId?'atualizado':'cadastrado'} com sucesso.`);
  }
  function getSelected(table,id){return db[table]?.find(x=>x.id===id);}
  async function deleteRecord(table,record){
    if(table==='clients' && db.orders.some(o=>o.client_id===record.id))throw Error('Há pedidos vinculados a este cliente. Exclua os pedidos antes.');
    if(table==='purchases' && db.orders.some(o=>o.purchase_id===record.id))throw Error('Há pedidos vinculados a esta compra. Desvincule-os antes.');
    if(!confirm(`Excluir ${table==='orders'?'este pedido':`"${record.name}"`}? A operação não poderá ser desfeita.`))return;
    await mutate(table,'delete',{id:record.id});render();toast('Registro excluído.');
  }
  async function collect(idValue){const o=getSelected('orders',idValue);if(!o)return;await mutate('orders','update',{id:o.id,delivery_status:'coletado',collected_at:new Date().toISOString()});render();toast('Coleta confirmada com sucesso.');}
  async function copyNotice(o){const msg=`🌾 *UNIDOS SEMPRE — ATENÇÃO AO KIT*\n👤 Cliente: ${clientName(o.client_id)}\n📦 Kit: ${o.item} — ${o.duration} dias\n🕒 Solicitação enviada: ${datetimeBR(o.supplier_sent_at)}\n⏳ Prazo: até 20 horas após o envio.\n✅ Após coletar, avise no grupo: Coletado ✅`;
    try{await navigator.clipboard.writeText(msg);toast('Aviso copiado. Cole no WhatsApp.');}catch{const e=document.createElement('textarea');e.value=msg;document.body.appendChild(e);e.select();document.execCommand('copy');e.remove();toast('Aviso copiado.');}}
  function download(textData,name,type){const blob=new Blob([textData],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportCSV(){
    const rows=[['Tipo','ID','Nome/Cliente','Tag / Compra','Item / Modalidade','Dias','Quantidade','Valor R$','Pago','Situação','Data'],
      ...showClients().map(c=>['Cliente',c.id,c.name,c.tag,'','','','', '',c.active?'Ativo':'Inativo',c.created_at]),
      ...showPurchases().map(p=>['Compra',p.id,p.name,'',p.kind,'','','','',p.status,p.created_at]),
      ...showOrders().map(o=>['Pedido',o.id,clientName(o.client_id),purchaseName(o.purchase_id),o.item,o.duration,o.quantity,o.amount,o.paid?'Sim':'Não',orderStatus(o),o.created_at])];
    const sanitize=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    download('\uFEFF'+rows.map(row=>row.map(sanitize).join(';')).join('\r\n'),'unidos-sempre-relatorio.csv','text/csv;charset=utf-8');toast('Relatório CSV exportado.');
  }
  async function importBackup(file){const x=JSON.parse(await file.text());if(!x||!['clients','purchases','orders'].every(k=>Array.isArray(x[k])))throw Error('O arquivo não é um backup válido.');if(!confirm('Substituir todos os dados da demonstração pelo backup selecionado?'))return;db={clients:x.clients,purchases:x.purchases,orders:x.orders};persist();render();toast('Backup importado com sucesso.');}
  function navigate(next){if(!names[next])return;page=next;filters={clients:'',purchases:'',orders:'',monitor:'',kind:'todos',status:'todos'};render();$('#sidebar').classList.remove('open');$('#mobile-scrim').classList.remove('show');window.scrollTo({top:0,behavior:'smooth'});}
  function setupEvents(){
    $('#mobile-menu').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#mobile-scrim').classList.add('show');});
    $('#mobile-scrim').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#mobile-scrim').classList.remove('show');});
    $('#logout-side').addEventListener('click',async()=>{if(supa){await supa.auth.signOut();session=null;profile=null;showLogin();}});
    $('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();$('#login-error').textContent='';const b=$('#login-submit');b.disabled=true;b.textContent='Entrando...';try{
      const {data,error}=await supa.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});if(error)throw error;session=data.session;await loadRemote();showApp();$('#login-password').value='';
    }catch(e){$('#login-error').textContent='Não foi possível entrar: '+e.message;}finally{b.disabled=false;b.innerHTML='Entrar no painel <span>→</span>';}});
    document.addEventListener('click',async ev=>{
      const nav=ev.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
      const action=ev.target.closest('[data-action]');if(!action)return;
      const kind=action.dataset.kind,table=action.dataset.table,rid=action.dataset.id;
      try{
        switch(action.dataset.action){
          case 'open':openModal(kind);break;
          case 'edit':{const x=getSelected(table,rid);if(x)openModal({clients:'client',purchases:'purchase',orders:'order'}[table],x);break;}
          case 'close':closeModal();break;
          case 'delete':{const x=getSelected(table,rid);if(x)await deleteRecord(table,x);break;}
          case 'collect':await collect(rid);break;
          case 'copy':{const x=getSelected('orders',rid);if(x)await copyNotice(x);break;}
          case 'exportcsv':exportCSV();break;
          case 'backup':download(JSON.stringify(db,null,2),'unidos-sempre-backup.json','application/json');toast('Backup gerado.');break;
          case 'reset':if(confirm('Restaurar os dados fictícios originais?')){db=seed();persist();render();toast('Demonstração restaurada.');}break;
        }
      }catch(e){toast(e.message||'Ocorreu um erro.',true);}
    });
    document.addEventListener('input',ev=>{
      if(ev.target.matches('[data-filter]')){const f=ev.target.dataset.filter;filters[f]=ev.target.value;const pos=ev.target.selectionStart;render();const newEl=document.querySelector(`[data-filter="${f}"]`);newEl?.focus();if(newEl?.setSelectionRange&&typeof pos==='number')newEl.setSelectionRange(pos,pos);}
    });
    document.addEventListener('change',async ev=>{
      const el=ev.target;
      if(el.matches('select[data-filter]')){filters[el.dataset.filter]=el.value;render();}
      if(el.id==='role-select'&&!remote){demoRole=el.value;showApp();toast('Perfil demonstrativo alterado.');}
      if(['m-item','m-duration','m-quantity'].includes(el.id))calcPrice();
      if(el.id==='restore-file'&&el.files[0]){try{await importBackup(el.files[0]);}catch(e){toast(e.message,true);}}
    });
    document.addEventListener('submit',async ev=>{
      if(ev.target.id!=='record-form')return;ev.preventDefault();const button=ev.target.querySelector('[type="submit"]');button.disabled=true;
      try{await saveRecord(ev.target);}catch(e){toast('Não foi possível salvar: '+e.message,true);}finally{button.disabled=false;}
    });
    $('#modal-layer').addEventListener('click',ev=>{if(ev.target.id==='modal-layer')closeModal();});
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&modalOpen)closeModal();});
  }
  init();
})();
