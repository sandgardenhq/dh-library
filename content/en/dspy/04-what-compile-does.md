---
title: What Compile Does
url: "dspy/what-compile-does"
description: "What optimizer compilation actually mutates in your program: demos, instructions, and the parameter tree."
---

## Intent

When `teleprompter.compile(program, trainset=...)` returns `optimized`, the returned program carries rewritten learnable state on its `Parameter` tree. DSPy returns the program object itself, not an opaque search artifact. For prompt optimizers, that usually means a copied program whose predictors now carry different demos, signatures, prefixes, or LM assignments. For finetuning optimizers, the LM attached to each predictor may update in place, but the changed surface still lives on the same parameter tree that `dspy/predict/parameter.py`, `dspy/primitives/base_module.py`, and `dspy/primitives/module.py` expose.

Think of the tree the way you would think about parameters in PyTorch: it marks the learnable surface. The difference is that DSPy learns a structured program, not a bag of tensor weights. The program object is the thing that changes, and the optimizer only decides which parts of that object it will rewrite.

## The program tree is the unit of learning

`Module.named_parameters()` walks the tree that optimizers rely on. It follows attributes, nested modules, lists, tuples, and dicts, then yields the `Parameter` objects it finds. The same walk stops at children marked `_compiled`, so a compiled subtree stays frozen when a later optimizer works on the outer program. That behavior makes compilation composable: a learned inner program can sit inside a larger one without being re-optimized by accident.

`Predict` is the learnable unit in that tree. It inherits both `Module` and `Parameter`, so it shows up as optimizer-visible state and as a runnable program node. The result is a clean boundary: optimizers do not tune abstract “weights” in the aggregate. They tune predictors, and the tree walk tells them where those predictors live.

## What lives inside `Predict`

Demos sit in the first bucket. `Predict.reset()` clears `demos`, `traces`, `train`, and `lm`, which makes the mutable surface obvious: those are the slots compile can rewrite. `Predict.dump_state()` serializes the demos alongside the other round-tripped state, and `BootstrapFewShot` fills `predictor.demos` with the traces it trusts.

Signature instructions and field prefixes sit in the second bucket. `Signature.instructions` stores the predictor’s natural-language behavior, while `Signature.with_instructions()` and `Signature.with_updated_fields()` return new signature classes instead of mutating the old one. `Signature.dump_state()` carries both the instructions and the per-field metadata, which means compile can swap wording and output prefixes without changing the rest of the program.

LM state sits in the third bucket. `Predict.load_state()` rebuilds the attached LM from saved state through `BaseLM.load_state()`, and finetuning optimizers replace that LM assignment when they finish. `BootstrapFinetune` and `GRPO` work at that boundary: one writes a new trained model back onto each predictor, and the other updates the existing LM reference in place.

## Optimizer families as program mutations

Demo-selection optimizers change `predictor.demos`. `BootstrapFewShot` traces the student or teacher on the trainset, keeps the traces that pass the metric, and writes the resulting examples into each predictor’s demo list. The search process matters for quality, but the visible effect stays simple: different examples appear on the predictor after compile.

Instruction-search optimizers change `Signature.instructions` and output prefixes, then return a program that contains those chosen signatures. `MIPROv2` and `COPRO` both generate candidate instructions, test them, and rewrite each predictor’s signature with the winner. The important part is not the search loop; it is the fact that the chosen wording ends up attached to the compiled program object.

Finetuning optimizers change the LM attached to each predictor. `BootstrapFinetune` swaps in the fine-tuned model and can clear demos when `exclude_demos` is set. `GRPO` updates the predictor LM reference in place, and the program keeps its structure while the model under each predictor changes.

## Persistence marks the boundary between code and state

`Module.dump_state()` and `Module.load_state()` define the state-file boundary. They round-trip the optimizer-visible tree, not the Python class itself. `Module.save()` and `Module.load()` expose that boundary to callers: state-only saves produce a JSON or pickle file, while full-program saves write a directory that contains `program.pkl` and `metadata.json`. `allow_pickle` gates pickle loads, and `allow_unsafe_lm_state` controls whether LM endpoint details and custom LM classes survive loading.

The save format only changes packaging. The optimization result still lands in the predictor tree, and the loader can recover it from either representation.

## Compilation leaves an inspectable footprint

The effect of compile is easy to inspect because it shows up as state differences. Demos change, signature instructions change, field prefixes change, and LM assignments change. That makes the optimized program readable before and after compile, and it also makes the optimizer’s output easy to compare against a baseline.

```python
before = program.predictors()[0].demos, program.predictors()[0].signature.instructions
optimized = teleprompter.compile(program, trainset=trainset)
after = optimized.predictors()[0].demos, optimized.predictors()[0].signature.instructions
```

## Where to look in the code

- `dspy/predict/parameter.py` — the marker type that makes an object visible to optimizers.
- `dspy/primitives/base_module.py` — the tree walk that finds parameters and freezes `_compiled` subtrees.
- `dspy/primitives/module.py` — the module surface, predictor helpers, and save/load entry points.
- `dspy/predict/predict.py` — the state buckets that compile rewrites on each predictor.
- `dspy/signatures/signature.py` — signature instructions, field prefixes, and non-mutating update helpers.
- `dspy/utils/saving.py` — the full-program loading path and its pickle gate.

Related pages: [The big picture](./00-the-big-picture.md), [Inside MIPROv2](./05-inside-miprov2.md), [Modules](https://dspy.ai/diving-deeper/modules/), [BootstrapFewShot family](https://dspy.ai/diving-deeper/bootstrap-fewshot-family/), [Saving and loading](https://dspy.ai/diving-deeper/saving-and-loading/), [Choosing an optimizer](https://dspy.ai/diving-deeper/choosing-an-optimizer/).