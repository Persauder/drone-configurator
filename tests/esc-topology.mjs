import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle=await build({stdin:{contents:"export * from './src/configurator/calculator'; export * from './src/data/escs';",
  resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {calculateEscQuantity,calculateTotalMass,calculateCurrentAndPower,escs}=await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('central 4-in-1 uses one physical module; individual ESC uses rotor count',()=>{
  const central=escs.find(esc=>esc.id==='esc-v25');
  const individual=escs.find(esc=>esc.id==='esc-v40');
  assert.equal(central.topology,'4in1');
  assert.ok(escs.filter(esc=>esc.id!=='esc-v25').every(esc=>esc.topology==='individual'));
  assert.equal(calculateEscQuantity(central,4),1);
  assert.equal(calculateEscQuantity(individual,4),4);
  assert.equal(calculateEscQuantity(individual,6),6);
  assert.equal(calculateEscQuantity(undefined,4),0);
});

test('mass uses physical ESC quantity without multiplying 4-in-1 current',()=>{
  const base={mission:'custom',frame:undefined,rotorCount:4,motor:undefined,
    propeller:undefined,esc:undefined,battery:undefined,electronics:[],payloadKg:0};
  const central=escs[0],individual=escs[1];
  assert.equal(calculateTotalMass({...base,esc:central}),central.weightKg);
  assert.equal(calculateTotalMass({...base,esc:individual}),individual.weightKg*4);
  assert.equal(calculateTotalMass({...base,esc:undefined}),0);
  const motor={weightKg:0,minVoltage:9,maxVoltage:16.8,averageCurrent:8,maxCurrent:20,maxThrustKg:1};
  const battery={weightKg:0,voltage:14.8,capacityAh:4,maxContinuousCurrent:100};
  const current=calculateCurrentAndPower({...base,esc:central,motor,battery});
  assert.equal(current.motorAverageCurrent,32);
  assert.equal(current.motorMaxCurrent,80);
  assert.equal(central.continuousCurrent,25); // Per motor channel, not a summed 100 A rating.
});
