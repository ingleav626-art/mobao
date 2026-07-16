import type { GameSettingsData } from "../settings"
import { loadGameSettings, saveGameSettings, defaultGameSettings } from "../settings"

export interface SettingsSlice extends GameSettingsData {
  dirty: boolean
}

export function createSettingsSlice(): SettingsSlice {
  const s = loadGameSettings()
  return {
    maxRounds: s.maxRounds,
    actionsPerRound: s.actionsPerRound,
    roundSeconds: s.roundSeconds,
    directTakeRatio: s.directTakeRatio,
    bidRevealIntervalMs: s.bidRevealIntervalMs,
    postRevealWaitMs: s.postRevealWaitMs,
    bidStep: s.bidStep,
    bidDefaultRaise: s.bidDefaultRaise,
    settlementSpeedMultiplier: s.settlementSpeedMultiplier,
    musicVolume: s.musicVolume,
    sfxVolume: s.sfxVolume,
    dirty: false
  }
}

export function save(s: SettingsSlice): void {
  saveGameSettings(s)
  s.dirty = false
}

export function reset(s: SettingsSlice): void {
  const d = defaultGameSettings()
  s.maxRounds = d.maxRounds
  s.actionsPerRound = d.actionsPerRound
  s.roundSeconds = d.roundSeconds
  s.directTakeRatio = d.directTakeRatio
  s.bidRevealIntervalMs = d.bidRevealIntervalMs
  s.postRevealWaitMs = d.postRevealWaitMs
  s.bidStep = d.bidStep
  s.bidDefaultRaise = d.bidDefaultRaise
  s.settlementSpeedMultiplier = d.settlementSpeedMultiplier
  s.musicVolume = d.musicVolume
  s.sfxVolume = d.sfxVolume
  s.dirty = true
}