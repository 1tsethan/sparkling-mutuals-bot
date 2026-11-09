import { createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
type Headers = Record<string,string>;
const fresh = (stamp:string,now:number) => /^\d{1,12}$/.test(stamp) && Math.abs(now-Number(stamp)*1000)<=300000;
export function verifyInteraction(headers:Headers,raw:Buffer,publicKey:string,now=Date.now()):boolean {
  const stamp=headers['x-signature-timestamp']??'',signature=headers['x-signature-ed25519']??'';
  if(!fresh(stamp,now)|| !/^[a-f0-9]{128}$/i.test(signature)|| !/^[a-f0-9]{64}$/i.test(publicKey))return false;
  try {
    const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey,'hex')]),format:'der',type:'spki'});
    return verify(null,Buffer.concat([Buffer.from(stamp),raw]),key,Buffer.from(signature,'hex'));
  } catch{return false;}
}
export function verifyNotification(headers:Headers,raw:Buffer,secret:string,now=Date.now()):boolean {
  const stamp=headers['x-sm-timestamp']??'',signature=headers['x-sm-signature']??'';
  if(secret.length<32 || !fresh(stamp,now)|| !/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const expected=createHmac('sha256',secret).update(stamp+'.').update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
