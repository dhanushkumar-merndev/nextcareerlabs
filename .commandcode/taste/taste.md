# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# react
- Fix react-hooks/exhaustive-deps warnings by including missing dependencies rather than suppressing them. Confidence: 0.80
- Use `useState(false)` + `useEffect(() => setMounted(true), [])` pattern to prevent hydration mismatches when client components on static/SSG pages depend on browser-only data like session/cookies. Confidence: 0.60

