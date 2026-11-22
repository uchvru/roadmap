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
  'updates/roadmap-v17.14.roadmap-update':'37d6c56407d0a5dd20dd5dff3ceb3534e0a8a652601ce1e0bf4044ecc65462fc',
  'updates/roadmap-v17.15.roadmap-update':'e2ddec1a64d285543e91e6112b1def9bad2850bde21b007db69df9a9d4128b08',
  'updates/roadmap-v17.17.roadmap-update':'910f301c3086be558f9f8fb3f662667d8199ba4d773d735f294f0eea5fdcd6d7',
  // Published bytes: review-2026-10-31-v17.18/PUBLICATION.md, not a rebuilt asset.
  'updates/roadmap-v17.18.roadmap-update':'cb14bfebe3b9e386b7875b993e89acf09116775a6f45b7860fec3267f70cbbde',
  // Published bytes: review-2026-11-02-v17.19/PUBLICATION.md; never rebuild in maintenance.
  'updates/roadmap-v17.19.roadmap-update':'f1b3cdfa787920636443c2518921ac5e256c5757fed4fba3bc05ff54005e1cc7',
  // Published bytes: v17.20 tag and review-2026-11-02-v17.20/PUBLICATION.md.
  'updates/roadmap-v17.20.roadmap-update':'1526034dc5cf3ec564e53eed3c3e5f39ffe7bd4f38ff940c1ba8cdc0fa43ca26',
  // Published bytes: v17.30 tag and review-2026-11-02-v17.30/PUBLICATION.md.
  'updates/roadmap-v17.30.roadmap-update':'df41d4ae8c50d6b8f8d365ca9e610836c62845226bbcd1e204bd725158f64262',
  // Published bytes: v17.31 tag and review-2026-11-04-v17.31/PUBLICATION.md.
  'updates/roadmap-v17.31.roadmap-update':'5de3435a2f1d4904adcc5bb5364c764b24d8f294d05f2660cb0cde21451fafe6',
  // Published bytes: v17.32 tag and review-2026-11-15-v17.32/PUBLICATION.md.
  'updates/roadmap-v17.32.roadmap-update':'9e283a776c195f7382da53c8d12fbd84e5b40822675c27a120d267ebd7bda842',
  // Original bytes from the v17.33 tag; its signature is still required below.
  'updates/roadmap-v17.33.roadmap-update':'22f0b10e531901af9f1f031f37a93b1415b7490131524b2446d416cf735db2f4',
  'updates/roadmap-v18.0.roadmap-update':'8a1c91269f03166d68ec83931f5f8f49bd9f112dd640c46864b412dcb845de6a',
  // Exact v18.1 bytes match the published tag, Release download and Pages.
  'updates/roadmap-v18.1.roadmap-update':'5a6a9cb49dbde032a883019f566e5702b0c4ed6333d0f33b151037ab6905c39d',
  // v18.2 delivery: review-2026-11-20-v18.2/COMPLETION_AUDIT.md.
  'updates/roadmap-v18.2.roadmap-update':'c2872aa29b3bf86511509eced76def20d3cd3d51c4ee25eed7b6dc6104292086',
  // v18.3 delivery: review-2026-11-21-v18.3/COMPLETION_AUDIT.md.
  'updates/roadmap-v18.3.roadmap-update':'2d12c3328b01f239ebf684a8bd56a85aff3c3217ca4dfca482c113e243eee8a9',
  // Exact v18.4 bytes verified against GitHub Release and Pages.
  'updates/roadmap-v18.4.roadmap-update':'e6218f085a19570fdaf26b32ea669c49d5cb3cba4d592be9f7e67dd7b840d6aa',
  // Exact v18.5 bytes verified against GitHub Release and Pages.
  'updates/roadmap-v18.5.roadmap-update':'11e6bd600dca54b57032d58f67261bbb21479fa06b9399bf2afb6398ff730d56',
  // Exact v18.6 bytes verified against GitHub Release and Pages.
  'updates/roadmap-v18.6.roadmap-update':'15e41991d52079f51bc1364c00b7e2b2444dc2a6b9f23a7f3cb81ef906b8e42d',
  // Exact v18.7 bytes verified against GitHub Release and Pages.
  'updates/roadmap-v18.7.roadmap-update':'85e350ff390c44c53642859f2cf328f3421bbc3f3b74d46a858e10b568943ac6'
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
