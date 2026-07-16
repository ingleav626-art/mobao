export interface UiSlice {
  dom: Record<string, HTMLElement | null>
  _hudRoundText: HTMLElement | null
  _hudTimerText: HTMLElement | null
  _hudMoneyText: HTMLElement | null
  _timerSpan: HTMLElement | null
}

export function createUiSlice(): UiSlice {
  return {
    dom: {},
    _hudRoundText: null,
    _hudTimerText: null,
    _hudMoneyText: null,
    _timerSpan: null
  }
}

export function resetHud(s: UiSlice): void {
  s._hudRoundText = null
  s._hudTimerText = null
  s._hudMoneyText = null
  s._timerSpan = null
}