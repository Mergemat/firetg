# Domain Docs

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `.agents/adr/`.

If either is absent, proceed silently. Domain-modeling skills create them lazily as terminology and decisions are resolved.

## Layout

This is a single-context repository:

```text
/
├── CONTEXT.md
├── .agents/adr/
└── src/
```

Use terminology defined in `CONTEXT.md`. If work contradicts an existing ADR, surface that conflict explicitly rather than silently overriding it.
