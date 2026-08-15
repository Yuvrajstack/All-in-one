export class PriorityEngine {

  // ─── MAIN SCORE CALCULATOR ───────────────────────────────
  calculate(params: {
    daysSinceCreated: number
    accessCount:      number
    maxAccessCount:   number
    emotionalWeight:  number
    source:           string
  }): number {

    const recency      = this.recencyScore(params.daysSinceCreated)
    const accessFreq   = this.accessFrequencyScore(params.accessCount, params.maxAccessCount)
    const emotional    = params.emotionalWeight        // already 0-1
    const sourcePrio   = this.sourceScore(params.source)
    const entity       = 0.5                           // default for now

    // weighted formula from PAC doc
    const importance =
      (recency    * 0.30) +
      (accessFreq * 0.25) +
      (emotional  * 0.20) +
      (sourcePrio * 0.15) +
      (entity     * 0.10)

    // clamp between 0 and 1
    return Math.min(1, Math.max(0, importance))
  }

  // ─── RECENCY SCORE ───────────────────────────────────────
  // Ebbinghaus forgetting curve: e^(-0.05 * days)
  // yesterday = high, 6 months ago = very low
  private recencyScore(daysSinceCreated: number): number {
    return Math.exp(-0.05 * daysSinceCreated)
  }

  // ─── ACCESS FREQUENCY SCORE ──────────────────────────────
  // how often this memory was read vs most read memory
  private accessFrequencyScore(
    accessCount:    number,
    maxAccessCount: number
  ): number {
    if (maxAccessCount === 0) return 0
    return Math.log(1 + accessCount) / Math.log(1 + maxAccessCount)
  }

  // ─── SOURCE PRIORITY SCORE ───────────────────────────────
  private sourceScore(source: string): number {
    const scores: Record<string, number> = {
      calendar: 0.95,
      gmail:    0.85,
      github:   0.80,
      manual:   0.70,
    }
    return scores[source] ?? 0.50
  }
}