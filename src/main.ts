import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAccessStore } from './stores/access'
import './style.css'
import './composables/useTheme'

createApp(App).use(createPinia()).use(router).mount('#app')

// 數字欄位聚焦時滾動滑鼠滾輪，瀏覽器會一格一格改掉金額，滾動前先移開焦點
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement
    if (el instanceof HTMLInputElement && el.type === 'number') el.blur()
  },
  { passive: true, capture: true },
)

// 等第一次導航跑完，#/t/:token 開啟時才不會先拿舊 token 驗證一次
void router.isReady().then(() => useAccessStore().init())
