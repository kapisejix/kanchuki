import { useEffect } from 'react'
import { router } from 'expo-router'
import { View } from 'react-native'

export default function AddTabRedirect() {
  useEffect(() => {
    router.replace('/product/add')
  }, [])
  return <View className="flex-1 bg-cotton" />
}

