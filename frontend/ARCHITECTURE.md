# Frontend Architecture

## Purpose

The Pacific Spaceport Charter System frontend uses a feature-first React architecture designed for clear ownership, maintainability, and behavior-preserving changes.

The architecture separates application coordination, feature-specific functionality, and reusable shared functionality.

## Technology

- React 19
- Vite 6
- JavaScript and JSX
- Vitest and React Testing Library
- Centralized CSS under `src/css/`

## Source organization

### `src/js/app/`

Application-wide presentation components, including the header.

`App.jsx` coordinates the application and supplies shared application data to features.

### `src/js/features/charter/`

Owns Charter-specific presentation, availability coordination, booking submission, input validation, and booking options.

Charter-only components, hooks, utilities, and constants remain within this feature.

### `src/js/features/fleet/`

Owns Fleet-specific presentation, reservation filtering, timeline interaction, and cancellation workflows.

Key modules:

- `Fleet.jsx` — page coordination, interaction state, notifications, and cancellation.
- `components/FleetFilters.jsx` — filter controls.
- `components/FleetBookingRow.jsx` — reservation row presentation.
- `components/FleetTimeline.jsx` — timeline presentation and mission interactions.
- `hooks/useFleetBookings.js` — reservation fetching, refresh, loading state, and errors.
- `hooks/useFleetDerivedData.js` — reservation indexing, filtering, grouping, statistics, and timeline grouping.

Fleet receives spacecraft through its `ships` prop.

Successful cancellation updates local booking state without an additional booking fetch.

The timeline is derived from all eligible bookings independently of the reservation-card filters.

### `src/js/shared/`

Contains functionality whose responsibility is shared or independent of a particular feature's UI.

- `components/` — reusable presentation components.
- `services/api.js` — canonical frontend API client.
- `utils/schedule.js` — scheduling and Central Time utilities.

A module does not need multiple current consumers to qualify as shared. Its responsibility and intended ownership determine its location.

### `src/css/`

All frontend stylesheets are centralized here.

Do not colocate CSS files with React features or components.

## Dependency rules

1. Application code may import feature and shared modules.
2. Features may import their own modules and shared modules.
3. Shared modules must not import application or feature-private modules.
4. Features must not import another feature's private implementation.
5. Prefer direct imports; do not add barrel files without a demonstrated need.

## Component and hook ownership

Keep UI state near the component that coordinates it.

Extract a component when it owns a meaningful presentation responsibility.

Extract a hook when it owns a cohesive stateful or derived-data responsibility.

Avoid creating hooks, utilities, services, or directories solely for structural symmetry.

## Testing conventions

Place tests beside the modules they verify.

For behavior-preserving refactors:

1. Establish the existing test baseline.
2. Make one bounded architectural change.
3. Add focused tests where they provide meaningful coverage.
4. Run relevant tests and the complete frontend suite.
5. Run formatting and production-build checks.
6. Verify affected browser interactions.
7. Avoid modifying source databases.

## Verified regression baseline

The current local/demo candidate record, dated **November 18, 2026**, verifies **172 frontend tests across 18 files**, formatting and the production build. See the [release record](../docs/releases/LOCAL_DEMO_RELEASE_2026-11-18.md) for source identity, environment, full results and the still-open device-accessibility gate.

At the completion of Batch 6G.2:

- 157 tests passed across 17 test files.
- Formatting and production build passed.
- Both whitespace checks passed.
- Desktop verification used 1280×720.
- Mobile verification used 608×932.
- 33 browser snapshots were checked against independent database calculations.
- Cancellation updates were verified using disposable database copies.
- Source database hashes remained unchanged.

These values describe a historical verified checkpoint, not a permanent test-count requirement.

## Refactoring principles

- Preserve behavior unless a separate change explicitly authorizes behavioral changes.
- Prefer clear ownership over maximum code extraction.
- Keep API contracts stable during structural refactors.
- Preserve Central Time scheduling semantics.
- Keep cancellation and booking operations protected by regression tests.
- Avoid unnecessary abstractions, duplicate implementations, and empty folders.
- Document architectural decisions that future developers would otherwise need to rediscover.
