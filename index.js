(() => {
'use strict';
const ID='visualizer', C=()=>SillyTavern.getContext();
const defaults=()=>({title:'Визуализатор', enabled:true, together:true, write:true, hide:true, html:'', endpoint:'', model:'', provider:'active', fields:[
{id:'scene',name:'Мгновение из истории',tag:'СЦЕНА',item:'',mode:'fresh',on:true,prompt:'Describe only the final visible moment in 1–2 Russian sentences. Include current location, lighting, each present character’s latest pose, physical position, visible expression and interaction. Never summarize earlier actions or infer thoughts.'},
{id:'wear',name:'Гардероб',tag:'ГАРДЕРОБ',item:'ОДЕЖДА',mode:'persist',on:true,prompt:'One full English outfit per physically present character, including persona. Preserve established clothes, footwear, accessories and visible damage or dirt until an actual change. Leave unknown outfits empty. Never invent clothing. Use established Russian nominative names.'},
{id:'npc',name:'НПС',tag:'ВНЕШНОСТЬ',item:'ВНЕШНОСТЬ',mode:'event',on:true,prompt:'Register only eligible secondary NPCs with new or corrected permanent visual facts. Exclude primary characters and anyone with an independent appearance profile. Never duplicate aliases or unchanged records. English visual tags, Russian nominative name. For canon use 1boy/1girl Name (Fandom), tags; original use 1boy/1girl original character, tags. Exclude clothes and temporary state. Omit block if no update.'}]});
const clone=x=>JSON.parse(JSON.stringify(x));
function store(){const c=C();return c.extensionSettings[ID]??={profiles:{default:defaults()}}}
function meta(){return C().chatMetadata[ID]??={profile:'default',collapsed:false}}
function enabled(){return meta().enabled!==false}
function profile(){const profiles=store().profiles;if(!Object.hasOwn(profiles,meta().profile)){meta().profile='default';C().saveMetadata?.()}return profiles[meta().profile]??profiles.default}
const save=()=>{C().saveSettingsDebounced?.(); C().saveMetadata?.()};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const rx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const scope=()=>String(C().groupId??C().characterId)+'|'+String(C().getCurrentChatId?.()??'');
let running=false, busy=false, controller=null, scheduled=false;
const selected=new Map();
const cached=new WeakMap();
function parse(text,p){let out={};for(const f of p.fields){if(!f.item){const m=new RegExp('^⟦'+rx(f.tag)+'⟧[ \\t]*(.*)$','m').exec(text);if(m)out[f.id]=m[1];continue}const b=new RegExp('^⟦'+rx(f.tag)+'⟧[ \\t]*\\r?\\n([\\s\\S]*?)^⟦/'+rx(f.tag)+'⟧[ \\t]*$','m').exec(text);if(b){out[f.id]=Object.fromEntries([...b[1].matchAll(new RegExp('^⟦'+rx(f.item)+':([^⟧\\r\\n]+)⟧[ \\t]*(.*)$','gm'))].map(m=>[m[1].trim(),m[2]]));}}return out}
function strip(text,p){for(const f of p.fields){const pattern=f.item?'^⟦'+rx(f.tag)+'⟧[ \\t]*\\r?\\n[\\s\\S]*?^⟦/'+rx(f.tag)+'⟧[ \\t]*$':'^⟦'+rx(f.tag)+'⟧[^\\r\\n]*$';text=text.replace(new RegExp(pattern,'gm'),'')}return text.trimEnd()}
function snapshot(end,p){const state={};for(let i=0;i<=end;i++){const m=C().chat[i];if(!m||m.is_user||m.is_system)continue;const signature=JSON.stringify(p.fields.map(f=>[f.id,f.tag,f.item]));let entry=cached.get(m);if(!entry||entry.text!==m.mes||entry.signature!==signature){entry={text:m.mes,signature,data:parse(m.mes,p)};cached.set(m,entry)}const data=entry.data;for(const f of p.fields){if(data[f.id]===undefined)continue;state[f.id]=f.mode==='event'?{...state[f.id],...data[f.id]}:data[f.id]}}return state}
function instruction(p,prev){return 'VISUAL METADATA ONLY. Do not advance the story or invent visual facts. At the end of the response output the following enabled fields using exact delimiters, no markdown. Prior confirmed visual state: '+JSON.stringify(prev)+'\n'+p.fields.filter(f=>f.on).map(f=>f.prompt+'\nFormat: '+(f.item?'⟦'+f.tag+'⟧\n⟦'+f.item+':Name⟧ value\n⟦/'+f.tag+'⟧':'⟦'+f.tag+'⟧ value')+(f.mode==='event'?' (omit if no changes)':' (full current snapshot)')).join('\n\n')}
function inject(){const c=C(),p=profile();c.setExtensionPrompt?.(ID,enabled()&&p.provider==='active'&&p.together&&p.write?instruction(p,snapshot(c.chat.length-1,p)):'',1,0,false)}
function button(s,fn){const b=document.createElement('button');b.type='button';b.textContent=s;b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();try{fn(e)}catch(err){console.error('[Visualizer]',err);window.toastr?.error?.(String(err.message??err))}});return b}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function customHtml(html,title,state,i,p){
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox','allow-same-origin');
    frame.title=title;
    frame.style.cssText='display:block;width:100%;height:1px;border:0';
    const template=document.createElement('template');
    template.innerHTML=html.replace(/\{\{title\}\}/g,()=>esc(title)).replace(/\{\{(\w+)\}\}/g,(_,k)=>esc(typeof state[k]==='string'?state[k]:JSON.stringify(state[k]??'')));
    // No scripts, network resources, inline event handlers or navigations.
    for(const e of template.content.querySelectorAll('script,iframe,object,embed,link,meta,base,form,svg,math,img,audio,video,source'))e.remove();
    for(const e of template.content.querySelectorAll('*')){
        for(const attr of [...e.attributes]){
            if(/^on/i.test(attr.name)||/^(src|srcset|href|action|formaction|ping|poster|background|srcdoc|xlink:href)$/i.test(attr.name))e.removeAttribute(attr.name);
        }
    }
    const bindings=[];
    for(const slot of template.content.querySelectorAll('[data-vz-field]')){
        const f=p.fields.find(x=>x.id===slot.dataset.vzField&&x.on);
        slot.replaceChildren();
        if(!f){slot.hidden=true;continue}
        const entries=f.item?Object.entries(state[f.id]??{}):[[null,state[f.id]]];
        const key=scope()+'|'+i+'|html|'+f.id;
        const make=(name,value)=>{
            const panel=node('div','vz-html-panel');
            const head=node('div','vz-html-person');
            head.append(node('span','',name??f.name));
            const edit=node('button','vz-html-edit','✎');edit.type='button';edit.title='Редактировать';edit.setAttribute('aria-label','Редактировать '+(name??f.name));
            head.append(edit);panel.append(head,node('p','vz-html-value',value||'Нет установленных сведений'));
            bindings.push([edit,()=>editField(i,f,state,name??undefined)]);
            return panel;
        };
        if(f.item&&entries.length){
            const tabs=node('div','vz-html-tabs'),panels=node('div','vz-html-panels');
            const choices=[];
            let current=selected.get(key)?.name;
            if(!entries.some(([n])=>n===current))current=entries[0][0];
            const activate=name=>{
                selected.set(key,{name});
                for(const [n,tab,panel] of choices){tab.setAttribute('aria-selected',String(n===name));panel.hidden=n!==name}
            };
            for(const [name,value] of entries){
                const tab=node('button','vz-html-tab',name);tab.type='button';const panel=make(name,value);
                tabs.append(tab);panels.append(panel);choices.push([name,tab,panel]);bindings.push([tab,()=>activate(name)]);
            }
            activate(current);slot.append(tabs,panels);
        }else slot.append(make(null,entries[0]?.[1]));
    }
    // Attach behavior from the trusted parent only; imported scripts never run.
    const callbacks=bindings.map(([el,fn],index)=>{el.dataset.vzAction=String(index);return fn});
    const wrapper=document.createElement('div');wrapper.append(template.content);
    const csp="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"></head><body style="margin:0">'+wrapper.innerHTML+'</body></html>';
    frame.addEventListener('load',()=>{
        const doc=frame.contentDocument;if(!doc||!frame.isConnected)return;
        const resize=()=>{if(frame.isConnected)frame.style.height=Math.max(1,doc.body.scrollHeight)+'px'};
        doc.addEventListener('click',e=>{const target=e.target.closest('[data-vz-action]');if(target){e.preventDefault();callbacks[Number(target.dataset.vzAction)]?.();resize()}});
        // Rebind tab activation to the live document instead of the detached template.
        for(const slot of doc.querySelectorAll('[data-vz-field]')){
            const tabs=[...slot.querySelectorAll('.vz-html-tab')],panels=[...slot.querySelectorAll('.vz-html-panel')];
            tabs.forEach((tab,index)=>tab.addEventListener('click',e=>{
                e.stopPropagation();
                selected.set(scope()+'|'+i+'|html|'+slot.dataset.vzField,{name:tab.textContent});
                tabs.forEach((t,j)=>{t.setAttribute('aria-selected',String(index===j));panels[j].hidden=index!==j});
                resize();
            }));
        }
        doc.addEventListener('toggle',resize,true);
        const observer=new ResizeObserver(()=>{if(!frame.isConnected){observer.disconnect();return}resize()});
        observer.observe(doc.body);resize();
    },{once:true});
    return frame;
}
function iconButton(icon,label,action){
    const b=button('',action);
    b.className='vz-icon';
    b.title=label;
    b.setAttribute('aria-label',label);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','1.6');
    svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');
    svg.setAttribute('aria-hidden','true');
    const paths={
        chevron:'M9 5l7 7-7 7',
        settings:'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M9.4 3.5h5.2l.7 2.4 2.2 1.3 2.4-.6 2.6 4.5-1.7 1.8v2.5l1.7 1.8-2.6 4.5-2.4-.6-2.2 1.3-.7 2.4H9.4l-.7-2.4-2.2-1.3-2.4.6-2.6-4.5 1.7-1.8v-2.5L1.5 11l2.6-4.5 2.4.6 2.2-1.3z',
        pencil:'M14.5 5.5l4 4M4 20l4.5-1 12-12a1.4 1.4 0 0 0 0-2l-2.5-2.5a1.4 1.4 0 0 0-2 0l-12 12L4 20z',
        sliders:'M4 7h16M4 17h16M9 4v6M15 14v6'
    };
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',paths[icon]??paths.sliders);
    svg.append(path);
    b.append(svg);
    return b;
}
function choice(label,active,action){
    const b=button(label,action);
    b.className='vz-choice';
    b.setAttribute('aria-pressed',String(active));
    return b;
}
function buildCard(root,i,p,state){
    root.replaceChildren();
    const collapsed=!!meta().collapsed;
    root.classList.toggle('vz-collapsed',collapsed);
    const head=node('header','vz-card-head');
    const toggle=button('',()=>{
        meta().collapsed=!meta().collapsed;
        save();
        for(const card of document.querySelectorAll('.vz-root')){
            const index=Number(card.dataset.vzMessage);
            buildCard(card,index,p,snapshot(index,p));
        }
    });
    toggle.className='vz-collapse';
    toggle.setAttribute('aria-expanded',String(!collapsed));
    const chevron=iconButton('chevron','',()=>{}).firstElementChild;
    chevron.classList.add('vz-chevron');
    toggle.append(chevron,node('span','vz-title',p.title||'Визуализатор'));
    const gear=iconButton('sliders','Настройки визуализатора',settings);
    head.append(toggle,gear);
    root.append(head);
    if(collapsed)return;
    const content=node('div','vz-content');
    if(p.html){
        content.append(customHtml(p.html,p.title,state,i,p));
        if(!p.html.includes('data-vz-field')){
            const edits=node('div','vz-chips');
            for(const f of p.fields.filter(x=>x.on)){
                const names=f.item?Object.keys(state[f.id]??{}):[];
                if(names.length){for(const name of names)edits.append(button('✎ '+f.name+' · '+name,()=>editField(i,f,state,name)))}
                else edits.append(button('✎ '+f.name,()=>editField(i,f,state)));
            }
            content.append(edits);
        }
    }else{
        const scene=p.fields.find(f=>f.id==='scene'&&f.on);
        if(scene){
            const section=node('section','vz-scene-section');
            section.append(fieldHeading(scene.name,()=>editField(i,scene,state)),node('p','vz-scene',state[scene.id]??'—'));
            content.append(section);
        }
        const fields=p.fields.filter(f=>f.on&&f.id!=='scene');
        if(fields.length){
            const section=node('section','vz-fields-section');
            const key=scope()+'|'+i;
            const sel=selected.get(key)??{};
            const field=fields.find(f=>f.id===sel.field)??fields[0];
            const tabs=node('div','vz-tabs');
            for(const f of fields){
                tabs.append(choice(f.name,f===field,()=>{
                    selected.set(key,{field:f.id});
                    buildCard(root,i,p,state);
                }));
            }
            section.append(tabs);
            const detail=node('div','vz-detail');
            const val=state[field.id];
            if(field.item){
                const names=Object.keys(val??{});
                const name=names.includes(sel.name)?sel.name:names[0];
                if(names.length){
                    const chips=node('div','vz-chips');
                    for(const n of names){
                        chips.append(choice(n,n===name,()=>{
                            selected.set(key,{field:field.id,name:n});
                            buildCard(root,i,p,state);
                        }));
                    }
                    detail.append(chips);
                }
                detail.append(fieldHeading(name??field.name,()=>editField(i,field,state,name)),
                    node('div','vz-value',val?.[name]||'Нет установленных сведений'));
            }else{
                detail.append(fieldHeading(field.name,()=>editField(i,field,state)),
                    node('div','vz-value',val||'Нет установленных сведений'));
            }
            section.append(detail);
            content.append(section);
        }
    }
    root.append(content);
}
function render(){
    const c=C(),p=profile();
    document.querySelectorAll('.vz-root').forEach(e=>e.remove());
    if(!enabled())return;
    const messages=c.chat;
    const start=Math.max(0,messages.length-10);
    if(p.hide){
        for(const b of document.querySelectorAll('#chat .mes_text'))hideMarkers(b,p);
    }
    for(let i=start;i<messages.length;i++){
        const m=messages[i];
        if(m.is_user||m.is_system)continue;
        const body=document.querySelector('.mes[mesid="'+i+'"] .mes_text');
        if(!body||!Object.keys(parse(m.mes,p)).length)continue;
        const root=node('section','vz-root');
        root.dataset.vzMessage=String(i);
        buildCard(root,i,p,snapshot(i,p));
        body.append(root);
    }
}
function hideMarkers(body,p){const tags=new Set(p.fields.flatMap(f=>[f.tag,f.item]).filter(Boolean));const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);const groups=[];let n;while(n=walker.nextNode()){if(n.parentElement?.closest('script,style,textarea,pre,code,.vz-root,.vz-hidden,.vz-marker'))continue;groups.push(n)}for(const t of groups){const parts=t.nodeValue.split(/(⟦[^⟧\r\n]+⟧[^\r\n]*)/g);if(parts.length<2)continue;const frag=document.createDocumentFragment();for(const part of parts){const match=/^⟦\/?([^:⟧]+)(?::[^⟧]+)?⟧/.exec(part);if(match&&tags.has(match[1])){const span=node('span','vz-marker');span.textContent=part;span.hidden=true;frag.append(span)}else frag.append(document.createTextNode(part))}t.replaceWith(frag)}}
function refresh(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;document.querySelectorAll('.vz-marker').forEach(n=>n.replaceWith(document.createTextNode(n.textContent)));document.querySelectorAll('.vz-hidden').forEach(n=>n.classList.remove('vz-hidden'));render();inject();syncMenu()})}
function openDialog(d){d.addEventListener('click',e=>e.stopPropagation());try{d.showModal()}catch(e){d.setAttribute('open','');d.classList.add('vz-dialog-fallback')}d.focus()}
function pencil(fn){return iconButton('pencil','Редактировать поле',fn)}
function fieldHeading(label,fn){const h=node('div','vz-field-heading');h.append(node('span','',label),pencil(fn));return h}
function editField(i,f,state,name){if(running||busy){window.toastr?.warning?.('Дождись завершения генерации');return}const c=C(),m=c.chat[i],chat=scope(),original=m.mes,swipe=m.swipe_id,p=profile(),fieldSignature=JSON.stringify(f);document.querySelector('.vz-modal')?.remove();const d=node('dialog','vz-modal vz-editor');const h=node('div','vz-head');h.append(node('strong','',f.name+(name?' · '+name:'')),button('×',()=>d.close()));d.append(h);const note=node('p','vz-editor-note','Изменяется только служебная метка этого поста. Ролевой текст остаётся прежним.');d.append(note);const existing=f.item?state[f.id]?.[name]:state[f.id];let nameInput;if(f.item&&!name){nameInput=node('input');nameInput.placeholder='Имя персонажа или записи';d.append(nameInput)}const input=node('textarea');input.value=existing??'';input.rows=6;input.setAttribute('aria-label',f.name);d.append(input);const footer=node('div','vz-editor-actions');const submit=button('Сохранить',async()=>{if(running||busy||scope()!==chat||C().chat[i]!==m||m.mes!==original||m.swipe_id!==swipe||profile()!==p||JSON.stringify(f)!==fieldSignature){window.toastr?.warning?.('Пост или настройки изменились. Открой редактор заново.');return}const value=input.value.replace(/[\r\n]+/g,' ').trim();const n=name??nameInput?.value.trim();if(/[⟦⟧]/.test(value)||(f.item&&(!n||/[\r\n⟦⟧]/.test(n)))){window.toastr?.error?.('Проверь имя и текст: служебные скобки недопустимы.');return}const own=parse(original,p);let v=value;if(f.item){v={...(f.mode==='event'?own[f.id]:state[f.id]),[n]:value}}const block=f.item?'⟦'+f.tag+'⟧\n'+Object.entries(v).map(([k,t])=>'⟦'+f.item+':'+k+'⟧ '+t).join('\n')+'\n⟦/'+f.tag+'⟧':'⟦'+f.tag+'⟧ '+v;const pattern=f.item?'^⟦'+rx(f.tag)+'⟧[ \\t]*\\r?\\n[\\s\\S]*?^⟦/'+rx(f.tag)+'⟧[ \\t]*$':'^⟦'+rx(f.tag)+'⟧[^\\r\\n]*$';const re=new RegExp(pattern,'m');const next=re.test(original)?original.replace(re,()=>block):original.trimEnd()+'\n\n'+block;submit.disabled=true;try{m.mes=next;if(m.swipes&&m.swipe_id!=null)m.swipes[m.swipe_id]=next;if(!c.saveChat)throw Error('SillyTavern saveChat недоступен');await c.saveChat();if(scope()===chat&&C().chat[i]===m){c.updateMessageBlock?.(i,m);refresh()}d.close()}catch(err){m.mes=original;if(m.swipes&&m.swipe_id!=null)m.swipes[m.swipe_id]=original;submit.disabled=false;window.toastr?.error?.(String(err.message??err));console.error('[Visualizer]',err)}});footer.append(button('Отмена',()=>d.close()),submit);d.append(footer);d.onclose=()=>d.remove();document.body.append(d);openDialog(d);input.focus()}
function notify(message,error=false){
    const toast=window.toastr;
    if(toast&&typeof toast[error?'error':'success']==='function')toast[error?'error':'success'](message);
    else alert(message);
}
function validateProfile(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.fields)||!raw.fields.length)throw Error('В JSON нет списка полей профиля');
    const result=defaults();
    for(const key of ['title','html','endpoint','model','provider','connectionProfileId']){
        if(typeof raw[key]==='string')result[key]=raw[key];
    }
    for(const key of ['together','write','hide']){
        if(typeof raw[key]==='boolean')result[key]=raw[key];
    }
    if(!['active','direct','connection'].includes(result.provider))result.provider='active';
    if(result.provider!=='active')result.together=false;
    const ids=new Set(),tags=new Set();
    result.fields=raw.fields.map(f=>{
        if(!f||typeof f!=='object'||typeof f.id!=='string'||!f.id||ids.has(f.id))throw Error('Некорректный или повторяющийся ID поля');
        if(['__proto__','constructor','prototype'].includes(f.id))throw Error('Недопустимый ID поля');
        if(typeof f.tag!=='string'||!/^[\p{L}\p{N}_-]+$/u.test(f.tag)||tags.has(f.tag))throw Error('Некорректная или повторяющаяся метка');
        if(typeof f.item!=='string'||(f.item&&!/^[\p{L}\p{N}_-]+$/u.test(f.item)))throw Error('Некорректная метка записи');
        if(typeof f.name!=='string'||typeof f.prompt!=='string')throw Error('Отсутствует название или промпт поля');
        ids.add(f.id);tags.add(f.tag);
        return {id:f.id,name:f.name,tag:f.tag,item:f.item,mode:['fresh','persist','event'].includes(f.mode)?f.mode:'fresh',on:f.on!==false,prompt:f.prompt};
    });
    return result;
}
function profileActions(dialog,p){
    const actions=node('div','vz-profile-actions');
    const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    file.addEventListener('change',async()=>{
        const chat=scope();
        try{
            const selectedFile=file.files?.[0];if(!selectedFile)return;
            if(selectedFile.size>2*1024*1024)throw Error('Файл слишком большой');
            const raw=JSON.parse(await selectedFile.text());
            const data=validateProfile(raw.profile??raw);
            if(scope()!==chat||!dialog.isConnected)return;
            let name=typeof raw.name==='string'&&raw.name.trim()?raw.name.trim():data.title||'Импортированный профиль';
            if(['__proto__','constructor','prototype'].includes(name))name='Импортированный профиль';
            const base=name;let i=2;
            while(Object.hasOwn(store().profiles,name))name=base+' ('+i+++')';
            store().profiles[name]=data;
            meta().profile=name;save();refresh();dialog.close();settings();notify('Профиль импортирован');
        }catch(e){notify(String(e.message??e),true)}finally{file.value=''}
    });
    actions.append(file,button('↓ Импорт JSON',()=>file.click()),button('↑ Экспорт JSON',()=>{
        const data=validateProfile(p);
        const blob=new Blob([JSON.stringify({name:meta().profile,profile:data},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob),link=node('a');
        link.href=url;link.download='visualizer-profile.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    const remove=button('Удалить профиль',()=>{
        const name=meta().profile;
        if(name==='default'||!Object.hasOwn(store().profiles,name))return;
        if(!confirm('Удалить профиль «'+name+'»? Чаты, использующие его, перейдут на стандартный профиль. Метки в постах сохранятся.'))return;
        delete store().profiles[name];
        meta().profile='default';
        save();refresh();dialog.close();settings();notify('Профиль удалён');
    });
    remove.disabled=meta().profile==='default';
    remove.title=remove.disabled?'Стандартный профиль нельзя удалить':'Удалить выбранный профиль';
    actions.append(remove);
    return actions;
}
function connectionService(){return C().ConnectionManagerRequestService}
function connectionProfiles(){try{return connectionService()?.getSupportedProfiles()??[]}catch{return []}}
function connectionControls(parent,p,dialog){
    const label=node('label','vz-setting');
    label.append(node('span','','Подключение трекера'));
    const provider=node('select');
    for(const [v,t] of [['active','Активное подключение'],['connection','Профиль подключения SillyTavern'],['direct','Прямой OpenAI-compatible API']]){
        const o=node('option','',t);o.value=v;o.selected=p.provider===v;provider.append(o);
    }
    provider.onchange=()=>{p.provider=provider.value;if(p.provider!=='active')p.together=false;save();refresh();dialog.close();settings()};
    label.append(provider);parent.append(label);
    if(p.provider==='connection'){
        const row=node('label','vz-setting');row.append(node('span','','Сохранённый профиль подключения'));
        const select=node('select');const placeholder=node('option','','Выберите профиль');placeholder.value='';select.append(placeholder);
        const profiles=connectionProfiles();
        for(const profile of profiles){const option=node('option','',profile.name);option.value=profile.id;select.append(option)}
        if(p.connectionProfileId&&!profiles.some(x=>x.id===p.connectionProfileId)){
            const missing=node('option','','Профиль недоступен');missing.value=p.connectionProfileId;select.append(missing);
        }
        select.value=p.connectionProfileId??'';
        select.onchange=()=>{p.connectionProfileId=select.value;save()};
        row.append(select);parent.append(row,node('small','','Отдельный запрос через выбранное подключение. Основное подключение ролевого чата не переключается.'));
        if(!profiles.length)parent.append(node('small','','Нет доступных профилей. Проверьте Connection Profiles в SillyTavern.'));
    }
}
async function requestViaProfile(p,prompt,signal){
    const service=connectionService();
    if(!service||!p.connectionProfileId)throw Error('Выберите доступный профиль подключения');
    const messages=[{role:'user',content:prompt}];
    const payload=typeof service.constructPrompt==='function'?service.constructPrompt(messages,p.connectionProfileId):messages;
    const data=await service.sendRequest(p.connectionProfileId,payload,2048,{stream:false,signal,extractData:true});
    const result=typeof data==='string'?data:data?.content;
    if(typeof result!=='string')throw Error('Профиль подключения не вернул текст');
    return result;
}
function settings(){const ctx=C();const chatId=ctx.getCurrentChatId?.();if(!chatId||!Array.isArray(ctx.chat)){const msg='Откройте чат, чтобы активировать настройки';if(window.toastr?.info)window.toastr.info(msg);else alert(msg);return}document.querySelector('.vz-modal')?.remove();const dialog=node('dialog','vz-modal'),p=profile();const h=node('div','vz-head');h.append(node('strong','','Настройки'),button('×',()=>dialog.close()));dialog.append(h);
const add=(parent,label,key,obj,kind,help)=>{const wrap=node('label','vz-setting'),row=node('span','vz-setting-label',label),q=button('?',()=>alert(help));row.append(q);wrap.append(row);const input=document.createElement(kind==='textarea'?'textarea':'input');if(kind==='check'){input.type='checkbox';input.checked=!!obj[key]}else{if(kind!=='textarea')input.type=kind==='password'?'password':'text';input.value=obj[key]??''}input.onchange=()=>{obj[key]=kind==='check'?input.checked:input.value;save();refresh()};wrap.append(input);parent.append(wrap);return input};
const section=(title)=>{const d=node('details','vz-settings-section');d.open=true;d.append(node('summary','',title));dialog.append(d);return d};
const a=section('Профиль и оформление');const ps=node('select');for(const n of Object.keys(store().profiles)){const o=node('option','',n);o.value=n;o.selected=n===meta().profile;ps.append(o)}ps.onchange=()=>{meta().profile=ps.value;save();dialog.close();settings();refresh()};a.append(ps,button('+ Профиль',()=>{const n=prompt('Название профиля');if(n&&!Object.hasOwn(store().profiles,n)){store().profiles[n]=clone(p);meta().profile=n;save();dialog.close();settings();refresh()}}));
a.append(profileActions(dialog,p));add(a,'Название','title',p,'text','Например: Хроники четырёх стихий.');add(a,'Собственный HTML','html',p,'textarea','Пустое поле наследует тему. Пример: <h3>{{title}}</h3><p>{{scene}}</p>. HTML изолирован, скрипты запрещены. Для интерактивного поля: <div data-vz-field="wear"></div>.');
const b=section('Подключение и метки');const together=add(b,'Отправлять вместе с постом','together',p,'check','Включено: промпт добавляется к ролевому запросу. Выключено: отдельный запрос после поста. Другой профиль подключения требует отдельного запроса.');together.disabled=p.provider!=='active';add(b,'Выводить метки в пост','write',p,'check','Добавляет метки в исходный текст для SP Imagen.');add(b,'Скрывать метки в чате','hide',p,'check','Скрываются только визуально. Расширения, читающие chat[i].mes, продолжают видеть их.');connectionControls(b,p,dialog);if(p.provider==='direct'){add(b,'Endpoint','endpoint',p,'text','Полный URL, например https://example.com/v1/chat/completions');add(b,'Модель','model',p,'text','ID модели, например gpt-4o-mini');const k=node('input');k.type='password';k.placeholder='API-ключ (только это устройство)';k.value=sessionStorage.getItem('vz-key')??'';k.onchange=()=>sessionStorage.setItem('vz-key',k.value);b.append(k);}
const d=section('Поля и промпты');for(const f of p.fields){const card=node('div','vz-field');add(card,'Активно','on',f,'check','Отключает поле без удаления.');add(card,'Название','name',f,'text','Название вкладки. Например: Предметы.');add(card,'Метка блока','tag',f,'text','Например: ПРЕДМЕТЫ. Без скобок.');add(card,'Метка записи','item',f,'text','Например: ПРЕДМЕТ. Пусто — единая строка.');const mode=node('select');for(const [v,t] of [['fresh','↻ Новый снимок'],['persist','↔ Полное состояние'],['event','+ Только изменения']]){const o=node('option','',t);o.value=v;o.selected=f.mode===v;mode.append(o)}mode.onchange=()=>{f.mode=mode.value;save();refresh()};card.append(mode,button('?',()=>alert('Новый снимок — актуальные позы. Полное состояние — сохраняй одежду до изменения. Только изменения — регистрация NPC.')));add(card,'Промпт','prompt',f,'textarea','Опиши только видимые свойства, например: Track visible held objects.');if(!['scene','wear','npc'].includes(f.id))card.append(button('Удалить',()=>{if(confirm('Удалить поле?')){p.fields=p.fields.filter(x=>x!==f);save();dialog.close();settings();refresh()}}));d.append(card)}d.append(button('+ Добавить поле',()=>{p.fields.push({id:crypto.randomUUID(),name:'Новое поле',tag:'ПОЛЕ_'+p.fields.length,item:'ЗАПИСЬ',mode:'fresh',on:true,prompt:'Track only established visible details.'});save();dialog.close();settings();refresh()}));dialog.append(button('Готово',()=>dialog.close()));dialog.onclose=()=>dialog.remove();document.body.append(dialog);openDialog(dialog)}
async function separate(){const c=C(),p=profile();if(busy||!enabled()||(p.provider==='active'&&p.together)||!p.write)return;const i=c.chat.length-1,m=c.chat[i];if(!m||m.is_user||m.is_system||Object.keys(parse(m.mes,p)).length)return;const s=scope(),original=m.mes,swipe=m.swipe_id;busy=true;controller=new AbortController();try{const prompt=instruction(p,snapshot(i-1,p))+'\nReturn ONLY metadata for this completed scene.\n'+c.chat.slice(Math.max(0,i-5),i+1).map(x=>x.name+': '+strip(x.mes,p)).join('\n');let result;if(p.provider==='connection'){result=await requestViaProfile(p,prompt,controller.signal)}else if(p.provider==='direct'){const response=await fetch(p.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(sessionStorage.getItem('vz-key')??'')},body:JSON.stringify({model:p.model,messages:[{role:'user',content:prompt}]}),signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);result=(await response.json()).choices[0].message.content}else{if(!c.generateQuietPrompt)throw Error('Active connection unavailable');result=await c.generateQuietPrompt({quietPrompt:prompt})}if(!enabled()||scope()!==s||C().chat[i]!==m||m.mes!==original||m.swipe_id!==swipe)return;const parsed=parse(result,p),blocks=[];for(const f of p.fields.filter(x=>x.on)){const v=parsed[f.id];if(v===undefined)continue;blocks.push(f.item?'⟦'+f.tag+'⟧\n'+Object.entries(v).map(([n,t])=>'⟦'+f.item+':'+n+'⟧ '+t).join('\n')+'\n⟦/'+f.tag+'⟧':'⟦'+f.tag+'⟧ '+v)}if(!blocks.length)throw Error('No valid metadata');m.mes=original.trimEnd()+'\n\n'+blocks.join('\n');if(m.swipes&&m.swipe_id!=null)m.swipes[m.swipe_id]=m.mes;await c.saveChat?.();c.updateMessageBlock?.(i,m);refresh()}catch(e){if(e.name!=='AbortError'){console.warn('[Visualizer]',e);notify(String(e.message??e),true)}}finally{busy=false;controller=null}}
function syncMenu(){const check=document.getElementById('vz-chat-enabled');if(check){check.checked=enabled();check.disabled=typeof C().getCurrentChatId==='function'&&!C().getCurrentChatId();}}
function init(){const c=C();store();const menu=document.querySelector('#extensions_settings2')??document.querySelector('#extensions_settings');if(menu&&!document.getElementById('vz-menu')){const panel=node('div','vz-menu inline-drawer');panel.id='vz-menu';const head=node('div','inline-drawer-toggle inline-drawer-header');head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-expanded','false');head.append(node('b','','◉ Визуализатор'),node('div','inline-drawer-icon fa-solid fa-circle-chevron-down down'));const content=node('div','vz-menu-content');content.hidden=true;const toggle=()=>{content.hidden=!content.hidden;head.setAttribute('aria-expanded',String(!content.hidden));const icon=head.lastElementChild;icon.classList.toggle('fa-circle-chevron-down',content.hidden);icon.classList.toggle('fa-circle-chevron-up',!content.hidden)};head.addEventListener('click',e=>{e.stopPropagation();toggle()});head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});const label=node('label','vz-menu-check');const check=node('input');check.type='checkbox';check.id='vz-chat-enabled';check.onchange=()=>{meta().enabled=check.checked;if(!check.checked)controller?.abort();save();refresh()};label.append(check,node('span','','Включить в этом чате'));const b=button('⚙ Настройки',settings);b.className='menu_button vz-menu-settings';b.id='vz-settings-button';content.append(label,b);panel.append(head,content);menu.append(panel);syncMenu()}const bus=c.eventSource,types=c.eventTypes??c.event_types;for(const name of ['CHAT_CHANGED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','CHARACTER_MESSAGE_RENDERED','GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED']){if(!types?.[name])continue;bus.on(types[name],()=>{if(name==='CHAT_CHANGED'){controller?.abort();selected.clear();document.querySelector('.vz-modal')?.close();running=false}if(name==='GENERATION_STARTED'){if(busy)return;running=true;inject();return}if(name==='GENERATION_ENDED'||name==='GENERATION_STOPPED')running=false;if(!running)refresh();if(name==='GENERATION_ENDED'&&!busy)void separate()})}refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();