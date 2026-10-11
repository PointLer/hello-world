'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let projects = [], activeId = null, rootFolder = null, lastFocus = null, toastTimer, viewVersion = 0;
let activeDocs = {}, editVersion = '', busy = false;
const labels = {next:'下一步', question:'待验证问题', insight:'关键洞见', risk:'风险 / 反例'};
const docNames = {readme:'README.md', notes:'notes.md', reading:'reading-list.md'};
const project = id => projects.find(p => p.id === id);
const cacheKey = (id, doc) => `research-archive:v2:${id}:${doc}`;

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500);
}
function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localSet(key, text) {
  try { localStorage.setItem(key, text); }
  catch { throw new Error('浏览器无法保存。请先导出内容，或连接项目文件夹。'); }
}
function seed(id, doc) {
  const p = project(id);
  if (doc === 'readme') return `# ${p.title}\n\n状态：${p.status}\n\n## 当前认识\n\n${p.readme}\n\n## 技术路线\n\n${p.route.map(s => '- '+s).join('\n')}\n\n## 原始材料\n\n${p.materials.map(([name,file]) => `- [${name}](../../My%20Papers/${encodeURIComponent(file)})`).join('\n')}\n\n> 初始内容依据现有材料整理，可继续修改。\n`;
  if (doc === 'reading') return '# 阅读清单\n\n';
  return `# ${p.title} / 研究笔记\n\n`;
}
async function directory(id, root = rootFolder) { return (await root.getDirectoryHandle('projects')).getDirectoryHandle(project(id).folder); }
async function readDoc(id, doc, root = rootFolder) {
  if (root) {
    try { const handle = await (await directory(id, root)).getFileHandle(docNames[doc]); return await (await handle.getFile()).text(); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
  } else {
    const cached = localGet(cacheKey(id, doc));
    if (cached !== null) return cached;
  }
  if (doc === 'readme') {
    const response = await fetch(`projects/${project(id).folder}/README.md`);
    if (!response.ok) throw new Error('README 读取失败，请刷新重试。');
    return response.text();
  }
  return seed(id, doc);
}
async function writeDoc(id, doc, text, root = rootFolder) {
  if (!root) { localSet(cacheKey(id, doc), text); return; }
  const handle = await (await directory(id, root)).getFileHandle(docNames[doc], {create:true});
  const stream = await handle.createWritable();
  try { await stream.write(text); await stream.close(); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
}
function destination() { return rootFolder ? '项目文件' : '当前浏览器'; }
async function guarded(action) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('#saveNote,#saveReadme,#readingForm button,#connectFolder,#askCodex,#pasteAnswer,#saveAiNote,#clearAi')];
  buttons.forEach(b => b.disabled = true);
  try { return await action(); }
  catch (error) { notify(error.message || '操作失败，内容仍保留在输入框中。'); }
  finally { busy = false; buttons.forEach(b => b.disabled = false); }
}
function renderCards() {
  $('projectGrid').innerHTML = projects.map(p => `<article class="project-card" data-index="${escapeHTML(p.index)}"><div class="card-top"><span class="card-index">${escapeHTML(p.index)} / ${escapeHTML(p.id.toUpperCase())}</span><span class="status">${escapeHTML(p.status)}</span></div><h2>${escapeHTML(p.title)}</h2><div class="en">${escapeHTML(p.en)}</div><p>${escapeHTML(p.summary)}</p><div class="card-footer"><div class="tags">${p.questions.slice(0,3).map(q=>`<span class="tag">${escapeHTML(q)}</span>`).join('')}</div><button class="open-btn" data-project="${escapeHTML(p.id)}" aria-label="打开${escapeHTML(p.title)}">进入项目 <span>→</span></button></div></article>`).join('');
  $('projectGrid').querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => openProject(button.dataset.project)));
}
async function openProject(id) {
  const p = project(id); if (!p) throw new Error('未知项目');
  if (!$('overlay').classList.contains('is-open')) lastFocus = document.activeElement;
  activeId = id; const version = ++viewVersion;
  $('panelEyebrow').textContent = `${p.index} / ${p.status}`;
  $('panelTitle').textContent = p.title; $('panelLede').textContent = p.summary;
  $('panelQuestions').innerHTML = p.questions.map(q=>`<span class="question">${escapeHTML(q)}</span>`).join('');
  $('panelRoute').innerHTML = p.route.map(r=>`<li>${escapeHTML(r)}</li>`).join('');
  $('panelMaterials').innerHTML = p.materials.map(([name,file,type])=>`<a class="material" href="My%20Papers/${encodeURIComponent(file)}" target="_blank" rel="noopener noreferrer"><span class="material-name">${escapeHTML(name)}</span><span class="material-type">${escapeHTML(type)} ↗</span></a>`).join('');
  $('noteInput').value = localGet(cacheKey(id,'draft')) || '';
  $('aiQuestion').value = ''; $('aiAnswer').value = ''; $('aiWindowState').textContent = '就绪'; $('aiStatus').textContent = rootFolder ? '已连接：回答可直接追加到项目 notes.md' : '未连接：问答暂存当前浏览器；连接文件夹后可写入 notes.md';
  $('readingForm').reset(); $('syncStatus').textContent = rootFolder ? '已连接：保存到项目文件' : '未连接：只保存到当前浏览器；点击右上角连接文件夹';
  $('panelReadme').textContent = '读取中…'; $('readingList').textContent = '读取中…'; $('noteStream').textContent = '读取中…';
  setEditing(false); $('overlay').classList.add('is-open'); $('overlay').setAttribute('aria-hidden','false');
  document.querySelector('.shell').inert = true; document.body.style.overflow = 'hidden'; $('panelClose').focus();
  if (location.hash !== '#project/'+id) history.replaceState(null,'','#project/'+id);
  try {
    const docs = Object.fromEntries(await Promise.all(Object.keys(docNames).map(async doc=>[doc,await readDoc(id,doc)])));
    if (version !== viewVersion) return;
    activeDocs = docs; renderDocs();
  } catch (error) { if (version === viewVersion) { $('panelReadme').textContent = '读取失败；请重新打开项目。'; notify(error.message); } }
}
function setEditing(editing) {
  $('panelReadme').hidden = editing; $('readmeEditor').hidden = !editing;
  $('editReadme').hidden = editing; $('saveReadme').hidden = !editing; $('cancelReadme').hidden = !editing;
}
function renderDocs() {
  $('panelReadme').textContent = activeDocs.readme;
  $('readingList').textContent = activeDocs.reading.trim() === '# 阅读清单' ? '还没有待阅读材料；可添加标题、主题或链接。' : activeDocs.reading;
  $('noteStream').replaceChildren();
  const pre = document.createElement('pre'); pre.className = 'markdown';
  pre.textContent = activeDocs.notes.trim() === seed(activeId,'notes').trim() ? '还没有记录。原始想法会原样保留。' : activeDocs.notes;
  $('noteStream').append(pre);
  renderAiThread();
}
const aiKey = id => cacheKey(id, 'ai-chat');
function getAiChat(id) { try { return JSON.parse(localGet(aiKey(id)) || '[]'); } catch { return []; } }
function saveAiChat(id, chat) { localSet(aiKey(id), JSON.stringify(chat.slice(-24))); }
function renderAiThread() {
  const thread = $('aiThread'); if (!thread || !activeId) return;
  const chat = getAiChat(activeId); thread.replaceChildren();
  if (!chat.length) { const empty = document.createElement('div'); empty.className = 'ai-empty'; empty.textContent = '还没有对话。先写一个问题，再交给当前 Codex 任务。'; thread.append(empty); return; }
  for (const item of chat) {
    const box = document.createElement('div'); box.className = `ai-message ${item.role === 'assistant' ? 'assistant' : 'user'}`;
    const label = document.createElement('div'); label.className = 'ai-message-label'; label.textContent = item.role === 'assistant' ? 'CODEX / ANSWER' : 'YOU / QUESTION';
    const body = document.createElement('p'); body.textContent = item.text; box.append(label, body); thread.append(box);
  }
  thread.scrollTop = thread.scrollHeight;
}
function buildCodexPrompt(question) {
  const p = project(activeId);
  const notes = (activeDocs.notes || '').slice(-6000);
  const readme = (activeDocs.readme || '').slice(0, 6000);
  return `你是我的研究助理。请在当前 Codex 任务中回答下面的问题，不要编造实验结果。\n\n项目：${p.title}\n项目目录：projects/${p.folder}/\n\nREADME：\n${readme}\n\n已有笔记（末尾）：\n${notes}\n\n我的问题：\n${question}\n\n请先给出直接回答，再列出需要验证的假设和一个可执行的下一步。回答保持研究笔记风格，必要时保留不确定性。`;
}
function closeProject() {
  if (busy) { notify('正在保存，请稍候。'); return; }
  if (!$('readmeEditor').hidden) { notify('请先保存或取消 README 编辑。'); return; }
  ++viewVersion; $('overlay').classList.remove('is-open'); $('overlay').setAttribute('aria-hidden','true');
  document.querySelector('.shell').inert = false; document.body.style.overflow = ''; activeId = null;
  history.replaceState(null,'','#work'); lastFocus?.focus();
}
async function appendNote(id, tone, text) {
  if (!project(id) || !Object.hasOwn(labels,tone) || typeof text !== 'string' || !text.trim()) throw new Error('请选择有效项目、记录类型，并输入想法。');
  const root = rootFolder;
  const existing = await readDoc(id,'notes',root);
  const entry = `## ${labels[tone]} · ${new Date().toLocaleString('zh-CN',{hour12:false})}\n\n状态：原始记录，待润色\n\n${text.trim()}\n`;
  const next = existing.trimEnd()+'\n\n'+entry;
  await writeDoc(id,'notes',next,root);
  if (activeId === id) { activeDocs.notes = next; renderDocs(); }
  return {project:id,saved:true,destination:root?'project-file':'browser',polished:false};
}
function download(filename,text) {
  const url = URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

$('panelClose').addEventListener('click',closeProject);
$('overlay').addEventListener('click',event=>{if(event.target===$('overlay')) closeProject();});
document.addEventListener('keydown',event=>{
  if (!activeId) return;
  if (event.key === 'Escape') closeProject();
  if (event.key === 'Tab') {
    const focusable = [...$('overlay').querySelectorAll('a,button,input,textarea,select')].filter(e=>!e.disabled && e.getClientRects().length);
    const first=focusable[0], last=focusable.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});
  $('noteInput').addEventListener('input',()=>{if(activeId) {try{localSet(cacheKey(activeId,'draft'),$('noteInput').value);}catch(error){notify(error.message);}}});
$('saveNote').addEventListener('click',()=>guarded(async()=>{
  const id=activeId, text=$('noteInput').value, tone=$('noteTone').value;
  await appendNote(id,tone,text);
  localSet(cacheKey(id,'lastIdea'),text); localSet(cacheKey(id,'draft'),'');
  if(activeId===id){$('noteInput').value='';$('syncStatus').textContent=rootFolder?'已写入项目 notes.md；可继续复制给 Codex 润色。':'未连接项目文件夹：原始想法已保存到当前浏览器。连接文件夹后才会写入 notes.md。';}
  notify(rootFolder?'已保存到项目文件':'已保存到当前浏览器；连接文件夹后才会写入 notes.md');
}));
$('copyToCodex').addEventListener('click',async()=>{
  const p=project(activeId), text=$('noteInput').value.trim() || localGet(cacheKey(activeId,'lastIdea'));
  if(!text){notify('请先输入想法，或保存一条记录。');$('noteInput').focus();return;}
  const prompt=`请润色并归档以下研究想法。\n项目：${p.title}\n项目 README：projects/${p.folder}/README.md\n目标文件：projects/${p.folder}/notes.md\n\n原始想法：\n${text}\n\n请先读取该项目 README 和现有 notes.md，保留原始判断和不确定性，不编造实验结果。将润色后的版本追加到 notes.md，保留原始记录，并在当前任务回复整理结果。`;
  try { await navigator.clipboard.writeText(prompt); notify('已复制。粘贴到当前 Codex 任务并发送，即可润色归档。'); }
  catch { download(`${p.folder}-给Codex.md`,prompt); notify('剪贴板不可用，已导出可发送给 Codex 的内容。'); }
});
$('askCodex').addEventListener('click',()=>guarded(async()=>{
  const question = $('aiQuestion').value.trim();
  if (!question) { $('aiQuestion').focus(); throw new Error('请先写下问题。'); }
  const prompt = buildCodexPrompt(question);
  try { await navigator.clipboard.writeText(prompt); }
  catch { download(`${project(activeId).folder}-codex-question.md`, prompt); }
  const chat = getAiChat(activeId); chat.push({role:'user', text:question, time:Date.now()}); saveAiChat(activeId, chat); renderAiThread();
  $('aiWindowState').textContent = '已复制问题'; $('aiStatus').textContent = '问题已带上 README 和最近笔记。切到当前 Codex 任务粘贴并发送。';
  notify('问题已复制给 Codex；回答后回到这里粘贴。');
}));
$('pasteAnswer').addEventListener('click',async()=>guarded(async()=>{
  let answer='';
  try { answer = await navigator.clipboard.readText(); }
  catch { throw new Error('浏览器未授权读取剪贴板，请手动粘贴到“Codex 回答”框。'); }
  if (!answer.trim()) throw new Error('剪贴板没有文字。');
  $('aiAnswer').value = answer; $('aiWindowState').textContent = '已接收回答'; $('aiStatus').textContent = '检查回答后，点击“把问答写入 notes.md”。';
}));
$('saveAiNote').addEventListener('click',()=>guarded(async()=>{
  const question=$('aiQuestion').value.trim(), answer=$('aiAnswer').value.trim();
  if (!question || !answer) throw new Error('请先填写问题和 Codex 回答。');
  const existing=await readDoc(activeId,'notes');
  const stamp=new Date().toLocaleString('zh-CN',{hour12:false});
  const entry=`## Codex 讨论 · ${stamp}\n\n**问题**\n\n${question}\n\n**回答**\n\n${answer}\n`;
  const next=existing.trimEnd()+'\n\n'+entry; await writeDoc(activeId,'notes',next); activeDocs.notes=next;
  const chat=getAiChat(activeId); chat.push({role:'assistant',text:answer,time:Date.now()}); saveAiChat(activeId,chat); renderDocs();
  $('aiQuestion').value=''; $('aiAnswer').value=''; $('aiWindowState').textContent='已写入笔记'; $('aiStatus').textContent=rootFolder?'问答已追加到项目 notes.md。':'问答已保存到当前浏览器；连接文件夹后才会写入磁盘。';
  notify(rootFolder?'Codex 问答已写入 notes.md':'Codex 问答已保存到当前浏览器');
}));
$('clearAi').addEventListener('click',()=>{ $('aiQuestion').value=''; $('aiAnswer').value=''; $('aiWindowState').textContent='就绪'; $('aiStatus').textContent='当前输入已清空；历史对话仍保留在窗口中。'; });
$('editReadme').addEventListener('click',()=>{editVersion=activeDocs.readme;$('readmeEditor').value=activeDocs.readme;setEditing(true);$('readmeEditor').focus();});
$('cancelReadme').addEventListener('click',()=>setEditing(false));
$('saveReadme').addEventListener('click',()=>guarded(async()=>{
  const id=activeId,text=$('readmeEditor').value;
  if(!text.trim())throw new Error('README 不能为空。');
  if(await readDoc(id,'readme')!==editVersion)throw new Error('README 已在别处修改。请复制当前编辑内容，再取消编辑并重新打开项目。');
  await writeDoc(id,'readme',text);
  if(activeId===id){activeDocs.readme=text;setEditing(false);renderDocs();}
  notify(`README 已写入${destination()}`);
}));
$('readingForm').addEventListener('submit',event=>{
  event.preventDefault();guarded(async()=>{
    const id=activeId,title=$('readingTitle').value.trim(),raw=$('readingUrl').value.trim();
    if(!title)throw new Error('请填写标题。');
    let url=''; if(raw){const parsed=new URL(raw);if(!['https:','http:'].includes(parsed.protocol))throw new Error('阅读链接只支持 http 或 https。');url=parsed.href;}
    const existing=await readDoc(id,'reading');
    const safeTitle=title.replace(/[\r\n]/g,' ').replace(/[\[\]\\]/g,'\\$&');
    const next=existing.trimEnd()+`\n\n- [ ] ${safeTitle}${url?' — '+url:''}\n`;
    await writeDoc(id,'reading',next);
    if(activeId===id){activeDocs.reading=next;renderDocs();$('readingForm').reset();}
    notify(`已加入${destination()}的阅读清单`);
  });
});
for(const [button,doc] of [['exportReadme','readme'],['exportNotes','notes'],['exportReading','reading']])
  $(button).addEventListener('click',()=>guarded(async()=>download(`${project(activeId).folder}-${docNames[doc]}`,await readDoc(activeId,doc))));
$('connectFolder').addEventListener('click',()=>guarded(async()=>{
  if(rootFolder){rootFolder=null;$('connectionState').textContent='当前浏览器';$('connectFolder').textContent='连接项目文件夹';if(activeId)await openProject(activeId);notify('已切回浏览器记录；本地文件保持原样。');return;}
  if(!window.showDirectoryPicker)throw new Error('此浏览器不支持连接文件夹。请使用桌面 Edge / Chrome，或导出 Markdown。');
  if(activeId && !$('readmeEditor').hidden)throw new Error('请先保存或取消 README 编辑。');
  let selected;
  try {selected=await window.showDirectoryPicker({mode:'readwrite'});} catch(error){if(error.name==='AbortError')return;throw error;}
  try {
    const parent=await selected.getDirectoryHandle('projects');
    for(const p of projects) await (await parent.getDirectoryHandle(p.folder)).getFileHandle('README.md');
  }catch{throw new Error('请选择网站根文件夹，其中应含 projects 及四个项目 README。');}
  rootFolder=selected;$('connectionState').textContent='本地文件已连接';$('connectFolder').textContent='断开文件夹';
  if(activeId)await openProject(activeId);
  notify('已连接。现在读取、编辑项目文件；未连接时的浏览器记录仍保留，可断开后导出。');
}));
window.addEventListener('beforeunload',event=>{if(busy || (!$('readmeEditor').hidden && $('readmeEditor').value!==editVersion)){event.preventDefault();event.returnValue='';}});

async function init() {
  const response=await fetch('projects.json'); if(!response.ok)throw new Error('项目配置加载失败，请通过本地服务器或网站地址打开。');
  projects=await response.json();renderCards();
  if(location.hash.startsWith('#project/'))await openProject(decodeURIComponent(location.hash.slice(9)));
  if(document.modelContext?.registerTool)try{
    await document.modelContext.registerTool({name:'save_project_note',title:'保存项目原始想法',description:'Save original text to a project notes.md when a local folder is connected, otherwise to this browser. Does not perform AI polishing.',inputSchema:{type:'object',properties:{project:{type:'string',enum:projects.map(p=>p.id)},tone:{type:'string',enum:Object.keys(labels)},text:{type:'string',minLength:1}},required:['project','tone','text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){
      if(!project(input.project)||!Object.hasOwn(labels,input.tone)||typeof input.text!=='string'||!input.text.trim())throw new Error('Invalid project note');
      if(busy)throw new Error('Save in progress');
      busy=true;try{await openProject(input.project);return await appendNote(input.project,input.tone,input.text);}finally{busy=false;}
    }});
  }catch(error){console.warn('Optional WebMCP registration unavailable',error);}
}
init().catch(error=>{$('projectGrid').textContent=error.message;notify(error.message);});
