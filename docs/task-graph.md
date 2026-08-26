# GeoHarness Task Graph

Phase 6 uses one executable DAG per Scenario. The canonical definition lives beside that
Scenario's prompt, data and expected results in `examples/scenarios/<id>/task-graph.json`.

## Definition contract

Each step declares a stable `id`, human-readable `title`, one registered Geo `tool`, explicit
`dependencies`, model/tool `parameters`, and zero or more output Layer aliases. A Layer parameter
is represented as `{ "$layer": "alias" }`; the runtime resolves it to the canonical Layer ID
returned by the Scenario loader or by an upstream step. Definitions are rejected for duplicate
ids, missing dependencies, self-dependencies, dependency cycles, invalid parameter shapes or
duplicate output aliases.

## Execution contract

Every step starts as `pending`. When all dependencies succeed it moves to `running`, executes
through `ctx.geo`, then becomes `success` only if the ToolResult is successful and returns exactly
the declared number of output layers. Exceptions, unsuccessful ToolResults and output-contract
mismatches become `failed`. A dependent step whose upstream failed also becomes `failed` with an
explicit blocker; independent branches continue.

Each transition is appended to ordered history with `from`, `to`, step id, resolved outputs and
error. A snapshot contains the overall state, every step, the initial and derived Layer-alias map,
and transition history. The Harness `TaskGraphRuntime` stores the latest execution per
`workspaceKey + scenarioId`; persistent geodata remains owned by the Geo provider.

This keeps the required chain inspectable:

```text
Goal → Plan/DAG → Geo Tool → canonical Layer ID → transition history
```

Phase 7 binds successful step outputs to the Layer Registry and map verification surface. Phase 9
adds parameter revision and partial rerun; Phase 6 does not pretend a revision is complete.
