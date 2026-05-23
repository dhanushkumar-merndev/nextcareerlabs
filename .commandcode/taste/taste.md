# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# react
- Fix react-hooks/exhaustive-deps warnings by including missing dependencies rather than suppressing them. Confidence: 0.80
- Use `useState(false)` + `useEffect(() => setMounted(true), [])` pattern to prevent hydration mismatches when client components on static/SSG pages depend on browser-only data like session/cookies. Confidence: 0.60

# typescript
- Use `NonNullable<>` to strip `null | undefined` from union types when a component prop derives from a data-fetch return type that includes nullable variants, but the component only renders when data is present. Confidence: 0.60

