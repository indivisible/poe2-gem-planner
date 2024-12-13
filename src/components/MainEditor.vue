<template>
  <div class="editor-main">
    <div class="summary">
      <div>
        <h1>
          Path of Exile 2 gem planner
        </h1>
      </div>
      <div class="help-section">
        <a class="help-button" @click="enableHelp = !enableHelp">help</a>
        <div v-if="enableHelp" class="help-text">
          <p>
            This tool is meant to help sharing gem setups and planning attribute cost
            for Path of Exile 2 builds.
          </p>
          <p>
            Add new skill groups with the "Add Skill" button. The text input at top
            is meant to name the group, if left empty it will show the main skill's
            name.
          </p>
          <p>
            With the 1st dropdown you can select the main skill of the group. After
            that's set, you can add supports to it with the "Add support" button.
          </p>
          <p>
            Normal skills can be supported by any support gem, while "meta" skills can
            be supported by any support or skill gem.
          </p>
          <p>
            You can add a name and some notes with the edit buttons just below this help section.
          </p>
          <p>
            Support gems where "enabled" is not checked will be ignored for requirements. If the main gem is not enabled
            all linked supports will be ignored.
          </p>
          <p>
            For normal gems you will see the gem's base attribute, category, and minimum gem level / tier below the
            dropdown. It should help finding how to obtain specific gems.
          </p>
          <p>
            You can "save" the build with the "Save to URL" button. This won't really
            save it in any meaningful way, but will update the page's address bar
            to link to the build. You can share this URL with others, and they will see
            the build you made. Modifications can't be made to a build you've shared,
            you will have to generate and share the URL again.
          </p>
          <p>
            You can reorder skills and move supports between them by drag and
            dropping the three-line handles.
          </p>
          <p>
            Some limitations:
          </p>
          <ul>
            <li>This tool can't tell you if the supports will work with the
              skills you've chosen</li>
            <li>Skill attribute requirements and spirit costs are not tracked</li>
            <li>Since all data is saved into the URL, you can't leave long notes.
              Also the generated URLs will be super long, and if it gets too long it won't work!</li>
            <li>It does not check for duplicate gems.</li>
            <li>You can add more skills and supports than is actually possible in game.</li>
            <li>Yes, there is a skill called Unleash, and also a support gem called Unleash.</li>
            <li>The UX is bad and the UI is ugly. I know.</li>
          </ul>
          <p>
            You can try to contact tobaccoroad on discord if you find a bug not
            mentioned here, or maybe check the <a href="https://github.com/indivisible/poe2-gem-planner"
              target="_blank">code on GitHub</a> and fix it yourself.
          </p>
        </div>
      </div>
      <div class="button-bar">
        <button @click="save">Save to URL</button>
        <button class="reset" @click="startReset">Reset build</button>
      </div>
      <div>
        <h3 class="build-name">
          <button @click="renameBuild" title="edit name">📝</button>
          {{ state.name || '(Unnamed build)' }}
        </h3>
      </div>
      <div v-if="!enableNoteEditor">
        <pre class="build-notes">{{ state.notes || '(no notes)' }}</pre>
        <button @click="startEditNotes">📝 Edit notes</button>
      </div>
      <div v-else class="notepad">
        <textarea v-model="editedNotes"></textarea>
        <div class="button-bar">
          <button @click="saveNotes">Save</button>
          <button @click="enableNoteEditor = false">Cancel</button>
        </div>
      </div>
      <table>
        <caption>support gem requirements</caption>
        <thead>
          <tr>
            <th scope="col">stat</th>
            <th scope="col"># supports</th>
            <th scope="col">required</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">STR:</th>
            <td>{{ numAttr("red") }}</td>
            <td>{{ numAttr('red') * 5 }}</td>
          </tr>
          <tr>
            <th scope="row">DEX:</th>
            <td>{{ numAttr("green") }}</td>
            <td>{{ numAttr('green') * 5 }}</td>
          </tr>
          <tr>
            <th scope="row">INT:</th>
            <td>{{ numAttr("blue") }}</td>
            <td>{{ numAttr('blue') * 5 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <draggable tag="ul" class="skills" v-model="state.skills" group="skills" item-key="randomId" handle=".handle">
      <template #item="{ element: skill, index: skillIdx }">
        <li class="skill-item" :class="{ disabled: !skill.enabled }">
          <span class="handle">&#8801;</span>
          <button class="delete" title="Delete skill" @click="deleteSkill(skillIdx)">🗑️</button>
          <input type="text" :placeholder="skill.gem?.name || '(no skill or label)'" title="Label"
            v-model="skill.label" />
          <!-- <ul class="socket-group"> -->
          <draggable tag="ul" class="support-group" v-model="skill.supports" group="supports" item-key="randomId"
            handle=".handle">
            <template #header>
        <li class="main-gem">
          <span class="no-handle"></span>
          <GemLine v-model="state.skills[skillIdx]" :skill-gems="allMainGems" :gem-data="gemData" />
        </li>
      </template>
      <template #item="{ index: supportIdx }">
        <li>
          <span class="handle">&#8801;</span>
          <GemLine :can-delete="true" @delete="deleteSupport(skill, supportIdx)" v-model="skill.supports[supportIdx]"
            :skill-gems="allMainGems" :gem-data="gemData" :skill="skill" />
        </li>
      </template>
      <template #footer>
        <li class="add-item">
          <button :disabled="skill.supports.length >= 15" @click="addSkillSupport(skill)">Add support</button>
        </li>
      </template>
      <!-- </ul> -->
    </draggable>
    </li>
</template>
<template #footer>
  <li class="add-item"><button @click="addSkill">Add skill</button></li>
</template>
</draggable>
</div>
</template>

<script setup lang="ts">
import { decodeState, encodeState, sortGems, type EditorState, type Gem, type GemData, type Skill, type SkillSupport } from '@/gemTypes';
import { computed, onMounted, reactive, ref } from 'vue';
import 'vue-select/dist/vue-select.css';
import GemLine from './GemLine.vue';
import draggable from 'vuedraggable'

const allMainGems = computed<Gem[]>(() => {
  const res = Array.from(props.gemData.values()).filter(gem => !gem.categories.includes("support"))
  return sortGems(res)
})

const enableNoteEditor = ref(false)
const editedNotes = ref("")
const enableHelp = ref(false)

function numAttr(attr: string) {
  const typeBasic = "gem_" + attr
  let count = 0
  for (const skill of state.skills) {
    if (!skill.enabled) continue
    for (const support of skill.supports) {
      if (!support.enabled || !support.gem || !support.gem.categories.includes("support")) continue
      if (support.gem.type_basic == typeBasic)
        count++;
    }
  }
  return count
}

function startReset() {
  if (confirm("This will delete everything! Are you sure?"))
    reset()
}

function startEditNotes() {
  editedNotes.value = state.notes
  enableNoteEditor.value = true;
}

function saveNotes() {
  state.notes = editedNotes.value
  enableNoteEditor.value = false
}

function renameBuild() {
  const res = prompt("Build name:", state.name)
  if (res === null) return
  state.name = res
}

function deleteSkill(skillIdx: number) {
  if (confirm("Are you sure you want to delete this?")) {
    state.skills.splice(skillIdx, 1)
  }
}

function deleteSupport(skill: Skill, supportIdx: number) {
  if (confirm("Are you sure you want to delete this?")) {
    skill.supports.splice(supportIdx, 1)
  }
}

async function save() {
  const encoded = await encodeState(state)
  const newUrl = String(new URL("#" + encoded, String(location)))
  history.pushState({}, "", newUrl)
}

async function load() {
  if (location.hash.length <= 1) return
  const encoded = location.hash.slice(1)
  const newState = await decodeState(props.gemData, encoded)
  state.skills = newState.skills
  state.name = newState.name
  state.notes = newState.notes
}

async function reset() {
  state.skills = []
  state.name = ""
  state.notes = ""
}

const props = defineProps<{
  gemData: GemData,
}>()

const state = reactive<EditorState>({ name: "", notes: "", skills: [] })

function addSkill() {
  const skill: Skill = {
    randomId: Math.random(),
    label: "",
    gem: null,
    enabled: true,
    supports: [],
  }
  state.skills.push(skill)
}

function addSkillSupport(skill: Skill) {
  const sup: SkillSupport = {
    randomId: Math.random(),
    enabled: true,
    gem: null,
  }
  skill.supports.push(sup)
}

onMounted(() => {
  load()
})

</script>

<style scoped>
td,
th {
  text-align: center;
  border: 1px solid #333;
}

th {
  font-weight: bold;
}

.editor-main {
  max-width: 50em;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 15em;
}

ul {
  list-style-type: none;
}

ul.support-group li {
  display: flex;
}

.skills {
  padding-left: 0;
}

.handle {
  display: inline-block;
  text-align: center;
  justify-content: center;
  font-size: 25px;
  width: 1.2em;
  cursor: move;
}

.no-handle {
  font-size: 25px;
  width: 1.2em;
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}

.summary>* {
  max-width: 100%;
}

.button-bar {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.reset {
  background-color: rgba(235, 0, 0, 0.3);
}

.notepad {
  width: 100%;
}

.notepad textarea {
  width: 100%;
  height: 20em;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.help-section ul {
  list-style-type: disc;
}

.help-button {
  cursor: pointer;
}

.help-text>* {
  padding-bottom: 1em;
}

.help-text>p {
  text-indent: 1em;
}

.build-notes {
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 15px;
  max-width: 100%;
}
</style>
