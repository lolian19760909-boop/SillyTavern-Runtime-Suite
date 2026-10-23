import { createMotion } from '../visual/runtime/motion.mjs';
export async function runMotionChecks() {
  const check=(condition,message)=>{if(!condition)throw Error(message);}, sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const root=document.createElement('section');root.style.cssText='position:relative;width:360px;max-width:100%;min-height:180px';document.body.append(root);
  root.innerHTML='<article id="first" style="height:120px">First <button>Open</button></article><article id="second" hidden style="height:160px">Second</article><aside hidden>Dialog</aside><div class="detail"><h2>Title</h2><p>Original</p></div>';
  const [a,b,panel,detail]=root.children,engine=createMotion(),scope=engine.mount(root),checks=[];
  try{
    const from=scope.capture(a);a.hidden=true;b.hidden=false;const enter=scope.navigate(a,b,{from});
    await sleep(65);check(!a.hidden&&!b.hidden&&a.inert,'Both pages exist and outgoing page is inert');
    const beforeReverse=b.getBoundingClientRect().left;
    const back=scope.navigate(b,a,{from:scope.capture(b),direction:-1});
    check(Math.abs(b.getBoundingClientRect().left-beforeReverse)<1,'Reversing does not double the visible translation');await Promise.all([enter,back]);
    check(!a.hidden&&b.hidden&&!a.inert&&!b.inert,'Interrupted navigation keeps latest target');
    check(!a.style.position&&!b.style.position,'Navigation restores inline geometry');checks.push('navigation reversal and final visibility');
    for(let i=0;i<12;i++){const old=i%2?a:b,next=i%2?b:a;void scope.navigate(old,next);await sleep(8);}
    scope.finish();check(scope.diagnostics().active===0&&scope.diagnostics().transitions===0,'Rapid navigation settles');checks.push('rapid navigation cleanup');
    const opened=scope.presence(panel,true);await sleep(50);const closed=scope.presence(panel,false);await sleep(30);const reopened=scope.presence(panel,true);await Promise.all([opened,closed,reopened]);
    check(!panel.hidden&&!panel.inert,'Presence retarget keeps latest open');await scope.presence(panel,false);check(panel.hidden&&!panel.inert,'Presence closes');checks.push('open-close-open reversal');
    panel.style.transform='translateX(13px)';await scope.presence(panel,true);check(getComputedStyle(panel).transform.includes('13'),'Presence preserves authored transform');const captured=scope.capture(panel);panel.hidden=true;const delayed=scope.presence(panel,false,{from:captured});check(!panel.hidden,'Captured exit retains visible content');await delayed;check(panel.hidden,'Captured exit commits hidden');checks.push('authored transform and captured presence exit');
    detail.querySelector('p').dataset.action='real';
    const changed=scope.update(detail,()=>{detail.innerHTML='<h2>New title</h2><p data-action="real">Replacement</p>';});
    check(root.querySelectorAll('[aria-hidden="true"]').length===1,'Outgoing snapshot exists');await changed;
    check(!root.querySelector('[aria-hidden="true"]'),'Outgoing snapshot removed');checks.push('content transition cleanup');
    const snapshot=scope.update(detail,()=>{detail.querySelector('p').textContent='Fresh';});check(root.querySelectorAll('[data-action="real"]').length===1,'Snapshot never duplicates business selectors');await snapshot;checks.push('display snapshots isolated from application queries');
    for(let i=0;i<15;i++){void scope.update(detail,()=>{detail.querySelector('p').textContent=String(i);});await sleep(4);}scope.finish();check(scope.diagnostics().active===0&&!root.querySelector('[inert]'),'Rapid replacements clear all snapshots');checks.push('rapid content replacement cleanup');
    const input=document.createElement('input');detail.append(input);await scope.update(detail,()=>{input.value='preserved';});check(detail.querySelector('input')===input,'Input identity preserved');checks.push('inputs are not cloned');
    const button=a.querySelector('button');void scope.feedback(button);await scope.update(detail,()=>{detail.querySelector('p').textContent='Updated';});check(scope.diagnostics().active===0,'Independent effects finish');checks.push('independent channels');
    const layout=scope.layout([a,b],()=>{a.style.height='180px';});await layout;checks.push('layout update');
    void scope.navigate(a,b);scope.dispose();check(engine.diagnostics().active===0&&engine.diagnostics().scopes===0,'Dispose clears scopes');checks.push('dispose during transition');
    const reduced=engine.mount(root,{reducedMotion:()=>true});await reduced.navigate(b,a);check(!a.hidden&&b.hidden&&reduced.diagnostics().active===0,'Reduced motion commits state');reduced.dispose();checks.push('reduced motion final state');
    return {pass:true,checks};
  }finally{engine.dispose();root.remove();}
}
