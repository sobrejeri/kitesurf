import https from 'node:https';
import dns from 'node:dns';
import { BlockList,isIP } from 'node:net';
import { ENDPOINT,safeError } from './core.mjs';
const blocked4=new BlockList();
for(const [network,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked4.addSubnet(network,prefix,'ipv4');
const blocked6=new BlockList();
for(const [network,prefix]of [['2001::',23],['2001:db8::',32],['2002::',16]])blocked6.addSubnet(network,prefix,'ipv6');
export function publicAddress(address){
  const family=isIP(address);
  if(family===4)return !blocked4.check(address,'ipv4');
  // Only global unicast. This excludes loopback, ULA/link-local, mapped IPv4,
  // multicast, NAT64 and transition addresses before checking special ranges.
  return family===6&&/^[23]/i.test(address)&&!blocked6.check(address,'ipv6');
}
export function guardedLookup(expected,lookup=dns.lookup){
  return (hostname,options,callback)=>{
    if(hostname!==expected)return callback(safeError('EGRESS_HOST_MISMATCH'));
    lookup(hostname,{all:true},(error,addresses)=>{
      if(error)return callback(safeError('EGRESS_DNS_FAILED'));
      if(!addresses?.length||addresses.some(({address})=>!publicAddress(address)))return callback(safeError('EGRESS_PRIVATE_ADDRESS'));
      const matched=addresses.filter((row)=>!options?.family||row.family===options.family);
      if(!matched.length)return callback(safeError('EGRESS_DNS_FAMILY'));
      if(options?.all)return callback(null,matched);
      callback(null,matched[0].address,matched[0].family);
    });
  };
}
export async function createWebPushTransport(env,{load=()=>import('web-push')}={}){
  const details={subject:env.PUSH_VAPID_SUBJECT,publicKey:env.PUSH_VAPID_PUBLIC_KEY,privateKey:env.PUSH_VAPID_PRIVATE_KEY};
  if(typeof details.subject!=='string'||!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.subject))throw safeError('INVALID_VAPID');
  const webpush=await load();
  try{webpush.getVapidHeaders('https://fcm.googleapis.com',details.subject,details.publicKey,details.privateKey,'aes128gcm');}
  catch{throw safeError('INVALID_VAPID');}
  return async ({subscription,payload,ttl,topic})=>{
    if(!ENDPOINT.test(subscription.endpoint))throw safeError('INVALID_SUBSCRIPTION');
    const hostname=new URL(subscription.endpoint).hostname;
    const agent=new https.Agent({keepAlive:false,lookup:guardedLookup(hostname)});
    // Pinned web-push 4 uses one https.request and does not follow redirects.
    // Never supply its proxy option (it would bypass the guarded agent).
    const timer=setTimeout(()=>agent.destroy(),20_000);
    try{
      return await webpush.sendNotification(subscription,payload,{
        vapidDetails:details,TTL:ttl,topic,urgency:'normal',contentEncoding:'aes128gcm',
        timeout:10_000,agent,
      });
    }finally{clearTimeout(timer);agent.destroy();}
  };
}
