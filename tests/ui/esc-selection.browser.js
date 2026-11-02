import * as THREE from 'three';

const errors=[];
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const warn=console.warn,error=console.error;
console.warn=(...a)=>{errors.push(a.join(' '));warn(...a);};
console.error=(...a)=>{errors.push(a.join(' '));error(...a);};
const check=(v,m)=>{if(!v)throw new Error(m);};
const stage=m=>{document.querySelector('#smoke-result').textContent=`RUNNING: ${m}`;};
const select=(id,value)=>{const o=document.getElementById(id);o.value=value;o.dispatchEvent(new Event('change',{bubbles:true}));};
const esc=frame=>frame.getObjectByName('SmallQuad_ESC_4in1');
const oldNodes=frame=>[1,2,3,4].some(i=>frame.getObjectByName(`SmallQuad_ESC_0${i}`)
  ||frame.getObjectByName(`SmallQuad_ESCMount_0${i}`));
const pixels=viewer=>{
  const target=new THREE.WebGLRenderTarget(384,384);
  viewer.renderer.setRenderTarget(target);viewer.renderer.render(viewer.scene,viewer.camera);
  const out=new Uint8Array(384*384*4);
  viewer.renderer.readRenderTargetPixels(target,0,0,384,384,out);
  viewer.renderer.setRenderTarget(null);target.dispose();return out;
};
const pixelChange=(a,b)=>a.reduce((n,v,i)=>n+(Math.abs(v-b[i])>10?1:0),0);
try{
  const {droneView}=await import('/src/main.ts');
  await droneView.modelReady;
  stage('frame assembles without ESC geometry');
  select('frame','frame-aster-450');
  let frame=await droneView.modelReady;
  check(droneView.selectionAnimationPhase==='frame','frame assembly begins');
  check(frame.getObjectByName('SmallQuad_ESCMount'),'one central ESCMount exists');
  check(!oldNodes(frame),'no four-arm ESC anchors or roots exist');
  check(!esc(frame),'no ESC before selection');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  check(droneView.selectionAnimationPhase==='idle'&&!esc(frame),'completed frame remains ESC-free');

  stage('one central ESC slides into the chassis');
  const previousCamera=droneView.camera.position.clone();
  const topPlate=frame.getObjectByName('SmallQuad_TopPlate');
  const previousPlateMaterial=topPlate.material;
  select('esc','esc-v25');await droneView.escReady;
  check(droneView.selectionAnimationPhase==='esc','ESC-only motion begins');
  const root=esc(frame),mount=frame.getObjectByName('SmallQuad_ESCMount');
  check(root?.parent===mount,'one ESC is parented to the central mount');
  check(frame.getObjectsByProperty('name','SmallQuad_ESC_4in1').length===1,'exactly one ESC root exists');
  check(!oldNodes(frame),'no arm-mounted ESCs appear');
  frame.updateMatrixWorld(true);
  const center=frame.getWorldPosition(new THREE.Vector3());
  const mountWorld=mount.getWorldPosition(new THREE.Vector3());
  const antenna=frame.getObjectByName('SmallQuad_AntennaMount').getWorldPosition(new THREE.Vector3());
  const cameraMount=frame.getObjectByName('SmallQuad_CameraMount').getWorldPosition(new THREE.Vector3());
  const antennaDirection=antenna.clone().sub(cameraMount).normalize();
  const shifted=mountWorld.clone().sub(center);
  check(shifted.dot(antennaDirection)>.02,'ESC mount shifted toward antenna side');
  const longAxis=new THREE.Vector3(1,0,0).applyQuaternion(mount.getWorldQuaternion(new THREE.Quaternion()));
  check(longAxis.dot(antennaDirection)>.95,'ESC mount rotated 90 degrees toward antenna side');
  const start=root.position.clone();
  check(start.x<-.04,'first visible ESC pose is detached on the insertion side');
  const before=pixels(droneView);
  droneView.seekSelectionAnimation(droneView.escSelectionDuration*.5);
  const middle=root.position.clone();
  check(middle.x>start.x+.01&&middle.x<-.005,'central ESC visibly moves between start and final');
  check(!frame.getObjectByName('SmallQuad_Motor_01')&&!frame.getObjectByName('SmallQuad_Propeller_01'),
    'ESC clip stays motor- and propeller-free');
  const changedPixels=pixelChange(before,pixels(droneView));
  check(changedPixels>20,`ESC installation changes rendered pixels (${changedPixels})`);
  droneView.seekSelectionAnimation(droneView.escSelectionDuration);
  check(root.position.length()<1e-5&&droneView.selectionAnimationPhase==='idle','central ESC seats at mount');
  check(droneView.camera.position.distanceTo(previousCamera)<1e-5
    &&topPlate.material===previousPlateMaterial,'ESC inspection view and plate material restore after seating');
  frame.updateMatrixWorld(true);
  check(root.getWorldPosition(new THREE.Vector3()).distanceTo(mount.getWorldPosition(new THREE.Vector3()))<1e-6,
    'ESC final origin matches central mount');
  check(root.getObjectByName('SmallESC_Mount')
    &&root.getObjectByName('SmallESC_Power_Positive')
    &&[1,2,3,4].every(i=>[...'ABC'].every(p=>root.getObjectByName(`SmallESC_Motor0${i}_Phase_${p}`))),
    'mount, power and twelve motor-phase anchors survive');

  stage('other selections leave the central ESC installed');
  select('battery','battery-b4-4000');
  await droneView.batteryReady;
  check(esc(frame)===root&&droneView.selectionAnimationPhase==='battery','battery change does not replay ESC');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);
  select('motor','motor-m2216');await droneView.motorReady;
  check(esc(frame)===root&&droneView.selectionAnimationPhase==='motor','motors install without replaying ESC');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  select('propeller','propeller-p9045');await droneView.propellerReady;
  check(esc(frame)===root&&droneView.selectionAnimationPhase==='propeller','propellers install without replaying ESC');
  droneView.seekSelectionAnimation(droneView.propellerSelectionDuration);
  select('esc','');await droneView.escReady;
  check(!esc(frame),'clearing ESC removes it');
  check(frame.getObjectByName('SmallQuad_Motor_01')&&frame.getObjectByName('SmallQuad_Propeller_01'),
    'motor and propeller remain after ESC clear');
  const stale=droneView.setSelectedEsc('esc-v25');
  const clear=droneView.setSelectedEsc(undefined);
  await Promise.all([stale,clear]);
  check(!esc(frame),'rapid clear prevents a stale ESC');
  select('esc','esc-v25');await droneView.escReady;
  select('frame','frame-aster-680');await droneView.modelReady;
  check(frame.parent===null&&!droneView.scene.getObjectByName('SmallQuad_ESC_4in1'),
    'frame switch cancels and removes central ESC');

  stage('preselected stages remain separate');
  select('frame','frame-aster-450');frame=await droneView.modelReady;
  check(droneView.selectionAnimationPhase==='frame'&&!esc(frame)
    &&!frame.getObjectByName('SmallQuad_Motor_01')&&!frame.getObjectByName('SmallQuad_Propeller_01'),
    'frame stage has no ESC, motor or propeller');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  await droneView.escReady;
  check(droneView.selectionAnimationPhase==='esc'&&esc(frame)
    &&!frame.getObjectByName('SmallQuad_Motor_01'),'one ESC stage precedes motors');
  droneView.seekSelectionAnimation(droneView.escSelectionDuration);
  await droneView.batteryReady;
  check(droneView.selectionAnimationPhase==='battery'&&frame.getObjectByName('SmallQuad_Battery')
    &&!frame.getObjectByName('SmallQuad_Motor_01'),'battery stage follows ESC');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase==='motor'&&frame.getObjectByName('SmallQuad_Motor_01')
    &&!frame.getObjectByName('SmallQuad_Propeller_01'),'motor stage follows ESC');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  await droneView.propellerReady;
  check(droneView.selectionAnimationPhase==='propeller'&&frame.getObjectByName('SmallQuad_Propeller_01'),
    'propellers follow motors');
  droneView.seekSelectionAnimation(droneView.propellerSelectionDuration);
  check(!oldNodes(frame)&&frame.getObjectsByProperty('name','SmallQuad_ESC_4in1').length===1,
    'final quad has exactly one ESC module');
  check(errors.length===0,`browser errors: ${errors.join('; ')}`);
  document.querySelector('#smoke-result').textContent=`PASS: frame without ESC; one central ESC visibly slides into chassis (${droneView.escSelectionDuration.toFixed(2)} s); zero arm ESCs; power/12 phase anchors; independent motor/propeller stages; clear, race and frame cancellation; no browser errors`;
}catch(e){document.querySelector('#smoke-result').textContent=`FAIL: ${e.stack??e}; browser errors: ${errors.join('; ')}`;}
finally{console.warn=warn;console.error=error;}
