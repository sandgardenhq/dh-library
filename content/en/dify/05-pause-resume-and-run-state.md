---
title: Pause, Resume, and Run State
url: "dify/pause-resume-and-run-state"
description: "What a run persists, how it pauses for a human, and how it resumes."
---

## Overview

A workflow run in Dify keeps both a run record and per-node execution records. `WorkflowPersistenceLayer` listens to `GraphEngine` events and writes those records as execution moves forward, so persistence stays attached to the engine rather than to node code. For the broader shape of a run, see [01 Anatomy of a Workflow Run](./01-anatomy-of-a-workflow-run.md) and [02 Inside the Graph Engine](./02-inside-the-graph-engine.md).

## Run records

`WorkflowRun` captures the run identity, trigger source, graph snapshot, inputs, outputs, error text, elapsed time, token and step counts, creator identity, and start and finish timestamps. `WorkflowNodeExecutionModel` captures the same story at node scope: node identity, predecessor, inputs, process data, outputs, status, error, elapsed time, execution metadata, and timestamps.

The persistence layer creates the workflow row on `GraphRunStartedEvent`, then updates it on `GraphRunSucceededEvent`, `GraphRunPartialSucceededEvent`, `GraphRunFailedEvent`, `GraphRunPausedEvent`, and `GraphRunAbortedEvent`. It saves node rows on node start, retry, success, failure, exception, and pause-request events.

## Pause

The `human_input` path pauses the graph at the engine level. When `GraphRunPausedEvent` arrives, `PauseStatePersistenceLayer` stores a `WorkflowResumptionContext` with the graph runtime snapshot, including the variable pool, the generate entity, and the response stream filter state, then writes the workflow pause record with the mapped pause reasons. Dify stores that snapshot in its workflow pause row, and human-input form records keep the token and run binding that let the pause survive across requests and later resume from the same execution state.

## Resume

A paused run resumes in a later process, not in the original request. `HumanInputService.submit_form_by_token(...)` marks the form as submitted and enqueues `resume_app_execution`, and the resume task loads the pause row, decodes `WorkflowResumptionContext.loads(...)`, rebuilds `GraphRuntimeState.from_snapshot(...)`, and restores the response stream filter before it calls the workflow generator again.

That path continues from the stored engine state rather than replaying the whole graph. Completed nodes stay completed, node execution history stays attached to the run, and the resumed process advances only from the pause point forward.

## Timeslicing

`TimeSliceLayer` adds a scheduler check around workflow execution. When the plan uses `WorkflowScheduleCFSPlanEntity.Strategy.TimeSlice`, the layer polls the scheduler, and `RESOURCE_LIMIT_REACHED` turns into a `PAUSE` command. The workflow pauses for capacity reasons instead of failing.

## Failure semantics

The node error-handle strategies visible in the code are `none`, `fail-branch`, and `default-value`. They describe how a node reacts to its own error, while retry handling stays separate from the workflow’s final status. For the configuration side of those strategies, see Dify’s official docs on [predefined error handling logic](https://docs.dify.ai/en/cloud/use-dify/build/predefined-error-handling-logic). `retry_history.py` records each retry attempt in `__dify_retry_history`, so the run keeps attempt history without turning every retry into a terminal failure.

At workflow level, `WorkflowPersistenceLayer` writes `succeeded` when the graph finishes normally, `paused` when the graph pauses, `failed` when the graph fails, and `stopped` when the graph aborts. A node can retry or fail locally without ending the workflow, but a graph-level terminal event always updates the run row.

## Operational limits

The code does not promise automatic recovery from worker crashes, deploys, or other process loss. It resumes only after Dify has already saved the pause record, the resumption context, and the form state that identifies the run. If a process dies before those pieces reach storage, the code does not invent a replacement state.

## SSE stream

The SSE stream can outlive a single request, so reconnects matter. The workflow events endpoint in `api/controllers/service_api/app/workflow_events.py` resumes a stream after a pause or a dropped connection, and it can replay the persisted state snapshot so the consumer sees already executed nodes before new events arrive. That behavior depends on the persisted response stream filter described in [01 Anatomy of a Workflow Run](./01-anatomy-of-a-workflow-run.md): without the saved filter state, the resumed stream would lose the exact event shape that the first connection had already observed.

## Where to look in the code

- `api/models/workflow.py` — `WorkflowRun`, `WorkflowNodeExecutionModel`, and the workflow status fields.
- `api/core/app/workflow/layers/persistence.py` — event-driven persistence from `GraphEngine`.
- `api/core/app/layers/pause_state_persist_layer.py` — pause snapshots and `WorkflowResumptionContext`.
- `api/core/app/layers/timeslice_layer.py` — `RESOURCE_LIMIT_REACHED` pause behavior.
- `api/core/workflow/workflow_entry.py` and `api/controllers/service_api/app/workflow_events.py` — response-stream filter persistence and reconnect handling.
- `api/services/human_input_service.py` and `api/tasks/app_generate/workflow_execute_task.py` — human-input submission and `resume_app_execution`.