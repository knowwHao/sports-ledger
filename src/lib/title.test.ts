import { describe, expect, it } from 'vitest'
import { composeTitle, DEFAULT_TEAM_NAME, teamNameOr } from './title'

describe('composeTitle', () => {
  it('組成「頁名｜team_name」', () => {
    expect(composeTitle('總覽', '週三匹克球')).toBe('總覽｜週三匹克球')
  })

  it('team_name 空白時用預設名稱', () => {
    expect(composeTitle('設定', '')).toBe(`設定｜${DEFAULT_TEAM_NAME}`)
    expect(composeTitle('設定', '  ')).toBe(`設定｜${DEFAULT_TEAM_NAME}`)
    expect(composeTitle('設定', null)).toBe(`設定｜${DEFAULT_TEAM_NAME}`)
  })

  it('沒有頁名或頁名等於 team_name 時只顯示一次', () => {
    expect(composeTitle(undefined, '週三匹克球')).toBe('週三匹克球')
    expect(composeTitle(DEFAULT_TEAM_NAME, '')).toBe(DEFAULT_TEAM_NAME)
    expect(composeTitle('週三匹克球', '週三匹克球')).toBe('週三匹克球')
  })
})

describe('teamNameOr', () => {
  it('去除前後空白', () => {
    expect(teamNameOr(' 週三匹克球 ')).toBe('週三匹克球')
  })
})
