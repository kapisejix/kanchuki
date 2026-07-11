import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    {
      name: 'mock-react-native',
      enforce: 'pre',
      resolveId(id) {
        // Intercept ALL react-native imports at the Vite resolver level
        if (id === 'react-native' || id.startsWith('react-native/')) {
          return '\0react-native'
        }
      },
      load(id) {
        if (id === '\0react-native') {
          // Virtual module — no filesystem access, no Flow parse error
          return [
            `import React from 'react';`,
            `function c(n) { return React.forwardRef((p, r) => { const {children:c,...rest}=p; return React.createElement(n,{...rest,r},c); }); }`,
            `const View=c('View'),Text=c('Text'),TO=c('TouchableOpacity'),SV=c('ScrollView'),FL=c('FlatList'),TI=c('TextInput'),Img=c('Image'),Modal=c('Modal'),Press=c('Pressable'),AI=c('ActivityIndicator'),SB=c('StatusBar'),KAV=c('KeyboardAvoidingView'),RC=c('RefreshControl'),Sw=c('Switch');`,
            `export {View,Text,TO as TouchableOpacity,SV as ScrollView,FL as FlatList,TI as TextInput,Img as Image,Modal,Press as Pressable,AI as ActivityIndicator,SB as StatusBar,KAV as KeyboardAvoidingView,RC as RefreshControl,Sw as Switch};`,
            `export const StyleSheet={create:s=>s,hairlineWidth:()=>.5};`,
            `export const Platform={OS:'ios',select:o=>o.ios??o.default};`,
            `export const Dimensions={get:()=>({w:390,h:844})};`,
            `export const PixelRatio={get:()=>2};`,
            `export const Animated={View:c('AV'),Text:c('AT'),Value:class V{constructor(v){this._v=v}},timing:()=>({start:c=>c?.()})};`,
            `export const Linking={canOpenURL:async()=>true,openURL:async()=>{}};`,
            `export const Alert={alert:()=>{}};`,
            `export const Vibration={vibrate:()=>{}};`,
            `export const findNodeHandle=()=>null;`,
            `export const processColor=c=>c;`,
            `export const NativeModules={};`,
            `export const UIManager={};`,
            `export const TurboModuleRegistry={get:()=>null,getEnforcing:()=>null};`,
            `export const Appearance={getColorScheme:()=>'light',addChangeListener:()=>({remove:()=>{}})};`,
            `export const AppState={currentState:'active',addEventListener:()=>({remove:()=>{}})};`,
            `export const I18nManager={isRTL:false};`,
            `export const YellowBox={ignoreWarnings:()=>{}};`,
            `export default{View,Text,TouchableOpacity:TO,ScrollView:SV,FlatList:FL,TextInput:TI,Image:Img,Modal,Pressable:Press,ActivityIndicator:AI,StatusBar:SB,KeyboardAvoidingView:KAV,RefreshControl:RC,Switch:Sw,StyleSheet,Platform,Dimensions,PixelRatio,Animated,Linking,Alert,Vibration,findNodeHandle,processColor,NativeModules,UIManager,TurboModuleRegistry,Appearance,AppState,I18nManager,YellowBox};`,
          ].join('\n')
        }
      },
    },
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.expo'],
    globals: true,
    // Inline (transform through Vite) so internal CJS require('react-native')
    // from these packages goes through our Vite plugin (not Node's resolver).
    // Regex patterns needed for pnpm's hashed virtual store paths.
    deps: {
      inline: [/@testing-library\/react-native/, 'react-native'],
    },
  },
  resolve: {
    alias: {
      '@kanchuki/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
