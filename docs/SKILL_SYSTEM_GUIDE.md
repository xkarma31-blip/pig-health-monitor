# 🧩 SENTINEL SKILL SYSTEM — FULL GUIDE

> Master Kharl's complete reference for understanding, invoking, and managing skills.
> Grounded in the measured config as of 2026-10-30.

---

## 📊 YOUR INVENTORY (MEASURED)

| Layer | Count | Location |
|---|---|---|
| Skills (SKILL.md dirs) | **285** | `~/.config/opencode/skills/` |
| Slash commands | **72** | `~/.config/opencode/commands/*.md` |
| Shikigami skills (superpowers pack) | **16** families | `~/.cursor/workspace/shikigami/skills/superpowers/` |
| Shikigami domain skills | **19** | `~/.cursor/workspace/shikigami/skills/` (pig_health, rituals, etc.) |

---

## 🔑 THE THREE WAYS A SKILL FIRES

### 1️⃣ AUTO-MATCH — Agent reads your words → fires if description matches

Every session start, the agent loads the **description only** (~1-6 lines) of all 285 skills.
When your message hits trigger phrases in a description, the skill body loads.

**How good descriptions are written (yours follow this):**

```yaml
description: >
  MUST USE when starting any new project, splitting work into
  parallel focused sessions... or when the user says "elephant
  goldfish", "session fleet", "parallel sessions"...
```

The keywords "MUST USE when" + quoted trigger phrases = high-reliability auto-matching.

**Cost of 285 descriptions:** each is ~1-6 lines of text. The full registry is small — the
**bodies** (50-500 lines each) only load when triggered. Normal sessions carry zero skill
body weight unless something fires.

### 2️⃣ EXPLICIT INVOCATION — You name it directly

| You say | What fires |
|---|---|
| "use elephant-goldfish" | `elephant-goldfish` skill |
| "invoke hyperframes" | `hyperframes` skill |
| "load the agua stack skill" | `agua-stack` skill |
| "run /goal" | `/goal` slash command |

This is **unconditional** — no matching needed. If you know the name, just say it.

### 3️⃣ SLASH COMMANDS — Hard-wired `/name` triggers

Your 72 commands in `~/.config/opencode/commands/`:
- `/arm` — frontier-paid interlock
- `/gsd-*` (50+ commands) — the GSD workflow family
- Others as installed

These are separate from skills — they execute the `.md` file's instructions directly.

---

## 🧠 THE `using-superpowers` META-SKILL

**What it does:** enforces "check for skills BEFORE doing anything — even before clarifying
questions." It's the discipline layer that prevents the agent from skipping skills.

**Where it lives:** `~/.cursor/workspace/shikigami/skills/superpowers/using-superpowers/SKILL.md`

**Its core rule (verbatim from your file):**

> *"If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke
> the skill. This is not negotiable."*

**Red flags it catches** (the agent must STOP when it thinks these):

| Thought | Reality |
|---|---|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |

**Platform adaptation:** it has reference files for Codex, Pi, Antigravity, Hermes — each
harness gets specific instructions on how tools map to skills.

---

## 📦 WHAT AUTOLOADS vs WHAT DOESN'T

| Thing | Autoloads? | When | Size cost |
|---|---|---|---|
| `AGENTS.md` (home) | ✅ always | every session from `~` | 278 lines |
| `AGENTS.md` (repo) | ✅ in-repo | sessions inside that repo | varies |
| Skill **descriptions** (all 285) | ✅ always | session start, registry scan | ~2-6 lines each |
| Skill **bodies** | ❌ never | only when triggered | 50-500 lines each |
| `CANON.md` | ❌ never | only when a session deliberately reads it | 706 lines |
| `SOUL.md` | ✅ always | injected by harness (referenced in AGENTS.md) | ~60 lines |

**Bottom line:** normal chat sessions carry `AGENTS.md` + `SOUL.md` + 285 tiny descriptions.
No skill bodies, no canon, no project files load unless triggered or read.

---

## 🎯 YOUR TOP SKILLS — TRIGGER PHRASE CHEAT SHEET

### 🏗️ PROJECT & PLANNING

| Skill | Say this to fire it |
|---|---|
| **elephant-goldfish** | "separate sessions", "parallel sessions", "session fleet", "elephant goldfish", "track map" |
| **gsd-enforce** | "use /goal", "use GSD" (MUST load first — prevents load-then-ignore) |
| **brainstorming** | "let's brainstorm", "let's think about", "explore ideas" (fires BEFORE any creative work) |
| **ce-plan** | "plan this", "create a plan", "break this down", "how should we build" |
| **ce-brainstorm** | "what should we build", "help me think through X" |
| **writing-plans** | "write a plan", "implementation plan" |
| **planning-and-task-breakdown** | "break this into tasks", "estimate scope" |

### 🔧 CODE QUALITY

| Skill | Say this to fire it |
|---|---|
| **ce-commit** | "commit", "commit this", "save my changes" |
| **ce-commit-push-pr** | "commit and PR", "ship this", "create a PR", "open a pull request" |
| **ce-code-review** | "review this code", "code review" |
| **verification-before-completion** | auto-fires when agent is about to claim "done" or "fixed" |
| **systematic-debugging** | "debug this", "why is this failing", "trace this error" |
| **ce-debug** | "fix this bug", pastes stack traces or error messages |
| **check-a-claim** | "is it true that", "verify", "confirm", "does this repo do X" |

### 🎨 FRONTEND & DESIGN

| Skill | Say this to fire it |
|---|---|
| **ui-ux-pro-max** | "design", "build UI", "landing page", "dashboard", "improve the UI" |
| **impeccable** | "redesign", "polish", "audit the UI", "make it bolder" |
| **ce-frontend-design** | "build a web interface", "frontend work" |
| **awesome-design-md** | "use a design system", "pixel-perfect", "design tokens" |
| **popular-web-designs** | "make it look like Stripe/Linear/Vercel" |

### 🎬 VIDEO & MEDIA

| Skill | Say this to fire it |
|---|---|
| **hyperframes** | "make a video", "create an animation", "render a video" (ALWAYS fires first, routes to sub-skills) |
| **kaggle-media** | "make a song", "generate music", "make a video clip" |
| **shikigami-studio** | "generate an image", "create a document", "export to PDF/PPTX" |

### 🤖 IDENTITY & SYSTEM

| Skill | Say this to fire it |
|---|---|
| **agua-stack** | "what is AGUA?", "what's your stack?", "do you still recall AGUA?" |
| **capstone-lab** | "experiment on the capstone", "test the pig health monitor" |
| **capstone-research** | "research swine health", "TinyML", "ESP32 sensors" |
| **vessel-system-management** | "system review", "optimization", "health check" |
| **nosleep** | "don't let the laptop sleep", "nosleep on/off/status" |

### 🔌 INFRASTRUCTURE

| Skill | Say this to fire it |
|---|---|
| **hermes-agent** | "configure Hermes", "extend Hermes" |
| **mcp-management** | "install MCP server", "configure MCP" |
| **telegram-admin** | "send Telegram message", "check bot status" |
| **cron-design** | "create a cron job", "daily briefing" |

---

## 🧪 HOW TO VERIFY A SKILL IS WORKING

1. **Check the registry:** press `alt+s` in the TUI → browse live
2. **Test auto-match:** say one of the trigger phrases → agent should announce
   "Using [skill] to [purpose]" before acting
3. **Test explicit:** say "invoke <skill-id>" → body loads immediately
4. **Test the superpowers guard:** try doing something without invoking a skill that
   should apply → the `using-superpowers` meta-skill should STOP you

---

## 🛡️ COMMON PROBLEMS + FIXES

| Problem | Cause | Fix |
|---|---|---|
| Skill doesn't fire on your words | Description doesn't contain your natural phrasing | Edit the `description:` field to add your trigger phrases |
| Skill fires when you don't want it | Description is too broad (matches casual chat) | Narrow the description; add "Do NOT use when..." clauses |
| Agent loads skill then ignores it | The "load then ignore" anti-pattern | `gsd-enforce` exists for this — it guards the GSD family specifically |
| Skill body is stale | Skill was installed months ago | `using-superpowers` rule: "Skills evolve. Read current version." |
| Too many skills slow down matching | 285 is fine — only descriptions load | No action needed; bodies are lazy-loaded |
| Skill conflicts with another | Two skills claim the same trigger | Add priority/routing (like `hyperframes` does — it routes to sub-workflows) |

---

## 🏗️ HOW TO CREATE A NEW SKILL

1. Create dir: `~/.config/opencode/skills/<skill-id>/`
2. Write `SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: my-skill
   description: >
     MUST USE when [exact trigger conditions].
     Also use when the user says "[trigger phrase 1]",
     "[trigger phrase 2]", or "[trigger phrase 3]".
   ---
   ```
3. Body below the `---`: full instructions, checklists, rules
4. The loader picks it up automatically (you saw `elephant-goldfish` appear live)

**Key insight:** the description is the **entire matching contract**. Invest 80% of your
design effort there. The body can be huge; the description must be surgical.

---

## 📐 ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────┐
│                    SESSION START                         │
│                                                         │
│  1. Load AGENTS.md (home + repo)          ← always      │
│  2. Load SOUL.md                          ← always      │
│  3. Scan 285 skill descriptions           ← always      │
│     (bodies NOT loaded — ~6 lines each)                  │
│                                                         │
├─────────────── USER SENDS MESSAGE ──────────────────────┤
│                                                         │
│  4. using-superpowers guard:                             │
│     "Is there even a 1% chance a skill applies?"        │
│     YES → invoke it BEFORE responding                    │
│     NO  → proceed normally                               │
│                                                         │
│  5. Description auto-match:                              │
│     user words ↔ skill description trigger phrases       │
│     MATCH → load full body (50-500 lines)                │
│     NO MATCH → skill stays dormant                       │
│                                                         │
│  6. Explicit invocation:                                 │
│     "use X" / "invoke X" / "/command"                    │
│     → unconditional load                                 │
│                                                         │
├─────────────── SKILL BODY LOADED ───────────────────────┤
│                                                         │
│  7. Agent follows skill instructions exactly             │
│  8. Announces "Using [skill] to [purpose]"               │
│  9. Creates todos per checklist item (if skill has one)  │
│                                                         │
│  10. On completion: skill body can be discarded          │
│      (memory lives in files, not chat)                   │
└─────────────────────────────────────────────────────────┘
```

---

*Generated 2026-10-30. Source of truth for the inventory: `~/.config/opencode/skills/` (285 dirs),
`~/.config/opencode/commands/` (72 `.md` files), `~/.cursor/workspace/shikigami/skills/` (19 dirs).*
