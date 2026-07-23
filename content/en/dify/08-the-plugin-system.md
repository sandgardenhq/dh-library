---
title: The Plugin System
url: "dify/the-plugin-system"
description: "The plugin daemon and its runtimes — the architecture Dify's blog calls Beehive."
---

## Overview

Dify keeps models, tools, agent strategies, datasources, triggers, and plugin endpoints outside the core so the platform can change one capability without forcing a full release of the rest. That split cuts dependency bloat, shortens iteration, and makes room for a third party plugin ecosystem instead of a closed core. The public plugin docs already cover type selection and type specific development, so this chapter stays at the architectural boundary. The code in `api/core/plugin/entities/plugin.py` and `api/core/plugin/plugin_service.py` shows a small core that owns policy, discovery, caching, and lifecycle while plugin capabilities attach only where the product needs them.

## The plugin types and their seams

`PluginCategory` names six supported categories: `Tool`, `Model`, `Extension`, `AgentStrategy`, `Datasource`, and `Trigger`. `PluginDeclaration` does not treat category as a free form label. It infers the category from the manifest content itself: if the declaration carries `tool`, `model`, `datasource`, `agent_strategy`, or `trigger` data, it selects the matching category, and it falls back to `Extension` when none of those fields appear. That keeps the manifest aligned with the subsystem that will consume it.

The daemon facing entities in `api/core/plugin/entities/plugin_daemon.py` reinforce the same split. They carry a plugin identifier, a unique identifier, the provider name, and a typed declaration object, which gives the API enough structure to rebind plugin supplied providers back into tenant scope without guessing what kind of capability the package exposes.

- `Tool` plugs into `core.tools` through `PluginToolManager` in `api/core/plugin/impl/tool.py`. The call flow runs from the application into the daemon for discovery, credential checks, and tool execution, then returns tool messages back into the normal tool engine.
- `Model` plugs into the shared model runtime through `api/core/plugin/impl/model.py` and `api/core/plugin/impl/model_runtime.py`. The runtime adapter keeps plugin backed models on the same contract as the rest of the platform, and the sibling chapter [/06-the-model-runtime.md](./06-the-model-runtime.md) explains that shared runtime in more depth.
- `AgentStrategy` plugs into the agent layer through `api/core/plugin/impl/agent.py`. The API asks the daemon for strategy discovery and strategy execution, and then hands the resulting messages back to the agent flow.
- `Extension` plugs into endpoint management through `api/core/plugin/impl/endpoint.py`, `api/services/plugin/endpoint_service.py`, and `api/controllers/inner_api/plugin/plugin.py`. This seam does not add a new runtime primitive; it lets a plugin own managed endpoints while the API controls create, update, enable, disable, and delete operations.
- `Datasource` plugs into `api/core/plugin/impl/datasource.py` and the workflow datasource node in `api/core/workflow/nodes/datasource/datasource_node.py`. The workflow node consumes the datasource output and turns it into normal workflow data, including the local file datasource path that the code keeps alongside plugin sourced datasources.
- `Trigger` plugs into `api/core/plugin/impl/trigger.py` and `api/core/workflow/nodes/trigger_plugin/trigger_event_node.py`. The daemon publishes trigger providers and events, and the workflow layer turns those events into workflow entry points and subscription lifecycles.

The official Dify plugin docs already explain how to choose a type and how to build each one. This chapter leaves those tutorials there and focuses on the boundary: which subsystem each plugin type attaches to, which direction the calls move, and which adjacent layer receives the result.

## The runtime boundary

The repository shows the plugin daemon as a separate service, not as in process code. `docker/docker-compose.yaml` starts `plugin_daemon` beside `api`, `worker`, and `agent_backend`, and `docker/envs/core-services/plugin-daemon.env.example` wires the API URL, the daemon key, the debugging port, and the working path. `BasePluginClient` in `api/core/plugin/impl/base.py` owns the HTTP hop from the API process to that daemon. It sends every request under a tenant scoped path such as `plugin/{tenant_id}/...`, adds the `X-Api-Key` header from configuration, and adds `X-Plugin-ID` wherever the call needs to name a specific plugin. The client code also keeps the request path clean and rejects traversal attempts before it sends anything outward.

The API process does not execute plugin code itself. It treats the daemon as the execution surface for plugin behavior and only consumes typed responses, streamed events, and error envelopes. The repository does not include the daemon implementation, so this chapter stops at the client side and the deployment surface the code makes visible.

## Execution environments

The compose file and env example prove the deployment wiring: `plugin_daemon` listens on `PLUGIN_DAEMON_PORT` with a default of `5002`, exposes `PLUGIN_DEBUGGING_PORT` with a default of `5003`, and reads `PLUGIN_DAEMON_URL`, `PLUGIN_DAEMON_KEY`, `PLUGIN_DIFY_INNER_API_URL`, `PLUGIN_DIFY_INNER_API_KEY`, and the plugin working path from the environment. The API and worker services point at that daemon, and `agent_backend` uses its own plugin daemon URL and key. Dify’s public runtime material describes local process, debug connection, and hosted operation as part of the same plugin story; this repository only proves the container and environment wiring behind that split.

## Reverse invocation

Plugins also call back into Dify. The inner API controller in `api/controllers/inner_api/plugin/plugin.py` exposes the reverse invocation surface, and its decorators in `api/controllers/inner_api/plugin/wraps.py` show the safety rails around it. `plugin_inner_api_only` gates access to trusted callers, `plugin_data` validates the payload shape, and `get_user_tenant` plus `get_user` resolve tenant and user context before the controller enters the request body. That means the inner API does not trust plugin supplied identity on its own; it rebuilds the trusted tenant and user context before it runs anything else.

The backwards invocation package splits the outbound surface into clear paths: `app.py` invokes workflows and app modes, `model.py` invokes models and model runtime helpers, `tool.py` invokes tools, and `node.py` invokes node like helpers such as parameter extraction and question classification. The important point is architectural rather than procedural: a plugin can orchestrate platform capabilities from inside the same boundary that normally serves plugin requests outward. The official reverse invocation docs should serve as the operational reference; this chapter only maps the system boundary that the code exposes.

## Lifecycle in one view

`api/core/plugin/plugin_service.py` owns the life of a plugin after installation. It orchestrates install, uninstall, upgrade, cache invalidation, and provider discovery, while `api/services/plugin/oauth_service.py` creates short lived OAuth proxy contexts for credential flows. `api/services/plugin/plugin_permission_service.py` stores tenant plugin install and debug permissions, `api/services/plugin/plugin_auto_upgrade_service.py` keeps auto upgrade policy category scoped, and `api/services/plugin/endpoint_service.py` wraps endpoint CRUD and enablement. The lifecycle also covers the sources that the code accepts today: marketplace, package, GitHub, and remote install paths. The policy layer keeps credentials, cache, and upgrade decisions tenant scoped so one workspace cannot silently reshape another workspace’s plugin surface.

## Architecture note

The plugin boundary acts as the platform’s outermost port. Dify’s public Beehive naming fits that same modular, cell like direction: each subsystem keeps a narrow surface and exchanges typed data with the neighbors that need it. As of mid-2026, the newer `dify-agent/` stack continues the same split boundary direction, but this chapter stops at the API and deployment surface that the repository shows.

## Where to look in the code

- `api/core/plugin/entities/plugin.py` — plugin categories, manifest inference, and installation source types.
- `api/core/plugin/impl/base.py` — tenant scoped HTTP transport to the daemon, including `X-Api-Key` and request path guards.
- `api/core/plugin/impl/model_runtime.py` — the adapter that ties plugin backed models into the shared runtime.
- `api/controllers/inner_api/plugin/plugin.py` — reverse invocation endpoints for apps, models, tools, nodes, and related helpers.
- `api/core/plugin/plugin_service.py` — install, upgrade, uninstall, cache invalidation, and provider discovery policy.
- `docker/docker-compose.yaml` — the separate `plugin_daemon` service and the deployment wiring around it.
