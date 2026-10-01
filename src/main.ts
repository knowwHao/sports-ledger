import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAccessStore } from './stores/access'
import './style.css'
import './composables/useTheme'

createApp(App).use(createPinia()).use(router).mount('#app')

// 等第一次導航跑完，#/t/:token 開啟時才不會先拿舊 token 驗證一次
void router.isReady().then(() => useAccessStore().init())
