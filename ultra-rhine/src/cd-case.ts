import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArchiveRecord } from './data';
import { disposeThreeTree } from './three-resources';

/** Shared dimensions preserve archive spacing and the existing camera framing. */
export function createCDShell() {
  const root = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, name: string, color: string, part: string, glass = false) => {
    const material = new THREE.MeshPhysicalMaterial({ color, roughness: glass ? .15 : .38, transmission: glass ? .65 : 0, thickness: .04, metalness: 0 });
    material.name = name;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.surface = name; mesh.userData.assemblyPart = part;
    root.add(mesh); return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w,h,d).translate(x,y,z);
  // Inset the back plate: its outer faces must not overlap the frame faces.
  // Coplanar outer walls caused alternating dark/bright pixels while orbiting.
  add(box(3.66,3.5,.07,0,1.85,-.1), 'Optical_Diffuser', '#252923', 'carrier');
  const edges = [box(.12,3.7,.28,-1.89,1.85,.015),box(.12,3.7,.28,1.89,1.85,.015),box(3.66,.1,.28,0,.05,.015),box(3.66,.1,.28,0,3.65,.015)];
  add(mergeGeometries(edges)!, 'Ivory_Edges', '#d9ded9', 'carrier', true); edges.forEach(g=>g.dispose());
  add(box(3.72,3.48,.035,.02,1.85,.19), 'Frosted_Polymer', '#f5f7f2', 'cover', true);
  const hinges = [box(.12,.34,.16,-2,.4,.15),box(.12,.34,.16,-2,3.3,.15)];
  add(mergeGeometries(hinges)!, 'Titanium_Fasteners', '#b7bdb6', 'carrier'); hinges.forEach(g=>g.dispose());
  const disc = add(new THREE.RingGeometry(.23,1.57,64).translate(.05,1.85,.015), 'Compact_Disc', '#bfcbd4', 'disc');
  disc.material.metalness = .8; disc.material.roughness = .2; disc.material.side = THREE.DoubleSide;
  const hub = add(new THREE.RingGeometry(.16,.3,32).translate(.05,1.85,.028), 'Disc_Hub', '#343b37', 'carrier'); hub.material.side = THREE.DoubleSide;
  return root;
}

export function spineGeometry() {
  // UV horizontal direction runs along the box's height, readable after orbiting.
  const geometry = new THREE.PlaneGeometry(3.44,.22);
  geometry.rotateZ(Math.PI / 2); geometry.rotateY(-Math.PI / 2);
  geometry.translate(-1.97,1.85,.015);
  return geometry;
}
export function drawSpine(ctx: CanvasRenderingContext2D, record: ArchiveRecord, x=0,y=0,w=1024,h=64) {
  ctx.fillStyle='#e9e5d9'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#b27937'; ctx.fillRect(x,y,h*.14,h);
  ctx.fillStyle='#202720'; ctx.font=`600 ${h*.43}px MiSans, sans-serif`;
  ctx.textBaseline='middle';
  ctx.fillText(`${record.title}  /  ${record.en}`,x+h*.4,y+h*.5,w-h*1.8);
  ctx.fillStyle='#786c59'; ctx.font=`${h*.22}px sans-serif`;ctx.fillText('CD',x+w-h*.8,y+h*.5);
}
export function createSpineAtlas(records: ArchiveRecord[]) {
  const canvas=document.createElement('canvas');canvas.width=2048;
  canvas.height=THREE.MathUtils.ceilPowerOfTwo(Math.max(32,Math.ceil(records.length/4)*32));
  const ctx=canvas.getContext('2d')!;
  records.forEach((record,i)=>drawSpine(ctx,record,(i%4)*512,Math.floor(i/4)*32,512,32));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
export function setSpineUV(geometry: THREE.BufferGeometry,index: number,height: number) {
  const uv=geometry.getAttribute('uv') as THREE.BufferAttribute;
  const x=(index%4)/4,y=1-Math.floor(index/4)*32/height,h=32/height;
  uv.setXY(0,x,y);uv.setXY(1,x+.25,y);uv.setXY(2,x,y-h);uv.setXY(3,x+.25,y-h);uv.needsUpdate=true;
}

export async function createCDAssembly(record: ArchiveRecord) {
  const model=createCDShell();
  const cover=new THREE.Group();cover.name='CD lid hinge';cover.position.set(-1.88,0,.19);
  for(const mesh of [...model.children]) if(mesh.userData.assemblyPart==='cover') {
    mesh.position.sub(cover.position);cover.add(mesh);
  }
  model.add(cover);
  const spine=document.createElement('canvas');spine.width=1024;spine.height=64;
  drawSpine(spine.getContext('2d')!,record);
  const texture=new THREE.CanvasTexture(spine);texture.colorSpace=THREE.SRGBColorSpace;
  model.add(new THREE.Mesh(spineGeometry(),new THREE.MeshBasicMaterial({map:texture,toneMapped:false})));
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.MeshStandardMaterial({color:'#ebe7dd',roughness:.85,side:THREE.DoubleSide}));
  paper.position.set(.07,1.85,.215).sub(cover.position);cover.add(paper);
  if(record.coverPath && window.potato) {
    try {
      const url=await window.potato.coverData(record.coverPath);
      if(url) {
        const image=new Image();image.src=url;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
        const ctx=canvas.getContext('2d')!,scale=Math.max(512/image.width,512/image.height);
        ctx.drawImage(image,(512-image.width*scale)/2,(512-image.height*scale)/2,image.width*scale,image.height*scale);
        const art=new THREE.CanvasTexture(canvas);art.colorSpace=THREE.SRGBColorSpace;
        paper.material.map=art;paper.material.needsUpdate=true;image.src='';
      }
    } catch { /* A plain paper sleeve remains usable if artwork is unavailable. */ }
  }
  const insideCanvas=document.createElement('canvas');insideCanvas.width=insideCanvas.height=512;
  const ink=insideCanvas.getContext('2d')!;
  ink.fillStyle='#e9e5d9';ink.fillRect(0,0,512,512);ink.fillStyle='#293a30';
  ink.font='bold 22px MiSans, sans-serif';ink.fillText('RHINE LAB / MUSIC ARCHIVE',36,64);
  ink.fillRect(36,86,440,2);ink.font='bold 28px MiSans, sans-serif';ink.fillText(record.title,36,145,440);
  ink.font='20px MiSans, sans-serif';ink.fillText(record.en,36,184,440);ink.fillText(record.date,36,220,440);
  ink.font='16px sans-serif';ink.fillText(`${record.id}  /  COMPACT DISC`,36,458);
  const insideTexture=new THREE.CanvasTexture(insideCanvas);insideTexture.colorSpace=THREE.SRGBColorSpace;
  const inside=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.MeshStandardMaterial({map:insideTexture,roughness:.85}));
  inside.rotation.y=Math.PI;inside.position.set(.07,1.85,.155).sub(cover.position);cover.add(inside);
  // A small printed label keeps the disc recognizable when the lid is open.
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=512;
  const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#d6dcd8';ctx.fillRect(0,0,512,512);
  ctx.fillStyle='#334337';ctx.textAlign='center';ctx.font='bold 30px MiSans, sans-serif';ctx.fillText(record.title,256,155,400);
  ctx.font='18px MiSans, sans-serif';ctx.fillText(record.en,256,190,400);ctx.font='14px sans-serif';ctx.fillText('RHINE LAB  /  COMPACT DISC',256,370);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Mesh(new THREE.RingGeometry(.32,1.32,64),new THREE.MeshStandardMaterial({map:labelTexture,roughness:.5,metalness:.15,side:THREE.DoubleSide}));
  label.position.set(.05,1.85,.045);model.add(label);
  return { model, setOpen: (amount:number)=>{cover.rotation.y=-Math.PI*.68*amount;}, setClarity:(value:number)=>{
    cover.traverse(child=>{if(child instanceof THREE.Mesh && child.material.name==='Frosted_Polymer') child.material.roughness=.15+(1-value)*.4;});
  }, dispose:()=>disposeThreeTree(model) };
}
