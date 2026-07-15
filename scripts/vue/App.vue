<template>
  <div id="vue-root">
    <Hud />
    <CollectionPanel />
    <SettingsOverlay />
    <SidePanels />
    <ItemDrawer />
    <ConfirmDialog />
    <InfoPopup />
    <BattleRecordPanel />
  </div>
</template>

<script setup lang="ts">
import Hud from "./components/Hud.vue"
import CollectionPanel from "./components/CollectionPanel.vue"
import SettingsOverlay from "./components/SettingsOverlay.vue"
import SidePanels from "./components/SidePanels.vue"
import ItemDrawer from "./components/ItemDrawer.vue"
import ConfirmDialog from "./components/ConfirmDialog.vue"
import InfoPopup from "./components/InfoPopup.vue"
import BattleRecordPanel from "./components/BattleRecordPanel.vue"
</script>
