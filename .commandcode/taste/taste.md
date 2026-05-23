# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# react
- Fix react-hooks/exhaustive-deps warnings by including missing dependencies rather than suppressing them. Confidence: 0.80
- Avoid `useState(false)` + `useEffect(() => setMounted(true), [])` for hydration mismatch prevention — it triggers cascading renders and React lint warnings. Prefer server-side data fetching, `suppressHydrationWarning`, or deterministic initial state. Confidence: 0.75
- For skeleton loaders in client components: either (a) fetch data server-side so SSR renders real content, or (b) keep skeleton DOM identical to real content including text. Wrapping `<Skeleton>` inside `<CardDescription>`/`<CardTitle>` still mismatches because the inner text differs (empty vs real text). `suppressHydrationWarning` on the container also fails when `initialData` returns `undefined` on server via `typeof window` guard but returns cached data on client — the server must have real data. Confidence: 0.80

# typescript
- Use `NonNullable<>` to strip `null | undefined` from union types when a component prop derives from a data-fetch return type that includes nullable variants, but the component only renders when data is present. Confidence: 0.60

# react
- Avoid calling impure functions like `Date.now()` during React render — components must be pure/idempotent. Move impure calls to effects, event handlers, or `useMemo`. Confidence: 0.70

