import * as THREE from 'three';

const errors=[];
window.addEventListener('error',(event)=>errors.push(event.message));
window.addEventListener('unhandledrejection',(event)=>errors.push(String(event.reason)));
const originalError=console.error;
const originalWarn=console.warn;
console.error=(...args)=>{errors.push(args.join(' '));originalError(...args);};
console.warn=(...args)=>{errors.push(args.join(' '));originalWarn(...args);};
const check=(value,message)=>{if(!value)throw new Error(message);};
const stage=(message)=>{document.querySelector('#smoke-result').textContent=`RUNNING: ${message}`;};
const select=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const near=(a,b,tolerance=1e-5)=>Math.abs(a-b)<tolerance;
const suffix=(i)=>String(i).padStart(2,'0');
const propRoots=(frame)=>[1,2,3,4].map((i)=>frame.getObjectByName(`SmallQuad_Propeller_${suffix(i)}`));
const capRoots=(frame)=>[1,2,3,4].map((i)=>frame.getObjectByName(`SmallQuad_PropNut_${suffix(i)}`));
const motorRoots=(frame)=>[1,2,3,4].map((i)=>frame.getObjectByName(`SmallQuad_Motor_${suffix(i)}`));
const noProps=(frame)=>propRoots(frame).every((root)=>!root)&&capRoots(frame).every((root)=>!root);
const pixels=(viewer)=>{
  const target=new THREE.WebGLRenderTarget(384,384);
  viewer.renderer.setRenderTarget(target);
  viewer.renderer.render(viewer.scene,viewer.camera);
  const output=new Uint8Array(384*384*4);
  viewer.renderer.readRenderTargetPixels(target,0,0,384,384,output);
  viewer.renderer.setRenderTarget(null);target.dispose();return output;
};
const changedPixels=(a,b)=>a.reduce((count,v,i)=>count+(Math.abs(v-b[i])>10?1:0),0);

try {
  stage('frame only, then motor only');
  const {droneView}=await import('/src/main.ts');
  const {configuration}=await import('/src/configurator/configuration.ts');
  await droneView.modelReady;
  check(!configuration.motor&&!configuration.propeller,'motor and propeller are initially unselected');
  select('frame','frame-aster-450');
  const frame=await droneView.modelReady;
  check(droneView.selectionAnimationPhase==='frame'&&noProps(frame),'frame assembly starts without propellers');
  droneView.seekSelectionAnimation(2);
  check(noProps(frame)&&motorRoots(frame).every((root)=>!root),'arms and bolts move without motors or propellers');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  check(noProps(frame),'assembled frame has no propellers');
  select('propeller','propeller-p9045');
  await droneView.propellerReady;
  check(noProps(frame),'propeller selection without a motor places nothing');
  select('propeller','');
  select('motor','motor-m2216');
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase==='motor'&&noProps(frame),'motor installation remains propeller-free');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(noProps(frame)&&motorRoots(frame).every(Boolean),'motors seated without auto-appearing propellers');

  stage('approved sequential propeller and cap motion');
  const arms=[1,2,3,4].map((i)=>frame.getObjectByName(`SmallQuad_Arm${suffix(i)}_Assembly`));
  const armPositions=arms.map((arm)=>arm.getWorldPosition(new THREE.Vector3()));
  const motors=motorRoots(frame);
  select('propeller','propeller-p9045');
  await droneView.propellerReady;
  check(droneView.selectionAnimationPhase==='propeller','propeller selection starts only propeller installation');
  check(droneView.propellerSelectionDuration>7&&droneView.propellerSelectionDuration<9,
    'held Blender timeline is trimmed to effective propeller motion');
  const roots=propRoots(frame),caps=capRoots(frame);
  check(roots.every(Boolean)&&caps.every(Boolean),'four propellers and four retaining caps created');
  check(caps.every((cap,i)=>cap.getObjectByName(`SmallQuad_PropNut_${suffix(i+1)}_Mesh`).scale.length()<1e-5),
    'retaining caps are invisible until their install step');
  const originalMotorPositions=motors.map((motor)=>motor.position.clone());
  check(roots.every((root)=>near(root.position.y,0.065,1e-4)),
    'the first visible propeller state is detached, without a seated flash');
  const firstPixels=pixels(droneView);
  droneView.seekSelectionAnimation(0.7);
  check(roots[0].position.y<0.06&&roots[0].position.y>0.001,
    'Propeller01 visibly moves down its shaft axis');
  check(roots.slice(1).every((root)=>near(root.position.y,0.065,1e-4)),
    'Propellers02–04 wait while Propeller01 installs');
  check(changedPixels(firstPixels,pixels(droneView))>20,'installation changes rendered pixels');
  droneView.seekSelectionAnimation(1.4);
  check(near(roots[0].position.y,0,1e-4)&&caps[0].position.y<0.02,
    'Cap01 follows the seated Propeller01');
  droneView.seekSelectionAnimation(2.6);
  check(roots[1].position.y<0.065&&roots[1].position.y>0&&near(roots[2].position.y,0.065,1e-4),
    'Propeller02 moves later, while Propeller03 waits');
  check(arms.every((arm,i)=>arm.getWorldPosition(new THREE.Vector3()).distanceTo(armPositions[i])<1e-6)
    &&motors.every((motor,i)=>motor.position.distanceTo(originalMotorPositions[i])<1e-6),
    'propeller selection does not replay frame or motor installation');
  droneView.seekSelectionAnimation(4.6);
  check(roots[2].position.y<0.065&&roots[2].position.y>0
    &&near(roots[3].position.y,0.065,1e-4),'Propeller03 moves after Propeller02');
  droneView.seekSelectionAnimation(6.6);
  check(roots[3].position.y<0.065&&roots[3].position.y>0,
    'Propeller04 moves last');
  droneView.seekSelectionAnimation(droneView.propellerSelectionDuration);
  check(droneView.selectionAnimationPhase==='idle'&&roots.every((root)=>near(root.position.y,0,1e-5)),
    'all four propellers remain seated at completion');
  const expected=['CW','CCW','CW','CCW'];
  for(let i=1;i<=4;i++){
    const index=i-1,anchor=motors[index].getObjectByName(`SmallQuad_Motor${suffix(i)}_PropellerMount`);
    const root=roots[index],cap=caps[index],capMesh=cap.getObjectByName(`SmallQuad_PropNut_${suffix(i)}_Mesh`);
    check(root.parent===anchor&&cap.parent===anchor,'each propeller and cap uses its actual motor anchor');
    check(root.getObjectByName(`SmallProp_${expected[index]}`),`Motor${suffix(i)} uses ${expected[index]}`);
    check(root.getWorldPosition(new THREE.Vector3()).distanceTo(anchor.getWorldPosition(new THREE.Vector3()))<1e-6,
      'final propeller origin is centered on the shaft');
    const axis=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    check(axis.distanceTo(new THREE.Vector3(0,1,0))<1e-5,'local +Z root axis points along the shaft');
    check(root.scale.equals(new THREE.Vector3(1,1,1))&&capMesh.scale.equals(new THREE.Vector3(1,1,1)),
      'approved propeller and cap scales remain one');
    check(capMesh&&capMesh.parent,'retaining cap remains paired with propeller');
  }
  const centers=roots.map((root)=>root.getWorldPosition(new THREE.Vector3()));
  const diskClearances=[];
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
    diskClearances.push(Math.hypot(centers[i].x-centers[j].x,centers[i].z-centers[j].z)-0.230);
  }
  check(Math.min(...diskClearances)>0.045&&Math.min(...diskClearances)<0.046,
    'runtime shaft anchors preserve the approved non-overlapping rotor-disk clearance');
  select('battery','battery-b4-4000');
  await droneView.batteryReady;
  check(droneView.selectionAnimationPhase==='battery'&&propRoots(frame).every((root,i)=>root===roots[i]),
    'battery change replays no propeller installation');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);

  stage('motor replacement removes props first and reinstalls afterward');
  select('motor','motor-m2814');
  check(roots.every((root)=>!root.parent)&&caps.every((root)=>!root.parent),
    'old propellers and caps are removed before old motors');
  await droneView.motorReady;
  check(noProps(frame)&&droneView.selectionAnimationPhase==='motor',
    'new motors install while propellers remain absent');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  await droneView.propellerReady;
  check(droneView.selectionAnimationPhase==='propeller'&&propRoots(frame).every(Boolean),
    'selected propeller reinstalls after new motors finish');
  droneView.seekSelectionAnimation(droneView.propellerSelectionDuration);
  check(propRoots(frame).every((root)=>near(root.position.y,0,1e-5)),
    'four propellers seat on the closed motor variant');

  stage('rapid changes, clearing, and frame cancellation');
  const oldRoots=propRoots(frame);
  const stale=droneView.setSelectedPropeller('propeller-p9045');
  const clear=droneView.setSelectedPropeller(undefined);
  const latest=droneView.setSelectedPropeller('propeller-p9045');
  await Promise.all([stale,clear,latest,droneView.propellerReady]);
  check(oldRoots.every((root)=>!root.parent)&&propRoots(frame).every(Boolean),
    'stale propeller requests cannot restore old geometry');
  check([1,2,3,4].every((i)=>{
    const anchor=motorRoots(frame)[i-1].getObjectByName(`SmallQuad_Motor${suffix(i)}_PropellerMount`);
    return anchor.children.filter((child)=>child.name===`SmallQuad_Propeller_${suffix(i)}`).length===1;
  }),'rapid changes leave no duplicate propellers');
  select('propeller','');
  await droneView.propellerReady;
  check(noProps(frame)&&motorRoots(frame).every(Boolean),'clearing propeller retains frame and motors');
  select('propeller','propeller-p9045');
  await droneView.propellerReady;
  check(droneView.selectionAnimationPhase==='propeller','propeller reinstall starts again');
  select('frame','frame-aster-680');
  await droneView.modelReady;
  check(frame.parent===null&&droneView.selectionAnimationPhase==='idle'
    &&!droneView.scene.getObjectByName('SmallQuad_Propeller_01'),
    'frame switch cancels pending propeller motion and removes Aster components');
  stage('preselected motor and propeller wait for their respective stages');
  select('frame','frame-aster-450');
  const queuedFrame=await droneView.modelReady;
  check(droneView.selectionAnimationPhase==='frame'&&noProps(queuedFrame)
    &&motorRoots(queuedFrame).every((root)=>!root),
    'preselected components remain absent throughout frame assembly');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  await droneView.batteryReady;
  check(droneView.selectionAnimationPhase==='battery'&&noProps(queuedFrame),
    'preselected battery installs before motors and propellers');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase==='motor'&&noProps(queuedFrame),
    'preselected propeller waits during motor installation');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  await droneView.propellerReady;
  check(droneView.selectionAnimationPhase==='propeller'&&propRoots(queuedFrame).every(Boolean),
    'preselected propeller begins only after the motors seat');
  droneView.seekSelectionAnimation(droneView.propellerSelectionDuration);
  check(propRoots(queuedFrame).every((root)=>near(root.position.y,0,1e-5)),
    'queued frame, motor and propeller stages all finish seated');
  check(errors.length===0,`browser errors: ${errors.join('; ')}`);
  document.querySelector('#smoke-result').textContent=`PASS: motor-free frame; motor-only selection; visible sequential CW/CCW propeller and cap installation (${droneView.propellerSelectionDuration.toFixed(2)} s); exact anchors and +Z roots; motor replacement, clear, rapid changes, frame cancellation; no browser errors`;
}catch(error){
  document.querySelector('#smoke-result').textContent=`FAIL: ${error.stack??error}; browser errors: ${errors.join('; ')}`;
}finally{console.error=originalError;console.warn=originalWarn;}
