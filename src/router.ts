import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
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
    { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: '管理員登入' } },
    // 分享頁不設頁名，標題只顯示 team_name
    { path: '/s/:token', component: () => import('@/views/ShareView.vue'), meta: { public: true } },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue'), meta: { public: true, title: '找不到頁面' } },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const auth = useAuthStore()
  await auth.init()
  if (!auth.isAdmin) return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  return true
})
