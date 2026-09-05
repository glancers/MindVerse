/** 解析消息文本中被 @ 的成员 id，按 @ 出现顺序返回（去重） */
export function parseMentions(text: string, members: { id: string; name: string }[]): string[] {
  const hits: { id: string; index: number }[] = []
  for (const m of members) {
    const index = text.indexOf(`@${m.name}`)
    if (index >= 0) hits.push({ id: m.id, index })
  }
  return hits
    .sort((a, b) => a.index - b.index)
    .map((h) => h.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
}

/** 接龙队列：成员顺序 × N 轮，去掉相邻重复（如单人群） */
export function expandRoundQueue(personaIds: string[], rounds: number): string[] {
  const queue: string[] = []
  for (let r = 0; r < rounds; r++) {
    for (const id of personaIds) {
      if (queue[queue.length - 1] !== id) queue.push(id)
    }
  }
  return queue
}
