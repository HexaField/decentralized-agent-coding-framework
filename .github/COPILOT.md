# Copilot + Spec Kit: Repo Instructions

Use this file as guidance for GitHub Copilot Chat to operate Spec Kit (Specify CLI) within this repository.

## Goals
- Use Spec-Driven Development to build this infrastructure via Copilot as the interface.
- Keep docs and code in sync with our principles: composability, modularity, dependency injection, interoperability.

## What Copilot should do
- Recognize and facilitate these Spec Kit slash commands in chat:
  - /constitution — Draft/update project principles and guidelines.
  - /specify — Capture requirements and user stories (what/why).
  - /clarify — Ask targeted questions to address underspecification before planning.
  - /plan — Produce a technical implementation plan aligned to our Dockerized architecture (backend in container, local UI, private network, Ollama local-first with cloud fallback).
  - /tasks — Generate actionable backlog items tied to repo files.
  - /implement — Propose precise file edits/PRs to execute tasks.
- When terminal execution is required, use our scripts:
  - Check setup: npm run spec:check
  - Initialize here (writes files; prefer a branch): npm run spec:init:here

## Where to write outputs
- Small updates: edit existing docs
  - IMPLEMENTATION_PLAN.md (plans/requirements)
  - BACKLOG.md (tasks)
  - docs/SPEC_KIT.md (usage)
  - README.md (overview, quickstart)
- Larger specs/plans: create or update files under a new `specs/` directory.

## Constraints & preferences
- Local-first inference via Ollama; cloud fallback with clear telemetry and costs.
- Only backend port exposed; all other services stay on a private network.
- Use DI-friendly interfaces for providers (LLM/vector/storage) to enable swappability by config only.
- Keep PRs small and include verification steps.
- Never commit secrets; use environment variables or Docker secrets.

## Helpful references
- Spec Kit repo: https://github.com/github/spec-kit
- Local scripts: npm run spec:check, npm run spec:init:here
- Environment: SPECIFY_FEATURE can select a feature without branches.
