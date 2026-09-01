import { Stack, useURL } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Alert } from 'react-native'
import { saveSession } from './api'

Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})})
export default function Layout(){
  const url=useURL()
  useEffect(()=>{if(url) Alert.alert('QuickLink link',url)},[url])
  useEffect(()=>{void Notifications.requestPermissionsAsync().then(async p=>{if(p.granted){const token=await Notifications.getExpoPushTokenAsync();console.log('push token ready',token.data.slice(0,12))}})},[])
  return <Stack screenOptions={{headerShown:false}}/>
}
