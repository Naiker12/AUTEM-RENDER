# AI Models & Licenses Notice

Autem Render's source code is licensed under the **MIT License** ([LICENSE](../LICENSE)).
However, the **AI models and external APIs** you connect to carry their own licenses and usage terms. Always verify the upstream license before commercial use:

| Provider / Model | Where | Cost | Upstream License / Notes |
|---|---|---|---|
| **Microsoft TRELLIS / TRELLIS.2** | ComfyUI Local / fal.ai / Replicate | `$0` local / paid cloud | MIT License (open weights). Verify specific Space/API terms. |
| **Tencent Hunyuan3D-2 / 2.1 / 3.1** | Hugging Face ZeroGPU / fal.ai | `$0` HF ZeroGPU / paid cloud | Tencent Hunyuan Community License (check territorial & commercial clauses before commercial deployment). |
| **Stability Stable Fast 3D (SF3D)** | Stability AI API | Paid API (~`$0.05`/model) | Stability AI Community License / API Terms. |
| **Tripo3D / Meshy** | Official APIs / fal.ai | Paid API | Commercial API Terms of Service. |
| **FLUX.1-schnell** | Hugging Face / Pollinations / ComfyUI | `$0` | Apache-2.0 (open weights). |
| **FLUX.1-dev / FLUX Pro Ultra** | fal.ai / ComfyUI | Paid API / local | Non-commercial dev license (check Black Forest Labs terms for commercial API usage). |
| **Wan 2.2 / LTX-Video** | ComfyUI Local / fal.ai | `$0` local / paid cloud | Apache-2.0 / Lightricks Community License. |
| **Local CPU 3D (`local.relief_3d`)** | Built-in CPU | `$0` | Part of Autem Render (MIT). Offline silhouette/volumetric fallback. |

> **Cost disclaimer:** Cloud providers (fal.ai, Stability, Tripo, Meshy, Replicate, OpenAI) bill per generation. Configure your daily budget cap (`DAILY_COST_LIMIT_USD`) or enable **Free-Only Mode** in **Settings** before running batch jobs.
