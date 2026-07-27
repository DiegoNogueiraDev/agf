---
domain: ml
topic: common-mistakes
triggers: [paper_to_code, ml_implementation, model_training, hyperparam_check]
discovered_at: 2026-04-30T00:00:00.000Z
source_task: extracta-paper2code
confidence: 0.8
---

# ML Implementation — Common Mistakes

Curated from `paper2code/paper_to_code_mistakes.md`. The code runs but does
not implement what the paper describes — these are systematic, not bugs.

## Notation mismatches

- **BatchNorm momentum** — PyTorch `momentum=x` ≈ TensorFlow `momentum=1-x`.
- **Dropout rate vs keep probability** — modern papers usually drop probability;
  pre-2018 papers often keep probability.
- **"Same padding"** — TF handles it automatically; PyTorch needs
  `padding=kernel_size // 2` (asymmetric for even kernels).
- **Tensor layout** — PyTorch NCHW, TensorFlow NHWC. Every conv/pool/reshape
  must account for the difference when porting.

## Activation gotchas

- **GELU** — exact (PyTorch ≥ 1.12) ≠ tanh approximation (BERT, GPT-2). Different outputs.
- **SiLU vs Swish** — same function; Swish-with-trainable-β is the variant.

## Training-loop landmines

- **Loss scaling** — paper reports per-token loss; framework may report
  per-batch sum. Check before comparing.
- **Gradient clipping order** — clip _after_ loss.backward() but _before_
  optimizer.step(). Order swap silently changes effective LR.
- **Learning-rate schedule warm-up** — many papers use linear warm-up over the
  first N steps then cosine decay; "decay from step 0" is a different recipe.
- **Weight decay on biases / LayerNorm** — most modern code skips bias and
  LayerNorm params from weight decay; if the paper doesn't say, default to
  exclusion (matches HF defaults).

## Evaluation traps

- **Accuracy reported on training set** — silently reproduces a training-time
  metric the paper never claimed.
- **Beam search vs greedy** — beam_size=1 is greedy; the paper number was
  probably with beam_size=4 (translation) or 5 (summarization).
- **Tokenizer mismatch** — BPE vocab from the paper vs your tokenizer can
  shift perplexity by 5+ points without changing the model.

## When to escalate

If the AC says "match paper Table 2" but the difference falls in any of the
buckets above, mark UNSPECIFIED in `ambiguity-audit` and ask which convention
the paper's official repo uses.
