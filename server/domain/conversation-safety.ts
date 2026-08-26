// [R6] The bounded conversational layer's structural guardrails: a deterministic pre-filter on
// user input and a deterministic post-filter on model output. Neither is a model call — both
// are lexicon/pattern matches over plain strings, on purpose. A system prompt is not a testable
// safety mechanism ("the prompt tells it not to" cannot be verified); these two functions are
// what actually enforce rule R6, and docs/llm-safety-tests.md is the adversarial evidence that
// they do. Deliberately zero imports, same discipline as triage.ts: these are pure functions of
// their input string, structurally incapable of depending on a model, a service, or the network.
//
// Bias throughout: a false positive here (routing someone to the crisis page, or replacing a
// safe response with a fallback, when it wasn't strictly necessary) costs a little friction. A
// false negative costs a crisis message reaching an LLM, or an unsafe claim reaching a person
// screening for depression and anxiety. Every list below is written to over-trigger rather than
// under-trigger.

export interface FilterResult {
  triggered: boolean
  reason: string | null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

function includesAny(normalized: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => normalized.includes(phrase))
}

// ---------------------------------------------------------------------------------------------
// PRE-FILTER — deterministic crisis-indicator check on user input (rule R6, R7)
// ---------------------------------------------------------------------------------------------
// Phrase-level, not single-word, matching: a bare word like "kill" alone is too noisy ("killing
// it at my job"), but these phrases are specific enough to be low-noise while still being
// substring matches that survive most adversarial wrapping ("hypothetically, if someone wanted
// to kill myself..." still contains "kill myself" and still fires).

const SELF_HARM_PHRASES: readonly string[] = [
  'kill myself',
  'end my life',
  'ending my life',
  'kill yourself',
  'want to die',
  'wish i was dead',
  'wish i were dead',
  'better off dead',
  'no reason to live',
  'not worth living',
  'nothing to live for',
  'hurt myself',
  'hurting myself',
  'hurt yourself',
  'hurting yourself',
  'harm myself',
  'harm yourself',
  'harming yourself',
  'self-harm',
  'self harm',
  'cut myself',
  'cutting myself',
  'cut yourself',
  'cutting yourself',
  'overdose',
  'take my own life',
  'taking my own life',
  'suicide',
  'suicidal',
  "don't want to be alive",
  'do not want to be alive',
  "don't want to live",
  'do not want to live',
  'planning to kill myself',
  'going to kill myself',
  'ready to die',
  'want to disappear forever',
  'end your life',
  'ending your life',
  'end their life',
  'ending their life',
  'end his life',
  'end her life'
]

const HARM_TO_OTHERS_PHRASES: readonly string[] = [
  'kill him',
  'kill her',
  'kill them',
  'kill someone',
  'hurt someone',
  'hurt him',
  'hurt her',
  'hurt them',
  'going to hurt',
  'want to hurt',
  'planning to hurt',
  'attack someone',
  'planning to attack'
]

const ACUTE_DISTRESS_PHRASES: readonly string[] = [
  "can't take it anymore",
  'cannot take it anymore',
  "can't cope anymore",
  'cannot cope anymore',
  'having a breakdown',
  'having a mental breakdown',
  'losing control of myself',
  'in crisis right now',
  "i'm in crisis",
  'i am in crisis'
]

// [R6][R7] Pure, synchronous, no I/O — same discipline as getCrisisResponse() in
// server/domain/safety.ts, because this is what decides whether the LLM is ever reached at
// all. Called before server/services/conversation/orchestrate.ts does anything else; if this
// returns triggered: true, the LLM is never invoked for that turn.
export function checkCrisisIndicators(text: string): FilterResult {
  const normalized = normalize(text)

  if (includesAny(normalized, SELF_HARM_PHRASES)) return { triggered: true, reason: 'self-harm' }
  if (includesAny(normalized, HARM_TO_OTHERS_PHRASES)) {
    return { triggered: true, reason: 'harm-to-others' }
  }
  if (includesAny(normalized, ACUTE_DISTRESS_PHRASES)) {
    return { triggered: true, reason: 'acute-distress' }
  }
  return { triggered: false, reason: null }
}

// ---------------------------------------------------------------------------------------------
// POST-FILTER — deterministic safety check on model output (rule R6)
// ---------------------------------------------------------------------------------------------

// "you have/are/were [disorder]", "diagnosed with", "your diagnosis is" — conclusive
// second-person statements, not general psychoeducation about what a disorder is.
const DIAGNOSTIC_CLAIM_PATTERNS: readonly RegExp[] = [
  /\byou\s+(?:have|are|were|'re)\s+(?:been\s+)?(?:diagnosed\s+with\s+)?(?:mild|moderate|severe|clinical(?:ly)?)?\s*(depression|anxiety|generalized anxiety disorder|major depressive disorder|bipolar disorder|ptsd|ocd|panic disorder|social anxiety disorder|depressed|anxious)\b/i,
  /\byour diagnosis is\b/i,
  /\bi diagnose you\b/i,
  /\byou suffer from\b/i,
  /\byou have been diagnosed\b/i,
  /\bthis (?:means|confirms|indicates) you have\b/i,
  /\byou definitely have\b/i
]

// Common psychiatric medication names plus generic dosage/prescription language. Not
// exhaustive of every drug on Earth — exhaustive of the ones a model is plausibly going to
// reach for, which is what a lexicon like this needs to cover.
const MEDICATION_LEXICON: readonly string[] = [
  'sertraline',
  'zoloft',
  'fluoxetine',
  'prozac',
  'escitalopram',
  'lexapro',
  'citalopram',
  'celexa',
  'paroxetine',
  'paxil',
  'venlafaxine',
  'effexor',
  'duloxetine',
  'cymbalta',
  'bupropion',
  'wellbutrin',
  'mirtazapine',
  'remeron',
  'trazodone',
  'alprazolam',
  'xanax',
  'diazepam',
  'valium',
  'lorazepam',
  'ativan',
  'clonazepam',
  'klonopin',
  'antidepressant',
  'anti-depressant',
  'benzodiazepine',
  'ssri',
  'snri',
  'medication dosage',
  'prescription dose',
  'prescribe you'
]
const DOSAGE_PATTERN = /\b\d+\s?(?:mg|milligrams?)\b/i

const CLINICAL_DIRECTIVE_PATTERNS: readonly RegExp[] = [
  /\byou should take\b/i,
  /\bi recommend you take\b/i,
  /\bincrease your dose\b/i,
  /\bstop taking your\b/i,
  /\bi'?m prescribing\b/i,
  /\byour treatment (?:plan )?should be\b/i,
  /\byou must begin treatment with\b/i,
  /\byou need to be on medication\b/i
]

const CLINICIAN_CLAIM_PHRASES: readonly string[] = [
  'as your therapist',
  'as your doctor',
  'as a clinician',
  'as your clinician',
  'as your psychiatrist',
  'as your psychologist',
  'as your counsellor',
  'as your counselor',
  'i am a licensed',
  "i'm a licensed",
  'in my clinical opinion',
  'in my professional opinion as a',
  'speaking as your mental health provider',
  'as a mental health professional',
  'i am a therapist',
  "i'm a therapist",
  'i am a doctor',
  "i'm a doctor",
  'i am your psychiatrist',
  'i am a licensed clinician'
]

// [R6] Defense-in-depth beyond the four categories rule R6 names explicitly: the system prompt
// (server/services/conversation/system-prompt.ts) also forbids the assistant giving crisis
// instructions of its own, deferring instead to the single reviewed static pathway
// (server/domain/safety.ts). If crisis language still appears in *output*, that's either the
// assistant drifting into it unprompted or the pre-filter having missed something on the way
// in — either way it should never reach the person as if it were considered, reviewed guidance.
const SYSTEM_PROMPT_NGRAM_SIZE = 8
const SYSTEM_PROMPT_NGRAM_MIN_LENGTH = 20

// [R6] Detects verbatim (or near-verbatim) leakage of the system prompt by sliding an 8-word
// window over it and checking whether any window also appears in the output. Generic on
// purpose — no hand-maintained list of "distinctive phrases" to keep in sync as the prompt
// changes, just "does the output contain a chunk of the prompt." A *paraphrased* leak (the
// model explains its instructions in its own words rather than quoting them) is a known,
// honestly-documented limitation of this approach — see docs/llm-safety-tests.md.
function containsSystemPromptFragment(text: string, systemPrompt: string): boolean {
  const normalizedOutput = normalize(text)
  const promptWords = normalize(systemPrompt).split(' ')

  for (let i = 0; i + SYSTEM_PROMPT_NGRAM_SIZE <= promptWords.length; i += 1) {
    const gram = promptWords.slice(i, i + SYSTEM_PROMPT_NGRAM_SIZE).join(' ')
    if (gram.length >= SYSTEM_PROMPT_NGRAM_MIN_LENGTH && normalizedOutput.includes(gram)) {
      return true
    }
  }
  return false
}

// [R6] systemPrompt is accepted as a parameter, not imported, so this file stays at zero
// imports (same discipline as triage.ts) — the caller (server/services/conversation/
// orchestrate.ts) passes CONVERSATION_SYSTEM_PROMPT in; omitting it just skips that one check,
// which is only ever done in a test exercising this function in isolation.
export function checkOutputSafety(text: string, systemPrompt?: string): FilterResult {
  const normalized = normalize(text)

  if (DIAGNOSTIC_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) {
    return { triggered: true, reason: 'diagnostic-claim' }
  }
  if (includesAny(normalized, MEDICATION_LEXICON) || DOSAGE_PATTERN.test(text)) {
    return { triggered: true, reason: 'medication-reference' }
  }
  if (CLINICAL_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { triggered: true, reason: 'clinical-directive' }
  }
  if (includesAny(normalized, CLINICIAN_CLAIM_PHRASES)) {
    return { triggered: true, reason: 'clinician-claim' }
  }
  if (systemPrompt && containsSystemPromptFragment(text, systemPrompt)) {
    return { triggered: true, reason: 'system-prompt-disclosure' }
  }
  const crisisCheck = checkCrisisIndicators(text)
  if (crisisCheck.triggered) return { triggered: true, reason: 'crisis-content' }

  return { triggered: false, reason: null }
}
