
export type Gem = {
  id: number,
  name: string,
  level: number,
  type_basic: string,
  tags: string[],
  categories: string[],
}

export type GemData = Map<number, Gem>

export type SkillSupport = {
  randomId: number,
  enabled: boolean,
  gem: Gem | null,
}

export type Skill = {
  randomId: number,
  label: string,
  gem: Gem | null,
  enabled: boolean,
  supports: SkillSupport[]
}

export type EditorState = {
  name: string
  notes: string
  skills: Skill[]
}

export async function loadGemData(): Promise<GemData> {
  const reply = await fetch("poe2gems.json")
  const data: Gem[] = await reply.json()
  if (!data) { throw "no gem data" }
  return new Map(data.map(gem => [gem.id, gem]))
}

async function runThrough(raw: Blob, transform: DecompressionStream | CompressionStream) {
  const stream = raw.stream();

  const transformedStream = stream.pipeThrough<Uint8Array>(
    transform
  );

  // Read all the bytes from this stream.
  const chunks = [];
  const reader = transformedStream.getReader()
  for (; ;) {
    const { value, done } = await reader.read()
    if (value) {
      chunks.push(value)
    }
    if (done) break
  }
  return new Blob(chunks);
}

async function compress(src: Blob) {
  return await runThrough(src,
    new CompressionStream("deflate-raw")
  );
}

async function decompress(src: Blob) {
  return await runThrough(src,
    new DecompressionStream("deflate-raw")
  );
}

async function blobToBase64(blob: Blob) {
  const fr = new FileReader()
  const fut = new Promise<string>(resolve => {
    fr.onloadend = () => resolve(fr.result as string)
  })
  fr.readAsDataURL(blob)
  const res = await fut
  return res.replace(/^data:[^;]*;base64,/, '')
}

export async function encodeState(state: EditorState) {
  const raw = await encodeStateBitInts(state)
  return "1" + await blobToBase64(raw)
}

function encodeGem(skill: Skill | SkillSupport) {
  const chunk = new ArrayBuffer(3)
  const dw = new DataView(chunk)
  dw.setInt8(0, skill.enabled ? 1 : 0)
  const gemId = skill.gem?.id || 0
  dw.setInt16(1, gemId)
  return chunk
}

function decodeGem(gems: GemData, view: DataView, pos: number) {
  const enabled = !!view.getInt8(pos)
  const gemId = view.getInt16(pos + 1)
  let gem: Gem | null = null
  if (gemId) {
    gem = gems.get(gemId) || null
    if (!gem) throw `invalid gem id ${gemId}`
  }
  return { enabled, gem, pos: pos + 3 }
}

const GEM_ID_BITSIZE = 12
const NUM_SKILLS_BITSIZE = 5
const STRINGTABLE_REFSIZE = 6
const NUM_SUPPORTS_BITSIZE = 4
const STRINGTABLE_BITSIZE = 16

class StringTableWriter {
  protected strings: string[] = []
  protected names: Map<string, number> = new Map()
  constructor(protected writer: BitIntegerWriter, protected refSize: number) { }

  add(name: string, value: string) {
    const trimmed = value.replace(/\r/g, "").replace(/\x00/g, " ").trim()
    if (!trimmed.length) {
      this.names.set(name, -1)
      return -1
    }

    let idx = this.strings.indexOf(trimmed)
    if (idx < 0) {
      idx = this.strings.length
      this.strings.push(trimmed)
    }
    this.names.set(name, idx)
    return idx
  }

  async writeStringTable(lenBits: number) {
    await this.writer.writeCompressedString(this.strings.join("\x00"), lenBits)
  }

  writeRef(name: string) {
    const idx = this.names.get(name)
    if (idx === undefined) throw `unknown name ${name}`
    if (idx < 0) {
      // mark string as absent
      this.writer.write(0, 1)
      return
    }
    this.writer.write(1, 1)
    this.writer.write(idx, this.refSize)
  }
}

class StringTableReader {
  protected strings: string[] = []

  constructor(protected reader: BitIntegerReader, protected refSize: number) { }

  async readTable(lenBits: number) {
    const raw = await this.reader.readCompressedString(lenBits)
    this.strings = raw.split("\x00")
  }

  readRef(): string {
    if (!this.reader.read(1)) {
      return ""
    }
    const idx = this.reader.read(this.refSize)
    return this.strings[idx]
  }
}

async function encodeStateBitInts(state: EditorState) {
  const writer = new BitIntegerWriter()
  const stringTable = new StringTableWriter(writer, STRINGTABLE_REFSIZE)
  for (const skill of state.skills) {
    const name = `skill-${skill.randomId}`
    stringTable.add(name, skill.label)
  }
  stringTable.add("build-name", state.name)
  stringTable.add("build-notes", state.notes)
  await stringTable.writeStringTable(STRINGTABLE_BITSIZE)
  stringTable.writeRef("build-name")
  stringTable.writeRef("build-notes")
  writer.write(state.skills.length, NUM_SKILLS_BITSIZE)
  for (let skillIdx = 0; skillIdx < state.skills.length; skillIdx++) {
    const skill = state.skills[skillIdx]
    writer.write(+skill.enabled, 1)
    const gemId = skill.gem?.id || 0
    writer.write(gemId, GEM_ID_BITSIZE)
    const name = `skill-${skill.randomId}`
    stringTable.writeRef(name)
    writer.write(skill.supports.length, NUM_SUPPORTS_BITSIZE)
    for (const sup of skill.supports) {
      writer.write(+sup.enabled, 1)
      writer.write(sup.gem?.id || 0, GEM_ID_BITSIZE)
    }
  }
  return writer.getBlob()
}

async function decodeStateV1(gems: GemData, raw: Uint8Array): Promise<EditorState> {
  const reader = new BitIntegerReader(raw)
  const stringTable = new StringTableReader(reader, STRINGTABLE_REFSIZE)
  await stringTable.readTable(STRINGTABLE_BITSIZE)
  const name = stringTable.readRef()
  const notes = stringTable.readRef()
  const numSkills = reader.read(NUM_SKILLS_BITSIZE)
  const skills: Skill[] = []
  for (let skillIdx = 0; skillIdx < numSkills; skillIdx++) {
    const enabled = Boolean(reader.read(1))
    const gemId = reader.read(GEM_ID_BITSIZE)
    const gem: Gem | null = gems.get(gemId) || null
    const label = stringTable.readRef()
    const numSupports = reader.read(NUM_SUPPORTS_BITSIZE)
    const supports: SkillSupport[] = []
    for (let supportIdx = 0; supportIdx < numSupports; supportIdx++) {
      const enabled = Boolean(reader.read(1))
      const gemId = reader.read(GEM_ID_BITSIZE)
      supports.push({
        gem: gems.get(gemId) || null,
        enabled,
        randomId: Math.random()
      })
    }
    skills.push({
      enabled,
      gem,
      label,
      supports,
      randomId: Math.random()
    })
  }
  return { name, notes, skills }
}

class BitIntegerReader {
  protected bitPos = 0;
  protected bytePos = 0;
  protected textDecoder = new TextDecoder()
  constructor(protected src: Uint8Array) { }

  read(numBits: number): number {
    let res: number = 0
    let offset = 0
    while (numBits > 0) {
      const size = Math.min(numBits, 8 - this.bitPos)
      const mask = (2 ** size) - 1
      const v = (this.src[this.bytePos] >> this.bitPos) & mask
      res = res | (v << offset)
      this.bitPos = (this.bitPos + size) % 8
      if (this.bitPos == 0) this.bytePos++
      numBits -= size
      offset += size
    }
    return res
  }

  async readCompressedString(lenBits: number): Promise<string> {
    const length = this.read(lenBits)
    if (length == 0) return ""
    if (this.bitPos != 0) this.bytePos++
    const compressed = this.src.slice(this.bytePos, this.bytePos + length)
    const decompressed = await decompress(new Blob([compressed]))
    this.bitPos = 0
    this.bytePos += length
    return this.textDecoder.decode(await decompressed.arrayBuffer())
  }

  readString(lenBits: number): string {
    const length = this.read(lenBits)
    if (length == 0) return ""

    if (this.bitPos != 0) this.bytePos++
    const raw = this.src.slice(this.bytePos, this.bytePos + length)
    this.bytePos += length
    this.bitPos = 0
    return this.textDecoder.decode(raw)
  }
}

class BitIntegerWriter {
  protected bytes: number[] = []
  protected bitPos = 0;
  protected textEncoder = new TextEncoder()
  constructor() { }

  getBlob(): Blob {
    return new Blob([new Uint8Array(this.bytes)])
  }

  write(value: number, numBits: number) {
    if (value < 0) throw "negative value"
    if (value >= 2 ** numBits) throw "value too big"
    let leftBits = numBits
    while (leftBits > 0) {
      const maskSize = Math.min(leftBits, 8 - this.bitPos)
      const mask = (2 ** maskSize) - 1
      const v = value & mask;
      if (this.bitPos == 0) {
        this.bytes.push(v)
      } else {
        // bitPos is only non-zero if we have already britten something
        const old = this.bytes.pop()!
        this.bytes.push(old | (v << this.bitPos))
      }
      this.bitPos = (this.bitPos + maskSize) % 8
      leftBits -= maskSize
      value >>= maskSize
    }
  }

  async writeCompressedString(value: string, lenBits: number) {
    const encoded = this.textEncoder.encode(value)
    if (!encoded.length) {
      this.write(0, lenBits)
      return
    }
    const compressed = await compress(new Blob([encoded]))
    const buf = new Uint8Array(await compressed.arrayBuffer())
    this.write(buf.length, lenBits)
    this.bytes.push(...buf)
    this.bitPos = 0
  }

  writeString(value: string, lenBits: number) {
    const encoded = this.textEncoder.encode(value)
    if (encoded.length >= 2 ** lenBits) throw "string too long"
    this.write(encoded.length, lenBits)
    if (encoded.length > 0) {
      this.bytes.push(...encoded)
      this.bitPos = 0
    }
  }
}

async function encodeStateSimple(state: EditorState) {
  // format "0"
  if (state.skills.length >= 256) {
    throw "wow that's way too many skills"
  }
  const encoder = new TextEncoder()
  const chunks: (ArrayBuffer | Uint8Array)[] = []
  chunks.push(new Uint8Array([state.skills.length]))
  for (const skill of state.skills) {
    if (skill.label.length >= 256) throw "too long label"
    chunks.push(new Uint8Array([skill.label.length]))
    const encoded = encoder.encode(skill.label)
    chunks.push(encoded)

    chunks.push(encodeGem(skill))
    chunks.push(new Uint8Array([skill.supports.length]))
    for (const support of skill.supports) {
      chunks.push(encodeGem(support))
    }
  }
  return await compress(new Blob(chunks))
}

async function decodeStateV0(gems: GemData, raw: Uint8Array): Promise<EditorState> {
  const uncompressed = await decompress(new Blob([raw]))
  const view = new DataView(await uncompressed.arrayBuffer())
  let pos = 0
  const numSkills = view.getInt8(pos++)
  const decoder = new TextDecoder()
  const skills: Skill[] = []
  for (let i = 0; i < numSkills; i++) {
    const labelLength = view.getInt8(pos++)
    const labelRaw = view.buffer.slice(pos, pos + labelLength)
    const label = decoder.decode(labelRaw)
    pos += labelLength
    const skillRes = decodeGem(gems, view, pos)
    pos = skillRes.pos
    const numSupports = view.getInt8(pos++)
    const supports: SkillSupport[] = []
    for (let j = 0; j < numSupports; j++) {
      const res = decodeGem(gems, view, pos)
      pos = res.pos
      supports.push({
        randomId: Math.random(),
        enabled: res.enabled,
        gem: res.gem,
      })
    }
    skills.push({
      randomId: Math.random(),
      label,
      enabled: skillRes.enabled,
      gem: skillRes.gem,
      supports,
    })
  }
  return { name: "", notes: "", skills }
}

export async function decodeState(gems: GemData, rawString: string): Promise<EditorState> {
  const marker = rawString[0]
  const raw = Uint8Array.from(atob(rawString.slice(1)), c => c.charCodeAt(0))
  try {
    switch (marker) {
      case "0": return await decodeStateV0(gems, raw)
      case "1": return await decodeStateV1(gems, raw)
    }
  } catch (e) {
    console.error("could not decode state:", e)
    throw e
  }
  throw new Error(`unknown version ${marker}`)
}

export function sortGems(gems: Gem[]) {
  return gems.sort((a, b) => {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })
}

