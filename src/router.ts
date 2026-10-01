import { createRouter, createWebHashHistory } from 'vue-router'
import { useAccessStore } from '@/stores/access'

declare module 'vue-router' {
  interface RouteMeta {
    /** 不套 AppShell 的全版頁面 */
    bare?: boolean
    title?: string
  }
}

export const router = createRouter({
  // hash 模式讓 GitHub Pages 這種純靜態主機重新整理深層網址時不會 404
  history: createWebHashHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', component: () => import('@/views/DashboardView.vue'), meta: { title: '總覽' } },
    { path: '/sessions', component: () => import('@/views/SessionsView.vue'), meta: { title: '場次' } },
    { path: '/sessions/:id', component: () => import('@/views/SessionDetailView.vue'), meta: { title: '場次詳情' } },
    { path: '/members', component: () => import('@/views/MembersView.vue'), meta: { title: '成員' } },
    { path: '/members/:id', component: () => import('@/views/MemberDetailView.vue'), meta: { title: '成員欠款' } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '設定' } },
    {
      // 球隊連結：記下 token 後以 replace 導回首頁，網址與瀏覽紀錄都不留 token，避免截圖外流
      path: '/t/:token',
      component: { render: () => null },
      beforeEnter: (to) => {
        void useAccessStore().use(String(to.params.token))
        return { path: '/', replace: true }
      },
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue'), meta: { bare: true, title: '找不到頁面' } },
  ],
})
