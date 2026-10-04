# Media and pronunciation reliability

Media resolves in the API, not in each learner's browser. Local curated assets
win; optional Pexels and Unsplash official APIs precede Commons. Secret keys are
backend-only `PEXELS_API_KEY` and `UNSPLASH_ACCESS_KEY`. With neither configured,
Commons or non-image learning remains available.

The `MediaAsset` MongoDB cache stores asset/provider identity, attribution,
query, fit/focal metadata, resolution status and rejected URLs. Resolutions
expire after 24 hours; unavailable results after 10 minutes. Concurrent requests
are coalesced. Provider errors/rate limits trigger a one-minute cooldown. Only
allowlisted HTTPS photo CDN URLs are fetched, with bounded requests, provider
resolution checks, MIME and file-signature validation. Development logs report
categories and concept/provider identity, never keys or learner responses.

Unsplash results stay on its CDN, retain attribution/referral links and trigger
its download-tracking endpoint when selected. No API-returned photos are copied
into Vaani's local assets. Provider metadata is periodically refreshed, not
assumed permanent. See [Unsplash guidelines](https://unsplash.com/documentation)
and [Pexels API](https://www.pexels.com/api/documentation/).

Before presentation, unusable image choices become audio/target-language
choices with the same introduced concept IDs. Runtime image errors try another
source, then request a non-image presentation of the same activity. No learner
state is advanced by media adaptation. Non-visual concepts retain contextual
support. No unavailable-image exercise is rendered. Photographic relevance and
native pronunciation still need editorial/human review; metadata cannot prove
composition or speech quality.

Evaluation intent separates selection, semantic support, phonetic support and
explicit target writing. Latin pronunciation support is anchored to authored
Telugu and accepted spoken forms. It preserves actual consonant gemination and
aspiration, supports established transcription representations, and conservatively
relaxes vowel notation in longer forms and Telugu's borrowed /f/ representations.
Very short words remain strict. A catalog pronunciation index rejects relaxed
matches colliding with another authored target. No unbounded edit-distance rule
is used. Typed support never earns independent speech evidence; actual microphone
transcripts retain the spoken-form path. Telugu writing does not accept Latin
support strings and retains orthographic feedback.

Regression tests cover provider chains/cache/errors and pronunciation contrasts.
Terminal Playwright exercises 30 real activities per viewport, including typed
oral support and a separate image-delivery outage flow. Only image bytes and
speech-adapter callbacks are fault-injected; learning/auth/session APIs remain real.
