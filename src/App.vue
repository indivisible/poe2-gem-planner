<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadGemData, type GemData } from './gemTypes';
import MainEditor from './components/MainEditor.vue';

const gemData = ref<GemData>()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    gemData.value = await loadGemData()
  } catch (e) {
    console.error("could not load data:", e)
    error.value = String(e)
  }
})

</script>

<template>
  <main>
    <h3 v-if="error" class="error">Could not load gem data: {{ error }}</h3>
    <h3 v-else-if="!gemData" class="loading">Loading...</h3>
    <MainEditor :gem-data="gemData" v-else />
  </main>
</template>
