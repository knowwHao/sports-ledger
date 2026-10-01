export const DEFAULT_TEAM_NAME = '球友記帳'

export function teamNameOr(name?: string | null): string {
  return name?.trim() || DEFAULT_TEAM_NAME
}

/** 組成「頁名｜team_name」；沒有頁名或頁名就是 team_name 時只顯示 team_name */
export function composeTitle(page: string | undefined, teamName?: string | null): string {
  const team = teamNameOr(teamName)
  return !page || page === team ? team : `${page}｜${team}`
}
