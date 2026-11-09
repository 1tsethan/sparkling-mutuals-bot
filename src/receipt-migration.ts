import { createHmac, timingSafeEqual } from 'node:crypto';
const path='/migration/receipts';
function signature(method:string,target:string,raw:Buffer,key:Buffer,stamp:string) {
  if(key.length!==32)throw new Error('Invalid migration configuration.');
  const derived=createHmac('sha256',key).update('SM receipt migration key v1').digest();
  try {return createHmac('sha256',derived).update('SM receipt migration v1\n'+stamp+'\n'+method+'\n'+target+'\n').update(raw).digest();}
  finally {derived.fill(0);}
}
export function migrationHeaders(method:string,target:string,raw:Buffer,key:Buffer,now=Date.now()):Record<string,string> {
  const stamp=Math.floor(now/1000).toString();
  return {'x-sm-migration-timestamp':stamp,'x-sm-migration-signature':signature(method,target,raw,key,stamp).toString('hex')};
}
export function verifyMigration(method:string,target:string,headers:Record<string,string>,raw:Buffer,key:Buffer,now=Date.now()):boolean {
  const stamp=headers['x-sm-migration-timestamp']??'',provided=headers['x-sm-migration-signature']??'';
  if(target!==path||!['GET','POST'].includes(method)||!/^\d{1,12}$/.test(stamp)||Math.abs(now-Number(stamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(provided))return false;
  try {return timingSafeEqual(signature(method,target,raw,key,stamp),Buffer.from(provided,'hex'));}catch{return false;}
}
