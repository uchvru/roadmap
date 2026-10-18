// Public-code boundary: a signed update must be exactly the clean working
// variant of the public app, never an arbitrary signed HTML or a personal plan.
import {createHash,createPublicKey,verify} from 'node:crypto';

export const updatePublicKeys=Object.freeze({
  'roadmap-updates-2026-10':'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAERyOeAnrhopvbgfhRPDC0B5Qz3eDbI5u+8fKT71jHFtU5axVsU2QsFUQrhdOuUMs7pUlCsI66m9uj+4BP0rW/mA=='
});
// Exact released bytes, not a wildcard for old signed/private exports.
export const historicalUpdateAssets=Object.freeze({
  'updates/roadmap-v17.10.roadmap-update':'e8908d46f5458f1c4a9cef4ca48b1bd1ca4857cc8aa3f24b515154eb4d4188a0',
  'updates/roadmap-v17.11.roadmap-update':'ed42b3f6e159f678ddddf69f71730d554adbc4f0f401dc040a1a5f3a0722ee06',
  'updates/roadmap-v17.12.roadmap-update':'0e95ae3df690dca5dc4dbfe8372c09ac356fd9f853e5f8e63b7d0b412dae96f0',
  'updates/roadmap-v17.14.roadmap-update':'37d6c56407d0a5dd20dd5dff3ceb3534e0a8a652601ce1e0bf4044ecc65462fc'
});
export function verifyHistoricalUpdateAsset(path,text){
  if(!Object.hasOwn(historicalUpdateAssets,path)||typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024
    ||createHash('sha256').update(text).digest('hex')!==historicalUpdateAssets[path])throw Error('Unknown or changed historical update');
  // The pinned hash is already a publication contract. Verify its signature and
  // internal release metadata too, without comparing it to the newer app.
  const template=JSON.parse(JSON.parse(text).payload).template;
  const proof=verifyUpdateAsset(text,template);
  if(publicUpdatePath(proof.version)!==path)throw Error('Historical update path mismatch');
  return proof;
}
export function publicUpdatePath(version){
  if(typeof version!=='string'||!/^\d+\.\d+(?:\.\d+)?$/.test(version))throw Error('Invalid release version');
  const [major,minor]=version.split('.').map(Number);
  return major>17||(major===17&&minor>=10)?`updates/roadmap-v${version}.roadmap-update`:null;
}
export function verifyUpdateAsset(text,app,{trustedKeys=updatePublicKeys}={}){
  if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('Invalid update size');
  const envelope=JSON.parse(text);
  if(!envelope||Object.keys(envelope).sort().join(',')!=='keyId,payload,signature'
    ||!Object.hasOwn(trustedKeys,envelope.keyId)||typeof envelope.payload!=='string'
    ||typeof envelope.signature!=='string')throw Error('Invalid update envelope');
  const signature=Buffer.from(envelope.signature,'base64');
  if(signature.length!==64||signature.toString('base64')!==envelope.signature)throw Error('Invalid update signature');
  const key=createPublicKey({key:Buffer.from(trustedKeys[envelope.keyId],'base64'),format:'der',type:'spki'});
  if(!verify('sha256',Buffer.from(envelope.payload),{key,dsaEncoding:'ieee-p1363'},signature))throw Error('Update signature mismatch');
  const payload=JSON.parse(envelope.payload);
  if(!payload||Object.keys(payload).sort().join(',')!=='channel,format,kind,releaseDate,template,templateSha256,version'
    ||payload.kind!=='roadmap-protected-update'||payload.format!==1||payload.channel!=='uchvru/roadmap-updates'
    ||typeof payload.template!=='string')throw Error('Invalid update payload');
  const versions=[...app.matchAll(/const APP_VERSION = '([^']+)'/g)];
  const dates=[...app.matchAll(/const APP_VERSION_DATE = '(\d{2})\.(\d{2})\.(\d{4})'/g)];
  if(versions.length!==1||dates.length!==1||payload.version!==versions[0][1]
    ||payload.releaseDate!==`${dates[0][3]}-${dates[0][2]}-${dates[0][1]}`)throw Error('Update release mismatch');
  let clean=app;
  for(const flag of ['CLEAN_BUILD','DEMO_ON_LOAD']){
    const marker=new RegExp(`const ${flag} = (?:true|false); /\\* __${flag}__ \\*/`,'g');
    if((clean.match(marker)||[]).length!==1)throw Error('Invalid application variant');
    clean=clean.replace(marker,`const ${flag} = false; /* __${flag}__ */`);
  }
  if(payload.template!==clean)throw Error('Update differs from clean public application');
  if(createHash('sha256').update(clean).digest('hex')!==payload.templateSha256)throw Error('Update template hash mismatch');
  return {version:payload.version,sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)};
}
