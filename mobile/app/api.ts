import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
const TOKEN_KEY='ql.mobile.session'
const QUEUE_KEY='ql.mobile.queue'
export async function saveSession(token:string){await SecureStore.setItemAsync(TOKEN_KEY,token)}
export async function getSession(){return SecureStore.getItemAsync(TOKEN_KEY)}
export async function clearSession(){await SecureStore.deleteItemAsync(TOKEN_KEY)}
export async function api(baseUrl:string,path:string,init:RequestInit={}){const token=await getSession();const headers=new Headers(init.headers);headers.set('Accept','application/json');if(init.body)headers.set('Content-Type','application/json');if(token)headers.set('Authorization',`Bearer ${token}`);const r=await fetch(baseUrl.replace(/\/$/,'')+path,{...init,headers});if(!r.ok){let message=`Request failed (${r.status})`;try{const b=await r.json();message=b.error||message}catch{};throw Object.assign(new Error(message),{status:r.status})}return r.json()}
export async function enqueueOffline(item:unknown){const raw=await AsyncStorage.getItem(QUEUE_KEY);const queue=raw?JSON.parse(raw):[];queue.push(item);await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(queue.slice(-100)))}
export async function drainOffline(handler:(item:unknown)=>Promise<void>){const raw=await AsyncStorage.getItem(QUEUE_KEY);const queue:unknown[]=raw?JSON.parse(raw):[];const failed=[];for(const item of queue){try{await handler(item)}catch{failed.push(item)}}await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(failed))}
