(function(){"use strict";function A(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function I(n){let e=A(n);return e=e.replace(/`([^`]+)`/g,'<code class="gw-md-code">$1</code>'),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*([^*]+)\*/g,"<em>$1</em>"),e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" class="gw-md-link" target="_blank" rel="noopener noreferrer">$1</a>'),e}function V(n){var c;const e=n.replace(/\r\n/g,`
`).split(`
`),s=[];let a=0;for(;a<e.length;){const g=e[a]??"";if(g.startsWith("```")){const u=[];for(a+=1;a<e.length&&!e[a].startsWith("```");)u.push(e[a]),a+=1;a+=1,s.push(`<pre class="gw-md-pre"><code>${A(u.join(`
`))}</code></pre>`);continue}if(/^#{1,3}\s/.test(g)){const u=((c=g.match(/^#+/))==null?void 0:c[0].length)??1,$=u===1?"h3":u===2?"h4":"h5",x=g.replace(/^#{1,3}\s+/,"");s.push(`<${$} class="gw-md-heading">${I(x)}</${$}>`),a+=1;continue}if(/^\d+\.\s+/.test(g)){const u=[];for(;a<e.length&&/^\d+\.\s+/.test(e[a]);)u.push(`<li>${I(e[a].replace(/^\d+\.\s+/,""))}</li>`),a+=1;s.push(`<ol class="gw-md-ol">${u.join("")}</ol>`);continue}if(/^[-*]\s+/.test(g)){const u=[];for(;a<e.length&&/^[-*]\s+/.test(e[a]);)u.push(`<li>${I(e[a].replace(/^[-*]\s+/,""))}</li>`),a+=1;s.push(`<ul class="gw-md-ul">${u.join("")}</ul>`);continue}if(!g.trim()){a+=1;continue}const b=[];for(;a<e.length&&e[a].trim()&&!e[a].startsWith("```");)b.push(e[a]),a+=1;s.push(`<p class="gw-md-p">${I(b.join(" "))}</p>`)}return s.join("")}function X(n){return n.trim()?V(n):""}const j="growy_visitor_token",z="__gw_welcome__";function Q(){const n=document.currentScript;if(n instanceof HTMLScriptElement)return n;const e=document.querySelectorAll("script[data-public-key]");return e[e.length-1]}function Z(){return"http://localhost:3001".replace(/\/$/,"")}function ee(n){const e=n.getAttribute("data-api-base");if(e)return e.replace(/\/$/,"");try{const s=new URL(n.src);return`${s.protocol}//${s.host}`}catch{return Z()}}async function E(n,e,s={}){const a=new Headers(s.headers);return a.set("Content-Type","application/json"),s.visitorToken&&a.set("X-Visitor-Token",s.visitorToken),fetch(`${n}${e}`,{...s,headers:a,credentials:"omit"})}const te=380,ne=520,oe="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;700;800&family=Fira+Code:wght@400;500&display=swap",ae='"Nunito", sans-serif',P='"Fira Code", monospace';function ie(){const n="growy-widget-fonts";if(document.getElementById(n))return;const e=document.createElement("link");e.id=n,e.rel="stylesheet",e.href=oe,document.head.appendChild(e)}function F(n,e){n.innerHTML="";const s=document.createElement("style");s.textContent=`
    .gw-root { font-family: ${ae}; font-size: 14px; font-weight: 400; letter-spacing: -0.015em; color: #111; }
    .gw-panel {
      display: flex;
      flex-direction: column;
      width: ${te}px;
      height: ${ne}px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0,0,0,.12);
      background: #fff;
      box-sizing: border-box;
    }
    .gw-header { flex-shrink: 0; padding: 12px 14px; color: #fff; font-weight: 800; letter-spacing: -0.03em; font-size: 15px; }
    .gw-header-btn { background: rgba(255,255,255,.2); border: none; color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
    .gw-header-btn:hover { background: rgba(255,255,255,.35); }
    .gw-body {
      flex: 1;
      min-height: 0;
      padding: 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .gw-body-form { gap: 0; }
    .gw-messages {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
    }
    .gw-msg-user { align-self: flex-end; background: ${e}; color: #fff; padding: 8px 12px; border-radius: 12px; max-width: 85%; white-space: pre-wrap; word-break: break-word; }
    .gw-msg-bot { align-self: flex-start; background: #f3f4f6; padding: 8px 12px; border-radius: 12px; max-width: 85%; word-break: break-word; }
    .gw-md { font-size: 14px; line-height: 1.5; }
    .gw-md p.gw-md-p { margin: 0 0 0.5em; }
    .gw-md p.gw-md-p:last-child { margin-bottom: 0; }
    .gw-md strong { font-weight: 600; }
    .gw-md em { font-style: italic; }
    .gw-md-code { font-family: ${P}; font-size: 0.85em; background: #e5e7eb; padding: 1px 4px; border-radius: 4px; }
    .gw-md-pre { margin: 0.5em 0; padding: 8px; background: #e5e7eb; border-radius: 8px; overflow-x: auto; font-size: 12px; }
    .gw-md-pre code { font-family: ${P}; }
    .gw-md-heading { margin: 0.25em 0; font-weight: 800; letter-spacing: -0.03em; }
    .gw-md-ul, .gw-md-ol { margin: 0.35em 0; padding-left: 1.25em; }
    .gw-md-link { color: ${e}; text-decoration: underline; }
    .gw-typing { display: inline-flex; align-items: center; gap: 5px; min-height: 20px; padding: 2px 0; }
    .gw-typing span { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: gw-typing-bounce 1.2s ease-in-out infinite; }
    .gw-typing span:nth-child(2) { animation-delay: 0.15s; }
    .gw-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes gw-typing-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
      30% { transform: translateY(-5px); opacity: 1; }
    }
    .gw-session-notice {
      align-self: center;
      font-size: 11px;
      color: #6b7280;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      padding: 4px 10px;
      margin: 4px 0;
      animation: gw-notice-in 0.25s ease-out;
    }
    @keyframes gw-notice-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .gw-header-btn:disabled { opacity: 0.65; cursor: wait; }
    .gw-field { margin-bottom: 10px; }
    .gw-field label { display: block; font-weight: 800; font-size: 12px; letter-spacing: -0.02em; margin-bottom: 4px; }
    .gw-field input, .gw-field textarea, .gw-field select { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; }
    .gw-form { margin: 0; }
    .gw-footer { flex-shrink: 0; display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #e5e7eb; background: #fff; }
    .gw-footer input { flex: 1; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; }
    .gw-footer .gw-btn { width: 100%; }
    .gw-btn { background: ${e}; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 800; letter-spacing: -0.02em; }
    .gw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .gw-launcher { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 50%; border: none; background: ${e}; color: #fff; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.2); font-size: 22px; }
  `,n.appendChild(s)}function W(n,e,s,a){const c=document.createElement("div");c.className="gw-header",c.style.background=s,c.style.display="flex",c.style.alignItems="center",c.style.justifyContent="space-between",c.style.gap="8px";const g=document.createElement("span");g.textContent=e,c.appendChild(g),a&&c.appendChild(a),n.appendChild(c)}function se(){const n=document.createElement("div");n.className="gw-typing",n.setAttribute("aria-label","Assistant is typing");for(let e=0;e<3;e++)n.appendChild(document.createElement("span"));return n}function q(n,e){const s=document.createElement("div");s.className="gw-md",s.innerHTML=X(e),n.appendChild(s)}async function re(n){await new Promise((s,a)=>{const c=document.createElement("script");c.src=`https://www.google.com/recaptcha/api.js?render=${n}`,c.onload=()=>s(),c.onerror=()=>a(new Error("reCAPTCHA load failed")),document.head.appendChild(c)});const e=window.grecaptcha;return()=>e.execute(n,{action:"widget"})}async function ce(){var J;ie();const n=Q();if(!n)return;const e=n.getAttribute("data-public-key");if(!e)return;const s=ee(n),a="#4f46e5",c=document.createElement("button");c.className="gw-launcher",c.type="button",c.setAttribute("aria-label","Open chat"),c.textContent="💬",document.body.appendChild(c);const g=document.createElement("div");g.style.cssText="position:fixed;bottom:88px;right:20px;z-index:99999;display:none;",document.body.appendChild(g);const b=document.createElement("div");b.className="gw-root",g.appendChild(b);let u=!1;c.onclick=()=>{u=!u,g.style.display=u?"block":"none"},F(b,a);const $=await E(s,`/public/widget/${encodeURIComponent(e)}/config`);if(!$.ok){b.textContent="Widget unavailable";return}const x=await $.json(),H=((J=x.branding)==null?void 0:J.primaryColor)??a;F(b,H);let m=localStorage.getItem(`${j}:${e}`)??"",C=null,y=[],R=null,h=null;function B(){var t,o;return((o=(t=x.branding)==null?void 0:t.welcomeMessage)==null?void 0:o.trim())||"How can we help you?"}function de(){return{id:z,role:"assistant",content:B(),status:"complete"}}function le(){const t=y.filter(o=>o.id!==z);return t.length>0?t:[de()]}function _(t){const o=b.querySelector(".gw-messages");if(!o)return;const i=document.createElement("div");i.className="gw-session-notice",i.textContent=t,o.appendChild(i),o.scrollTop=o.scrollHeight,window.setTimeout(()=>{i.remove()},2800)}if(x.recaptchaEnabled&&x.recaptchaSiteKey)try{R=await re(x.recaptchaSiteKey)}catch{}async function Y(){if(!(!x.recaptchaEnabled||!R))return R()}function D(){var t;return{pageHost:window.location.hostname,pageOrigin:window.location.origin,referrer:((t=document.referrer)==null?void 0:t.trim())||void 0}}async function G(){const t={visitorToken:m||void 0,recaptchaToken:m?void 0:await Y(),pageContext:D()},i=await(await E(s,`/public/widget/${encodeURIComponent(e)}/visitor`,{method:"POST",body:JSON.stringify(t)})).json();return m=i.visitorToken,localStorage.setItem(`${j}:${e}`,m),i.activeConversationId&&(C=i.activeConversationId),i}async function S(){return m||(await G()).visitorToken}async function pe(t){const o=await E(s,`/public/widget/${encodeURIComponent(e)}/conversations/${encodeURIComponent(t)}?visitorToken=${encodeURIComponent(m)}`,{visitorToken:m});if(!o.ok)return;y=(await o.json()).messages??[]}async function me(){const t=h;t&&(t.disabled=!0,t.textContent="Starting…");try{await S();const o=await E(s,`/public/widget/${encodeURIComponent(e)}/conversations`,{method:"POST",body:JSON.stringify({visitorToken:m,newSession:!0}),visitorToken:m});if(!o.ok){_("Could not start a new chat. Try again.");return}C=(await o.json()).conversationId,y=[];const p=b.querySelector(".gw-panel");p&&(O(p),_("New chat started"))}finally{t&&(t.disabled=!1,t.textContent="New chat")}}function ge(t){var w;t.innerHTML="",W(t,((w=x.branding)==null?void 0:w.name)??"Chat",H);const o=document.createElement("div");o.className="gw-body gw-body-form";const i=document.createElement("form");i.className="gw-form",i.id=`gw-form-${e}`;const p={},f=document.createElement("div");f.className="gw-msg-bot",q(f,B()),o.appendChild(f);for(const l of x.formSchema){const k=document.createElement("div");k.className="gw-field";const N=document.createElement("label");N.textContent=l.label+(l.required?" *":""),k.appendChild(N);let d;if(l.type==="long-text")d=document.createElement("textarea"),d.rows=3;else if(l.type==="select"){d=document.createElement("select");const L=document.createElement("option");L.value="",L.textContent=l.placeholder??"Select…",d.appendChild(L);for(const K of l.options??[]){const U=document.createElement("option");U.value=K,U.textContent=K,d.appendChild(U)}}else d=document.createElement("input"),d.type=l.type==="email"?"email":l.type==="number"?"number":l.type==="date"?"date":"text";l.placeholder&&(d.placeholder=l.placeholder),d.addEventListener("input",()=>{p[l.key]=(d instanceof HTMLSelectElement,d.value)}),k.appendChild(d),i.appendChild(k)}const r=document.createElement("button");r.type="submit",r.className="gw-btn",r.textContent="Continue",r.setAttribute("form",i.id),i.onsubmit=async l=>{if(l.preventDefault(),r.disabled=!0,await S(),!(await E(s,`/public/widget/${encodeURIComponent(e)}/form`,{method:"POST",body:JSON.stringify({visitorToken:m,data:p,recaptchaToken:await Y(),pageContext:D()})})).ok){r.disabled=!1,alert("Could not submit form");return}O(t)},o.appendChild(i),t.appendChild(o);const v=document.createElement("div");v.className="gw-footer",v.appendChild(r),t.appendChild(v)}function M(t){t.innerHTML="";for(const o of le()){const i=document.createElement("div"),p=o.role==="user";i.className=p?"gw-msg-user":"gw-msg-bot",!p&&o.status==="streaming"&&!o.content.trim()?i.appendChild(se()):p?i.textContent=o.content:q(i,o.content),t.appendChild(i)}t.scrollTop=t.scrollHeight}function ue(t,o){const i=new URL(`${s}/public/widget/${encodeURIComponent(e)}/conversations/${C}/stream`);i.searchParams.set("runId",t),i.searchParams.set("visitorToken",m);const p=new EventSource(i.toString());p.onmessage=f=>{try{const r=JSON.parse(f.data);if(r.type==="delta"&&r.delta){const w=y.findIndex(l=>l.id===o);w>=0&&(y[w]={...y[w],content:(y[w].content||"")+r.delta})}if(r.type==="message"&&r.message){const w=y.findIndex(l=>l.id===r.message.id);w>=0?y[w]=r.message:y.push(r.message)}const v=b.querySelector(".gw-messages");v&&M(v)}catch{}},p.addEventListener("error",()=>p.close())}function O(t){var v;t.innerHTML="",h=document.createElement("button"),h.type="button",h.className="gw-header-btn",h.textContent="New chat",h.onclick=()=>void me(),W(t,((v=x.branding)==null?void 0:v.name)??"Chat",H,h);const o=document.createElement("div");o.className="gw-body";const i=document.createElement("div");i.className="gw-messages",o.appendChild(i),t.appendChild(o);const p=document.createElement("div");p.className="gw-footer";const f=document.createElement("input");f.placeholder="Type a message…";const r=document.createElement("button");r.type="button",r.className="gw-btn",r.textContent="Send",r.onclick=async()=>{const w=f.value.trim();if(!w)return;r.disabled=!0,f.disabled=!0,h&&(h.disabled=!0),await S();const l={id:`local-${Date.now()}`,role:"user",content:w,status:"complete"};y.push(l),M(i),f.value="";const k=C?`/public/widget/${encodeURIComponent(e)}/conversations/${C}/messages`:`/public/widget/${encodeURIComponent(e)}/conversations`,N=await E(s,k,{method:"POST",body:JSON.stringify(C?{visitorToken:m,content:w}:{visitorToken:m,message:w}),visitorToken:m});if(!N.ok){_("Message could not be sent. Try again."),r.disabled=!1,f.disabled=!1,h&&(h.disabled=!1);return}const d=await N.json();C=d.conversationId,d.messageId&&y.push({id:d.messageId,role:"assistant",content:"",status:"streaming"}),M(i),d.runId&&d.messageId&&ue(d.runId,d.messageId),r.disabled=!1,f.disabled=!1,h&&(h.disabled=!1),f.focus()},p.appendChild(f),p.appendChild(r),t.appendChild(p),M(i)}const T=document.createElement("div");T.className="gw-panel",b.appendChild(T);async function fe(){const t=x.formSchema.length>0;if(m)try{const o=await G();if(!t||o.formCompleted){o.activeConversationId&&(C=o.activeConversationId,await pe(C)),O(T);return}}catch{}t?ge(T):(await S(),O(T))}fe()}ce()})();
