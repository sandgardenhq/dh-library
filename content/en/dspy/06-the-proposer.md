---
title: The Proposer
url: "dspy/the-proposer"
description: "The propose/ package: how DSPy writes instruction candidates for its own optimizers."
---

## Overview

`dspy.propose` supplies the part of DSPy that writes instruction candidates. `MIPROv2` asks a proposer for proposals, then searches over those proposals.

For the search side, see [Inside MIPROv2](./05-inside-miprov2.md) and the [official MIPROv2 docs](https://dspy.ai/api/optimizers/MIPROv2/). This page stays with the writer side: who wrote the instruction, what it looked at, and why grounded context beats a blind rewrite of the current prompt.

`dspy.propose.__init__` exports `GroundedProposer` as the package entry point, and `Proposer` in `dspy/propose/propose_base.py` defines the abstract contract. That contract keeps the subsystem focused on one job: produce instruction candidates for downstream optimizers.

## Candidate generation and search are different jobs

`GroundedProposer` writes candidates. `MIPROv2` evaluates and selects among those candidates with Optuna. The proposer does not rank the final answer or pick the best prompt combination; it prepares the search space.

That split matters because a good candidate writer needs different inputs from a good search engine. The writer wants evidence about the task, the program, and the examples. The search layer wants a pool of varied candidates that it can score against the task metric.

## What “grounded” means here

`GroundedProposer` builds a richer prompt than a bare instruction rewrite. In the `MIPROv2` path, it enables program awareness, dataset summaries, few shot demos, and tip selection before it calls an LM.

The broader proposer also supports instruction history. When a caller enables it, `create_predictor_level_history_string()` and `create_instruction_set_history_string()` summarize earlier attempts and the scores they earned.

- `create_dataset_summary()` produces a short description of the dataset.
- `get_dspy_source_code(program)` captures the program structure, and `DescribeProgram` and `DescribeModule` turn that code into natural language descriptions.
- `create_example_string()` turns few shot demo candidates into example text for the generator.
- `create_predictor_level_history_string()` and `create_instruction_set_history_string()` summarize earlier attempts when history stays enabled.
- `TIPS` adds a short prompting cue, and `set_tip_randomly` can pick a different entry for each rollout.

Each source improves proposals in a different way. The dataset summary tells the LM what the data tends to look like. Program awareness tells it which module it should write for and how that module fits the larger pipeline. Demo examples show the exact input and output shape that the instruction must support. History shows which ideas already scored well and which ones the system already tried. Tips nudge the style of the proposal without hard coding a single phrasing.

In the `MIPROv2` call path, the proposer keeps program awareness, dataset summaries, few shot demos, and tip selection turned on, but it turns instruction history off with `use_instruct_history=False` and `set_history_randomly=False`. That means `MIPROv2` asks for fresh proposals that still see the code, the data, and the examples, but do not lean on earlier instruction attempts.

Compared with a blind rewrite of the current instruction, grounded proposal generation can change the prompt to match what the program and dataset actually contain. It avoids simply paraphrasing the old wording and instead uses the surrounding evidence to decide what the instruction should emphasize.

## The dataset summary pass

`create_dataset_summary()` in `dspy/propose/dataset_summary_generator.py` summarizes the training set in two stages. First, it observes a batch of examples with `DatasetDescriptor`. Then it walks through later batches with `DatasetDescriptorWithPriorObservations`, which adds new observations on top of the ones already found. `ObservationSummarizer` then compresses the accumulated observations into a brief two or three sentence summary.

`GroundedProposer.__init__` stores that summary as `self.data_summary`. `GenerateModuleInstruction.forward()` then passes it into `GenerateSingleModuleInstruction` as `dataset_description=data_summary`. The runtime name changes, but the job stays the same: give the instruction generator a concise description of the task data instead of the raw training set.

## DSPy uses DSPy to write its own prompts

This subsystem makes its own instructions with the same primitives it uses for task programs. `DescribeProgram` and `DescribeModule` are `dspy.Signature` classes. `generate_instruction_class()` builds `GenerateSingleModuleInstruction` as another `dspy.Signature`, then wraps it in `dspy.Predict`. `GenerateModuleInstruction` acts as a `dspy.Module` that composes those predictors.

That design matters. `GenerateModuleInstruction` first asks `DescribeProgram` to summarize the whole program, then asks `DescribeModule` to explain the chosen predictor, then feeds both descriptions into `GenerateSingleModuleInstruction`. The code does not rely on a handwritten string template. It uses signatures and predictors to author the meta prompt that will author the task prompt.

`dspy/propose/utils.py` supports that loop with `get_dspy_source_code()`, `create_example_string()`, `create_predictor_level_history_string()`, `create_instruction_set_history_string()`, and `strip_prefix()`. Those helpers turn live program state, demos, and past trials into text the proposer can reason over.

## How the proposer varies its candidates

`GroundedProposer.propose_instructions_for_program()` loops over each predictor in the program and over the available demo set candidates. That gives each predictor its own proposal stream and lets the demo context shift across adjacent candidate sets instead of staying fixed.

`set_tip_randomly` adds another source of variation. When it stays on, the proposer samples one entry from `TIPS` for each rollout, so one proposal may lean toward simplicity while another may lean toward creativity, a persona, or a high stakes framing.

`propose_instruction_for_predictor()` also creates a fresh LM rollout with a unique `rollout_id` and `temperature=self.init_temperature`. The test in `tests/propose/test_grounded_proposer.py` confirms that the proposer forwards the configured temperature into the LM copy call. The result is a set of candidates that differ in context and rollout state, not a repeated copy of one answer.

`create_predictor_level_history_string()` can also narrow the context to the top scoring earlier instructions for the same predictor. `MIPROv2` disables that path, but the proposer keeps it available for consumers that want to ground proposals in prior trial logs.

## Who consumes it

`MIPROv2` is the main in-repo consumer of `dspy.propose.GroundedProposer`. Its `_propose_instructions()` method builds the proposer with the program, training set, and prompt model, then asks it for instruction candidates before the Optuna search begins. The same module keeps the proposer grounded in data and demos while it lets Optuna handle the actual search over instruction and demo combinations.

Other optimizers follow different paths. `dspy/teleprompt/copro_optimizer.py` defines its own instruction generation signatures, `BasicGenerateInstruction` and `GenerateInstructionGivenAttempts`, instead of importing `dspy.propose`. `dspy/teleprompt/gepa/gepa.py` accepts a custom `ProposalFn`, and `dspy/teleprompt/gepa/instruction_proposal.py` supplies `MultiModalInstructionProposer` for visual inputs. Those paths share the same goal, but they do not share the same proposer subsystem.

## Where to look in the code

- `dspy/propose/__init__.py` exports `GroundedProposer`.
- `dspy/propose/propose_base.py` defines the proposer contract.
- `dspy/propose/utils.py` converts source code, demos, and history into proposal context.
- `dspy/propose/dataset_summary_generator.py` builds the dataset summary.
- `dspy/propose/grounded_proposer.py` assembles grounded context and writes candidates.
- `dspy/teleprompt/mipro_optimizer_v2.py` consumes `GroundedProposer` and performs search.
- `dspy/teleprompt/copro_optimizer.py` and `dspy/teleprompt/gepa/instruction_proposal.py` show alternate instruction writers.