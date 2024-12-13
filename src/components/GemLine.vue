<template>
  <div class="gem-line" :class="{ disabled: isDisabled }">
    <div>
      <v-select class="gem-selector" :placeholder="placeholder" v-model="model.gem" :options="gemChoices" label="name">
        <template v-slot:option="option">
          <span :class="option.type_basic">{{ option.name }}</span>
        </template>
        <template v-slot:selected-option="option">
          <span :class="option.type_basic">{{ option.name }}</span>
        </template>
      </v-select>
    </div>
    <div class="info-line">
      <div class="delete-button-box">
        <button class="delete" title="Delete" v-if="canDelete" @click="emit('delete')">🗑️</button>
      </div>
      <label>
        <input type="checkbox" v-model="model.enabled" title="enabled?" /> enabled
      </label>
      <span class="gem-info gem-type" title="gem type">{{ gemTypeString }}</span>
      <span class="gem-info gem-color" title="gem color">{{ gemColorString }}</span>
      <span class="gem-info gem-level" title="gem level">{{ model.gem?.level || '???' }}</span>
      <a v-if="poedbLink" class="gem-info gem-link" :href="poedbLink" target="_blank">PoE2DB</a>
    </div>
  </div>
</template>
<script setup lang="ts">
import { sortGems, type Gem, type GemData, type Skill, type SkillSupport } from '@/gemTypes';
import { computed } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

const model = defineModel<Skill | SkillSupport>({ default: { gem: null, enabled: false } })

const gemColors: Record<string, string> = {
  gem_red: "str",
  gem_green: "dex",
  gem_blue: "int",
  unknown: '???',
}

const poedbLink = computed(() => {
  if (!model.value.gem) return ""
  return `https://poe2db.tw/us/${model.value.gem.name.replace(/ /g, '_')}`
})

const gemColorString = computed(() => gemColors[model.value.gem?.type_basic || 'unknown'] || '???')
const gemTypeString = computed<string>(() => {
  if (model.value.gem) {
    if (model.value.gem.categories.includes("spirit")) return "Spirit"
    if (model.value.gem.categories.includes("support")) return "Support"
    // probably?
    return "Skill"
  }
  return '???'
})

const isDisabled = computed<boolean>(() => {
  if (skill && !skill.enabled) return true
  return !model.value.enabled
})

const placeholder = computed<string>(() => !skill ? "Select a skill..." : "Select a support...")

const gemChoices = computed<Gem[]>(() => {
  if (!skill) return skillGems
  return supportsFor(skill)
})

function supportsFor(skill: Skill): Gem[] {
  const res: Gem[] = [];
  let supportsOnly = true
  if (skill.gem && skill.gem.categories.includes("meta")) {
    supportsOnly = false
  }
  for (const gem of gemData.values()) {
    if (gem.categories.includes("meta")) continue
    if (!supportsOnly || gem.categories.includes("support")) {
      res.push(gem)
    }
  }
  return sortGems(res);
}

interface Props {
  gemData: GemData,
  skillGems: Gem[],
  skill?: Skill | null,
  canDelete?: boolean,
}

const { gemData, skillGems, skill = null, canDelete = false } = defineProps<Props>()

const emit = defineEmits<{
  (e: 'delete'): void
}>()


</script>

<style scoped>
.gem-line {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-bottom: 5px;
}

.delete-button-box {
  display: inline-block;
  width: 3em;
}

.info-line {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
}

.gem_red {
  color: #d20000;
}

.gem_green {
  color: #46a239;
}

.gem_blue {
  color: #8888ff;
}

.gemitem {
  color: #1ba29b;
}

.gem-info {
  display: inline-block;
  width: 3em;
  padding: 3px;
  border-radius: 3px;
  background-color: var(--color-background-soft);
}

.gem-link {
  width: auto;
}

.gem-type {
  width: 5em;
}

.gem-selector {
  flex-grow: 1;
}

:deep() {
  --vs-controls-color: var(--color-text);
  --vs-border-color: var(--color-border);

  --vs-dropdown-bg: var(--color-background-soft);
  --vs-dropdown-color: var(--color-background-mute);
  --vs-dropdown-option-color: var(--color-text);

  /* --vs-selected-bg: #664cc3; */
  /* --vs-selected-color: #eeeeee; */

  --vs-search-input-color: var(--color-text);

  --vs-dropdown-option--active-bg: var(--color-border-hover);
  /* --vs-dropdown-option--active-color: #eeeeee; */
}
</style>
