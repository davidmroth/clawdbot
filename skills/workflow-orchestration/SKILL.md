---
name: workflow-orchestration
description: Manages complex tasks through structured workflows, including planning, subagent delegation, self-improvement, and verification. Use for multi-step processes requiring elegance, robustness, and autonomous bug fixing.
---
# Workflow Orchestration

## Workflow Orchestration
- **Plan Mode Default**: Enter for non-trivial tasks (3+ steps), stop/re-plan if issues, use for verification, write detailed specs.
- **Subagent Strategy**: Offload research/exploration to subagents for clean context, one task per subagent.
- **Self-Improvement Loop**: Update tasks/lessons.md after user corrections, iterate to drop mistake rate, review at start.
- **Verification Before Done**: Prove it works, diff changes, run tests, ask if staff engineer would approve.
- **Demand Elegance**: Pause for non-trivial, seek elegant way if hacky, skip for simple.
- **Autonomous Bug Fixing**: Fix from logs/tests without user input, zero context switch.

## Task Management
- **Plan first in tasks/todo.md** with items, verify before start, track progress, explain changes, document results, capture lessons in lessons.md.

## Core Principles
- **Simplicity First**: Changes simple as possible, minimal code impact.
- **No Laziness**: Root causes, no temp fixes, senior standards.
- **Minimal Impact**: Touch only necessary, avoid bugs.
