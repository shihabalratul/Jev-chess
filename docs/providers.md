# Verified provider contracts (2026-10-09)

Official OpenRouter sources:
- https://openrouter.ai/anthropic/claude-haiku-5.5 — configured recognition ID and image/text input.
- https://openrouter.ai/docs/guides/overview/multimodal/images — image_url message content and base64 data URLs.
- https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request — POST https://openrouter.ai/api/alpha/decisions, `model`, `state`, questions keyed by ID, choice criteria object mapping named choices to descriptions; response answers keyed by ID, `type: choice`, `choice`, optional confidence/probabilities and usage.
- https://openrouter.ai/blog/tutorials/how-to-use-jev/ — typesafe/jev-1.13, non-generative decision model, max 255 choice options, probability/confidence interpretation.

The client uses raw HTTP rather than imposing chat completion envelopes on Jev. Text/image Claude requests go to `/api/v1/chat/completions`. Neither model is silently substituted; failures stop analysis. Jev's returned dated model build can differ from its stable configured alias.

Listings/documentation do not prove successful account access. Live validation requires OPENROUTER_API_KEY, sufficient credits, and `pnpm test:live`. It makes two paid requests and checks recognized pieces and legal choice; it does not establish chess strength. No live-provider success is claimed until that command succeeds.

# Chrome browser mechanisms

- https://developer.chrome.com/docs/extensions/reference/api/debugger
- https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent
- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel

Screenshot rate is globally serialized at ≥600 ms per capture (Chrome limit 2/sec). Rectangles are viewport CSS pixels; actual screenshot bitmap dimensions determine scaling, supporting DPR/zoom without assuming devicePixelRatio. Only fully visible boards in the active tab are captured.

Synthetic DOM events are not trusted browser input. They are supported by the demo and boards that explicitly accept them. Optional chrome.debugger permission enables CDP Input for other authorized integrations; site acceptance is never guaranteed, and every move is verified. No anti-cheat/security-control bypass exists. The debugger detaches on cancellation/finish; opening DevTools can end its session.

Side panel requires Chrome 116+ for programmatic open; opening must be triggered by a user click. Popup and side panel share the same React application.

The extension caps backend calls at 28 seconds, within MV3 fetch-response lifetime. Default provider timeout is 12 seconds with one retry (under 25 seconds total). Larger backend timeout configurations are useful for direct API clients but the extension still aborts after its limit.
