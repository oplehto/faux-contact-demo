"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const api = window.FauxContact3D;
  const canvas = $("sprite"), plate = $("plate");
  const renderer = api.createRenderer(canvas);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let mesh, scale, pitch=50, yaw=0, spinning=false, last=0, animation=0;
  const wrap = n => ((n + 180) % 360 + 360) % 360 - 180;

  function settings() {
    return {pitch, yaw, scale, palette:api.palettes[$("palette").value],
      dither:Number($("dither").value)/100, worn:$("wear").checked};
  }
  function draw() { renderer.render(mesh, settings()); }
  function geometry() {
    const name=$("model").value, tube=Number($("tube").value)/100, gap=Number($("gap").value)/100;
    mesh=api.createModel(name,tube,gap);
    let radius=0;
    for(let i=0;i<mesh.positions.length;i+=3) {
      radius=Math.max(radius,Math.hypot(mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]));
    }
    scale=.47/radius;
    $("tube-out").value=tube.toFixed(2); $("gap-out").value=gap.toFixed(2);
    $("gap").disabled=name!=="coupling";
    const title=$("model").selectedOptions[0].text;
    $("word").textContent=title; $("title-echo").dataset.text=title;
    $("take").textContent="FIG. 0"+($("model").selectedIndex+1);
    canvas.setAttribute("aria-label",title+". Drag or use the arrow keys to rotate.");
    draw();
  }
  function stock() {
    const film=$("stock").value==="film";
    plate.dataset.stock=$("stock").value;
    plate.classList.toggle("fc-film-stock",film);
    $("title").classList.toggle("fc-film-title",film);
  }
  function material() {
    $("inks").replaceChildren(...api.palettes[$("palette").value].map(colour=>{
      const ink=document.createElement("i"); ink.style.backgroundColor=colour; return ink;
    }));
    $("dither-out").value=$("dither").value+"%";
    canvas.width=Number($("size").value); canvas.height=Math.round(canvas.width*152/192);
    $("resolution").textContent=canvas.width+" × "+canvas.height;
    $("plate").dataset.wear=$("wear").checked ? "worn" : "clean";
    draw();
  }

  function tick(now) {
    if(!spinning) return;
    if(last) yaw=wrap(yaw+Math.min(now-last,80)*.032);
    last=now; draw(); animation=requestAnimationFrame(tick);
  }
  function spin(on) {
    cancelAnimationFrame(animation); spinning=on; last=0;
    $("spin").textContent=on ? "Ⅱ Pause spin" : "▶ Spin";
    $("spin").setAttribute("aria-pressed",String(on));
    if(on) animation=requestAnimationFrame(tick);
  }
  function turn(dx,dy) { yaw=wrap(yaw+dx); pitch=wrap(pitch+dy); draw(); }
  let drag=null;
  canvas.addEventListener("pointerdown",e=>{
    if(!e.isPrimary || e.button!==0) return;
    spin(false); canvas.setPointerCapture(e.pointerId);
    drag={x:e.clientX,y:e.clientY,id:e.pointerId};
  });
  canvas.addEventListener("pointermove",e=>{
    if(!drag || drag.id!==e.pointerId) return;
    turn((e.clientX-drag.x)*.6,(e.clientY-drag.y)*.6); drag.x=e.clientX; drag.y=e.clientY;
  });
  canvas.addEventListener("lostpointercapture",()=>{drag=null;});
  canvas.addEventListener("keydown",e=>{
    const delta={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];
    if(delta){e.preventDefault();spin(false);turn(...delta);}
  });

  function motion() {
    document.body.dataset.motion=reduced.matches || !$("tracking").checked ? "paused" : "running";
    plate.dataset.motion=document.body.dataset.motion;
    $("tracking").disabled=reduced.matches;
    if(reduced.matches) spin(false);
  }
  $("tracking").addEventListener("change", motion);
  reduced.addEventListener("change", motion);
  $("spin").addEventListener("click",()=>spin(!spinning));
  $("reset").addEventListener("click",()=>{spin(false);pitch=50;yaw=0;draw();});
  for(const id of ["model","tube","gap"]) $(id).addEventListener("input",geometry);
  for(const id of ["palette","size","dither","wear"]) $(id).addEventListener("input",material);
  $("stock").addEventListener("change",stock);

  function exportPng(strip) {
    const count=strip ? 16 : 1;
    const target=document.createElement("canvas");
    target.width=canvas.width*count; target.height=canvas.height;
    const dest=target.getContext("2d");
    if(strip) {
      const cell=document.createElement("canvas"); cell.width=canvas.width; cell.height=canvas.height;
      const sheetRenderer=api.createRenderer(cell), pose=settings();
      for(let i=0;i<count;i++) {
        sheetRenderer.render(mesh,{...pose,yaw:pose.yaw+i*360/count});
        dest.drawImage(cell,i*cell.width,0);
      }
    } else dest.drawImage(canvas,0,0);
    const filename="fc-"+$("model").value+"-"+$("palette").value+(strip?"-16":"")+".png";
    target.toBlob(blob=>{
      if(!blob){$("message").textContent="PNG export failed. Try again.";return;}
      const link=document.createElement("a"), url=URL.createObjectURL(blob);
      link.download=filename;link.href=url;document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      $("message").textContent=filename+" · "+target.width+" × "+target.height;
    },"image/png");
  }
  $("png").addEventListener("click",()=>exportPng(false));
  $("strip").addEventListener("click",()=>exportPng(true));
  stock(); geometry(); material(); motion();
})();
