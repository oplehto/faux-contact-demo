/* Faux Contact — orthographic, indexed-colour software renderer. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const bayer = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const palettes = {
    oxide: ["#310e13","#68181b","#aa2424","#eb3729","#ff6241","#ffa06d","#fecf97"],
    phosphor: ["#0a281f","#12503c","#187559","#309d70","#63cb8b","#a6e6ad","#edffd5"],
    violet: ["#23162e","#45274e","#704473","#a2628d","#d480a6","#f2aac5","#ffe6df"]
  };
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

  // The radial and axial vectors span the cross section at each point on the spine.
  function createModel(shape = "coupling", thickness = .27, gap = .80) {
    if (!["coupling", "torus", "knot"].includes(shape)) throw new RangeError("Unknown shape");
    const positions = [], normals = [], indices = [], bias = [];
    const slices = shape === "knot" ? 192 : 144, sides = 28;
    const offsets = shape === "coupling" ? [-gap / 2, gap / 2] : [0];
    for (const offset of offsets) {
      const first = positions.length / 3;
      for (let i = 0; i < slices; i++) {
        const u = TAU * i / slices;
        const k = shape === "knot";
        const radius = k ? .76 + .31 * Math.cos(3*u) : 1.04;
        const turns = k ? 2 : 1, a = turns * u;
        const dr = k ? -.93 * Math.sin(3*u) : 0;
        const cx = radius*Math.cos(a), cy = radius*Math.sin(a), cz = k ? .32*Math.sin(3*u) : offset;
        let tx = dr*Math.cos(a) - turns*radius*Math.sin(a);
        let ty = dr*Math.sin(a) + turns*radius*Math.cos(a);
        let tz = k ? .96*Math.cos(3*u) : 0;
        const length = Math.hypot(tx,ty,tz);
        tx /= length; ty /= length; tz /= length;
        const planar = Math.hypot(tx,ty);
        const rx = ty/planar, ry = -tx/planar;
        const bx = ry*tz, by = -rx*tz, bz = rx*ty-ry*tx;
        const width = thickness * (k ? .72 : 1);
        const height = width * (shape === "coupling" ? 2/3 : 1);
        for (let j = 0; j < sides; j++) {
          const v = TAU * j / sides, c = Math.cos(v), s = Math.sin(v);
          positions.push(cx+width*c*rx+height*s*bx, cy+width*c*ry+height*s*by, cz+height*s*bz);
          const nx=c*rx/width+s*bx/height, ny=c*ry/width+s*by/height, nz=s*bz/height;
          const nl=Math.hypot(nx,ny,nz);
          normals.push(nx/nl, ny/nl, nz/nl);
          bias.push(shape === "coupling" ? (offset>0 ? .055 : -.025) - (c>.6 && i%6===0 ? .12 : 0) : 0);
          const here = first + i*sides + j, next = first + ((i+1)%slices)*sides + j;
          const up = first + i*sides + (j+1)%sides, across = first + ((i+1)%slices)*sides + (j+1)%sides;
          indices.push(here,next,across,here,across,up);
        }
      }
    }
    return {positions:Float32Array.from(positions), normals:Float32Array.from(normals),
      indices:Uint32Array.from(indices), bias:Float32Array.from(bias)};
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d", {alpha:true});
    if (!ctx) throw new Error("This browser could not open a 2D drawing surface.");
    let frame, depth, levels, projected = new Float32Array(0);
    let previousPalette, ink = [];
    function render(mesh, options = {}) {
      const {pitch=50, yaw=0, roll=23, scale=.39, dither=1, worn=false, palette=palettes.oxide} = options;
      const w=canvas.width, h=canvas.height;
      if (!frame || frame.width!==w || frame.height!==h) {
        frame=ctx.createImageData(w,h); depth=new Float32Array(w*h); levels=new Float32Array(w*h);
      }
      if (palette !== previousPalette) {
        if (!Array.isArray(palette) || palette.length<2 || !palette.every(c=>/^#[0-9a-f]{6}$/i.test(c)))
          throw new TypeError("Use at least two #RRGGBB inks, darkest first.");
        ink=palette.map(c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5),16)]);
        previousPalette=palette;
      }
      depth.fill(-Infinity);
      frame.data.fill(0);
      const {positions,normals,indices,bias}=mesh;
      const vertices=positions.length/3;
      if (projected.length < vertices*4) projected=new Float32Array(vertices*4);
      const radians=Math.PI/180;
      const cp=Math.cos(pitch*radians), sp=Math.sin(pitch*radians);
      const cy=Math.cos(yaw*radians), sy=Math.sin(yaw*radians);
      const cr=Math.cos(roll*radians), sr=Math.sin(roll*radians);
      const zoom=scale*Math.min(w,h);
      // Rotate the tilted part around a vertical turntable, then roll the camera.
      const m00=cr*cy, m01=cr*sy*sp-sr*cp, m02=cr*sy*cp+sr*sp;
      const m10=sr*cy, m11=sr*sy*sp+cr*cp, m12=sr*sy*cp-cr*sp;
      const m20=-sy, m21=cy*sp, m22=cy*cp;
      const lx=-.47*m00+.70*m10+.53*m20, ly=-.47*m01+.70*m11+.53*m21, lz=-.47*m02+.70*m12+.53*m22;
      for(let i=0;i<vertices;i++) {
        const v=i*3, p=i*4, x=positions[v], y=positions[v+1], z=positions[v+2];
        projected[p]=w/2+zoom*(m00*x+m01*y+m02*z);
        projected[p+1]=h/2-zoom*(m10*x+m11*y+m12*z);
        projected[p+2]=m20*x+m21*y+m22*z;
        const diffuse=Math.max(0,lx*normals[v]+ly*normals[v+1]+lz*normals[v+2]);
        projected[p+3]=clamp(.08+.86*diffuse+(bias ? bias[i] : 0),0,1);
      }
      // Barycentric depth and light interpolation at each covered pixel centre.
      for(let t=0;t<indices.length;t+=3) {
        const a=indices[t]*4,b=indices[t+1]*4,c=indices[t+2]*4;
        const ax=projected[a],ay=projected[a+1];
        const bx=projected[b],by=projected[b+1],cx=projected[c],cy2=projected[c+1];
        const area=(by-cy2)*(ax-cx)+(cx-bx)*(ay-cy2);
        if (Math.abs(area)<1e-6) continue;
        const minX=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),maxX=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
        const minY=Math.max(0,Math.ceil(Math.min(ay,by,cy2)-.5)),maxY=Math.min(h-1,Math.floor(Math.max(ay,by,cy2)-.5));
        for(let y=minY;y<=maxY;y++) {
          for(let x=minX;x<=maxX;x++) {
            const u=((by-cy2)*(x+.5-cx)+(cx-bx)*(y+.5-cy2))/area;
            const v=((cy2-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy2))/area;
            const q=1-u-v;
            if (u < -1e-6 || v < -1e-6 || q < -1e-6) continue;
            const z=u*projected[a+2]+v*projected[b+2]+q*projected[c+2], pixel=y*w+x;
            if(z <= depth[pixel]) continue;
            depth[pixel]=z;
            levels[pixel]=u*projected[a+3]+v*projected[b+3]+q*projected[c+3];
          }
        }
      }
      for(let y=0;y<h;y++) {
        const row=y/h;
        let shift=0;
        if(worn && row>=.388 && row<.408) shift=Math.max(1,Math.round(w/64));
        if(worn && row>=.605 && row<.625) shift=-Math.max(1,Math.round(w/96));
        for(let x=0;x<w;x++) {
          const sourceX=x-shift, source=y*w+sourceX;
          if(sourceX<0 || sourceX>=w || depth[source]===-Infinity) continue;
          const tone=levels[source]*(ink.length-1);
          const threshold=.5+dither*((bayer[(y%4)*4+sourceX%4]+.5)/16-.5);
          const colour=ink[clamp(Math.floor(tone)+(tone%1>threshold ? 1 : 0),0,ink.length-1)];
          const p=4*(y*w+x);
          frame.data[p]=colour[0];frame.data[p+1]=colour[1];frame.data[p+2]=colour[2];frame.data[p+3]=255;
        }
      }
      ctx.putImageData(frame,0,0);
    }
    return {render};
  }

  globalThis.FauxContact3D = {createModel,createRenderer,palettes};
})();
