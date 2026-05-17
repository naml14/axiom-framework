# render-pipeline Specification

## Purpose

Defines the core rules for the layout calculation pass (reflow) of the render pipeline, particularly concerning how portals are processed.

## Requirements

### Requirement: Secondary Portal Pass

The system MUST process portal layouts exclusively during a secondary traversal pass (`reflowPortalChildren`), completely separate from the primary node layout logic.

#### Scenario: Standard Node Traversal

- GIVEN a prepared component tree
- WHEN the primary layout pass runs
- THEN the layout engines (`measureSimple`, `measureFlex`, `measureGrid`) MUST skip portal nodes entirely

#### Scenario: Unmanaged Portal Processing

- GIVEN a portal with `cssManaged=false`
- WHEN the secondary portal pass runs
- THEN the system MUST lay out the portal's children once
- AND populate their dimensions in the layout result

#### Scenario: Managed Portal Processing

- GIVEN a portal with `cssManaged=true`
- WHEN the secondary portal pass runs
- THEN the system MUST NOT lay out the portal's children
- AND leave their layout to external CSS management