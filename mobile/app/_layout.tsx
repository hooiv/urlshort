import { Stack, useURL } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Alert } from 'react-native'

Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})})
export default function Layout(){
  const url=useURL()
  useEffect(()=>{if(url) Alert.alert('QuickLink link',url)},[url])
  useEffect(()=>{let cancelled=false;void (async()=>{try{const p=await Notifications.requestPermissionsAsync();if(cancelled||!p.granted)return;const token=await Notifications.getExpoPushTokenAsync();if(!cancelled&&token&&typeof token.data==='string'&&token.data)console.log('push token ready',token.data.slice(0,12))}catch(e){if(!cancelled)console.warn('push setup skipped',e instanceof Error?e.message:e)}})();return()=>{cancelled=true}},[])
  return <Stack screenOptions={{headerShown:false}}/>
}
