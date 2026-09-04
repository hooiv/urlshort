import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
const TOKEN_KEY='ql.mobile.session'
const QUEUE_KEY='ql.mobile.queue'
// Bound every network call so a stalled request can't hang the UI forever.
export const REQUEST_TIMEOUT_MS=15000
async function fetchWithTimeout(url:string,init:RequestInit={},timeoutMs=REQUEST_TIMEOUT_MS){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...init,signal:controller.signal})}catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error(`Request timed out after ${timeoutMs}ms`);throw e}finally{clearTimeout(timer)}}
function readQueue(raw:string|null):unknown[]{if(!raw)return[];try{const parsed:unknown=JSON.parse(raw);return Array.isArray(parsed)?parsed:[]}catch{return[]}}
export async function saveSession(token:string){await SecureStore.setItemAsync(TOKEN_KEY,token)}
export async function getSession(){return SecureStore.getItemAsync(TOKEN_KEY)}
export async function clearSession(){await SecureStore.deleteItemAsync(TOKEN_KEY)}
export async function api(baseUrl:string,path:string,init:RequestInit={}){const token=await getSession();const headers=new Headers(init.headers);headers.set('Accept','application/json');if(init.body)headers.set('Content-Type','application/json');if(token)headers.set('Authorization',`Bearer ${token}`);const r=await fetchWithTimeout(baseUrl.replace(/\/$/,'')+path,{...init,headers});if(!r.ok){let message=`Request failed (${r.status})`;try{const b:unknown=await r.json();if(b&&typeof b==='object'&&typeof (b as {error?:unknown}).error==='string'&&(b as {error:string}).error)message=(b as {error:string}).error}catch{};throw Object.assign(new Error(message),{status:r.status})}if(r.status===204)return null;const text=await r.text();if(!text)return null;try{return JSON.parse(text)}catch{throw Object.assign(new Error(`Request failed (${r.status})`),{status:r.status})}}
export async function enqueueOffline(item:unknown){const queue=readQueue(await AsyncStorage.getItem(QUEUE_KEY));queue.push(item);await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(queue.slice(-100)))}
export async function drainOffline(handler:(item:unknown)=>Promise<void>){const queue:unknown[]=readQueue(await AsyncStorage.getItem(QUEUE_KEY));const failed=[];for(const item of queue){try{await handler(item)}catch{failed.push(item)}}await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(failed))}
