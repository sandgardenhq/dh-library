---
title: Inside MIPROv2
url: "dspy/inside-miprov2"
description: "The flagship optimizer's mechanism: bootstrapped demos, proposed instructions, and Optuna-guided search."
---

## Overview

MIPROv2 is DSPy's flagship prompt optimizer. It treats prompt improvement as a search problem over two linked choices: the instruction each predictor sees and the few shot demo set that accompanies it. The objective comes from the user's metric, so the optimizer does not rewrite a prompt once and stop. It explores many candidate combinations, scores them, and returns the best compiled program.

A run starts by cloning the student program. `compile()` works on that deep copy, not on the original object, so the optimizer mutates only the compiled copy's predictor instructions and demo lists. That boundary matches the broader compile model in [04-what-compile-does.md](./04-what-compile-does.md).

## Run flow

`compile()` follows the same sequence every time. First it prepares the evaluation set and the `Evaluate` wrapper. Then `_bootstrap_fewshot_examples()` builds demo candidates from successful traces and labeled examples. This stage is the trace-heavy demo generation pass: `create_n_fewshot_demo_sets()` turns training examples into candidate demo sets through `BootstrapFewShot` and `LabeledFewShot`, and the cost lands on successful teacher runs plus metric filtering.

Next `_propose_instructions()` asks `GroundedProposer` for instruction candidates. This is the prompt-model-driven stage: it spends budget on the dataset summary from `create_dataset_summary()`, the current program structure, the demo text, and a few prompting tips before `GroundedProposer` writes candidate instructions. `MIPROv2` keeps the proposer focused on candidate generation and leaves search to Optuna; [06-the-proposer.md](./06-the-proposer.md) covers that subsystem in more detail.

Finally `_optimize_prompt_parameters()` searches over the candidate space. This is the task-model-driven stage: each Optuna trial spends budget on trial evaluations, and the search combines cheap minibatches with periodic full evaluations of the strongest candidates.

## How the search uses signal

MIPROv2 uses two kinds of scores for two different jobs. Minibatch scores keep exploration cheap, while full evaluation scores confirm the strongest candidates on the entire validation set.

That split matters. `score_data` keeps minibatch and full evaluation records separate, `param_score_dict` groups repeated minibatch results by parameter combo, and `fully_evaled_param_combos` prevents the optimizer from full evaluating the same combo twice. `create_minibatch()` samples a subset of the validation set, `eval_candidate_program()` runs the candidate on that subset when the run uses minibatching, and `get_program_with_highest_avg_score()` promotes the next minibatch winner into a full evaluation. The default program gets a full evaluation before search begins, so the optimizer starts from a real baseline rather than an untested guess. The final program comes from the full evaluation path, not the minibatch score table.

The design also explains the log shape. Minibatch scores widen the search cheaply, while full evaluation narrows the field with the expensive signal that actually decides the winner. The final confirmation pass only reaches the candidates that survive minibatch screening.

## Budget and presets

The `auto` presets move the same three dials together: how many candidate instructions the proposer generates, how much of the validation set the optimizer samples, and how many trials it runs. Larger presets buy more proposal variety and more search coverage. They also increase prompt model calls, task model evaluations, and the number of full evaluation passes.

That trade-off matters more than the preset label itself. A larger budget helps only when the task metric, the training set, and the demo pool carry enough signal to distinguish one candidate from another. If the signal stays noisy, more search just spends more compute on the same uncertainty.

## What the run changes

MIPROv2 mutates state visible to the optimizer, not program structure. It changes predictor instructions and predictor demos inside the cloned student, then scores those variants against the metric. It does not rewrite the original student, and it does not alter the control flow of the program. An engineer reading the result should expect a compiled copy whose prompt state reflects the search, while the source program remains available for another run.

## When to use it

MIPROv2 fits cases where instruction wording and demo choice both matter and where the metric can reliably tell close candidates apart. It works well when a task needs more than a bootstrap pass, but less than a wholesale change to the program.

Use a bootstrap-first optimizer when the main gain comes from demo selection. Use GEPA when the workflow needs a different search style and the team wants its evolutionary prompt updates. For the broader comparison, see the official [choosing an optimizer](https://dspy.ai/diving-deeper/choosing-an-optimizer/) page. See also the [bootstrap family](https://dspy.ai/diving-deeper/bootstrap-fewshot-family/) and [GEPA](https://dspy.ai/diving-deeper/gepa-in-depth/) pages.

The practical rule stays simple: metric quality and training set composition dominate the outcome. `BootstrapFewShot` seeds the candidate demos, `GroundedProposer` writes instructions from those seeds, and Optuna searches all candidate instruction and demo combinations. Weak training signal weakens every one of those stages.

## Where to look in the code

- `dspy/teleprompt/mipro_optimizer_v2.py` implements `compile()`, the auto presets, the minibatch and full evaluation split, and the Optuna search loop.
- `dspy/teleprompt/utils.py` implements `create_minibatch()`, `eval_candidate_program()`, `create_n_fewshot_demo_sets()`, and `get_program_with_highest_avg_score()`.
- `dspy/teleprompt/bootstrap.py` shows how successful traces and labeled examples become bootstrap demos.
- `dspy/propose/grounded_proposer.py` assembles the grounded proposal context and writes instruction candidates.
- `dspy/propose/dataset_summary_generator.py` builds the dataset summary that grounds the proposer.
- `dspy/propose/utils.py`, `dspy/propose/propose_base.py`, and `dspy/propose/__init__.py` define the helper functions, proposer contract, and public export.