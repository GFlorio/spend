# Design Guidelines

Version 1.0
Audience: engineers and technical contributors

## 1. Purpose

This document defines the UI principles, interaction rules, and financial-model constraints for the project so future changes remain consistent, understandable, and easy to use.

The app should feel:

* fast
* clear
* calm
* touch-friendly
* financially informative at a glance
* practical rather than accounting-heavy
* simple enough for repeated household use

This is a mobile-first product. Design decisions should optimize for small screens, quick expense entry, lightweight monthly planning, and frequent repeated use.

The initial prototype is local-only and contains one implicit budget. The internal model should not prevent future support for multiple shared budgets or DumbSync-based synchronization, but those concepts should not appear in the prototype UI.

---

## 2. Core product philosophy

### 2.1 Optimize for the user’s current job

Do not design each screen to expose every financial concept at once. Design each state around what the user is trying to do at that moment.

The main recurring jobs are:

* understand how much remains available this month
* understand the balance of each spending period
* record an expense quickly
* mark a bill as paid
* move money between periods and envelopes
* notice and assign open funds from completed periods
* inspect envelope balances and transaction history

These jobs should not receive equal visual emphasis at all times.

### 2.2 Prefer derived information over user-maintained state

Users should enter financial facts. The application should derive balances, allocations, variances, and summaries.

Primary user inputs include:

* monthly available amount
* recurring bill definitions
* actual bill payments
* expenses
* transfers between periods and envelopes
* external envelope funding

Derived values include:

* monthly safe-to-spend amount
* period allocations
* period balances
* bill variance
* carried period deficits
* open funds
* envelope balances

Do not ask users to manually maintain totals that can be calculated from source records.

### 2.3 Optimize for recording now and correcting later

Common operations should be fast and reversible.

Prefer:

* sensible defaults
* inline editing
* one-tap bill payment when expected and actual values match
* reversible changes
* clear recalculation feedback

Avoid unnecessary confirmation dialogs for routine operations. Use stronger confirmation only for destructive data operations such as resetting all application data.

### 2.4 Hide implementation concepts, not financial meaning

The internal model may contain:

* budget months
* recurring bill definitions
* monthly bill instances
* funding allocations
* transfers
* period adjustments

Do not expose these terms unless users need them.

The UI should use direct language such as:

* “Add expense”
* “Move money”
* “Mark paid”
* “This month only”
* “This and following months”
* “Move leftover”

Icons may support recognition, but do not rely on icons alone for ambiguous financial actions.

---

## 3. Product vocabulary

Use the following terms consistently in implementation and product discussions.

### Budget

The shared financial workspace.

The first prototype contains one implicit budget and does not display a budget name or budget selector.

### Month

A calendar month with its own available amount, bill instances, spending periods, and calculated balances.

### Bill

A recurring financial obligation, such as rent or electricity.

### Bill occurrence

The bill as it applies to a specific month, including expected amount, payment status, actual amount, and payment details.

Do not expose “occurrence” as a primary UI term.

### Period

A fixed calendar range used to pace regular spending:

* days 1–7
* days 8–14
* days 15–21
* days 22–28
* days 29–end of month

The final period may be shorter and receives a proportional allocation.

### Expense

Money consumed from one or more funding sources.

### Envelope

A persistent balance that exists independently of the selected month.

### Transfer

Money moved between periods, envelopes, or an outside source without being consumed.

### Open funds

A positive remaining balance in a completed period.

Open funds are valid but should remain visible until the user assigns them elsewhere.

---

## 4. Information architecture

The prototype should contain three top-level destinations:

1. Month
2. Envelopes
3. Settings

Do not add a separate History screen.

### 4.1 Month

The primary operational screen.

It should answer:

* how much is available this month?
* which bills remain unpaid?
* how much remains in each period?
* which completed periods contain open funds?
* where can the user add an expense or move money?

### 4.2 Envelopes

A persistent balance overview.

It should answer:

* what envelopes exist?
* what is the current balance of each?
* what transactions produced that balance?

The screen is primarily observational. Money movement is initiated through period actions on the Month screen.

### 4.3 Settings

An operational configuration and application-health screen.

It should contain:

* appearance selection
* PWA installation status
* persistent-storage status and permission action
* offline-capability status
* data export
* data import
* full data reset

Do not include budget name or currency settings in the prototype.

---

## 5. Month lifecycle

### 5.1 Month selection

Tapping the month name opens a month menu.

The menu should show:

* existing months
* current month
* adjacent unopened months where appropriate
* a visible indicator on months containing open funds

The month menu replaces a separate history interface.

### 5.2 Explicit month creation

Opening an unused month must not immediately copy data.

Show a lightweight setup prompt containing:

* monthly available amount
* value defaulted from the previous month when available
* “Copy previous month” toggle, enabled by default
* confirmation action

This explicit step prevents accidental creation and gives the user a chance to account for variable monthly income.

### 5.3 Copy behavior

When “Copy previous month” is enabled, copy the prior month’s relevant planning structure, including active recurring bills and their expected values.

Do not copy:

* paid status
* actual bill values
* expenses
* transfers
* period balances
* open-fund state

Envelope balances persist independently and are not copied as month data.

### 5.4 Unused monthly funds

Unused funds disappear from future monthly planning unless explicitly moved elsewhere.

They remain visible in the month where they originated through positive completed-period balances.

Do not silently roll unused money into the next month.

---

## 6. Financial model and invariants

### 6.1 Monthly safe-to-spend amount

The primary monthly number should represent:

> monthly available amount minus actual paid bills, expected unpaid bills, weekly-funded expenses, and net transfers from the month into envelopes

Envelope-funded expenses must not reduce the monthly balance again.

### 6.2 Bill commitment

For monthly calculations:

* paid bills use actual values
* unpaid bills use expected values

Changing a paid bill’s actual amount triggers global period recalculation.

### 6.3 Period allocation

The monthly regular-spending pool is distributed proportionally by day count:

[
\text{period allocation}
========================

\text{regular spending pool}
\times
\frac{\text{days in period}}{\text{days in month}}
]

Residual minor units caused by rounding should be assigned deterministically, preferably to the final period.

### 6.4 Global recalculation

When bill actuals differ from expected values, recalculate all period allocations.

Past periods may therefore appear more or less overspent after a bill is updated.

This behavior is accepted for simplicity. The UI should explain meaningful recalculation effects after the triggering action.

### 6.5 Period deficit carry

A negative period balance reduces the next period’s available balance.

Deficits cascade forward through later periods.

### 6.6 Positive period balances

Positive balances remain contained in their originating period unless the user explicitly moves them.

A positive balance in a completed period is considered open funds.

### 6.7 Envelope balances

Envelope balances may become negative.

Funding an envelope is a transfer, not an expense.

Spending from an envelope reduces the envelope balance and records an expense, but must not also reduce the monthly or period balance unless those sources also fund part of the expense.

### 6.8 Split allocations

For every expense:

[
\text{expense total}
====================

\sum \text{funding-source allocations}
]

The UI must make invalid allocation totals difficult or impossible to create.

### 6.9 Money representation

Store currency values as integer minor units.

Do not use binary floating-point arithmetic for persisted money.

The prototype may display a generic `$` symbol and use device-locale number separators.

---

## 7. Month screen hierarchy

The Month screen should contain three visually distinct regions:

1. monthly status
2. spending periods
3. navigation access to envelopes and settings

Do not visually place envelopes inside or beneath the monthly budget model.

### 7.1 Monthly status card

The monthly status card is collapsed by default.

Collapsed content should show:

* monthly safe-to-spend amount as the hero metric
* bill progress
* reserved unpaid-bill amount when useful
* expansion affordance

Example:

> **$1,842 available**
> Bills: 4 of 7 paid · $1,230 reserved

Expanded content may show:

* individual bills
* paid and unpaid controls
* expected versus actual values when different
* monthly amount
* calculation breakdown
* edit-monthly-amount action

Do not place period cards or envelope balances inside this card.

### 7.2 Spending periods

Period cards should remain visible regardless of monthly-card expansion.

Each collapsed period card should show:

* date range
* current balance
* allocation or spending context when useful
* Add action
* Move leftover action when applicable

The current period should receive modest visual emphasis.

### 7.3 Screen-space rule

Collapsing the monthly card must meaningfully free space for period cards.

Do not create a collapsed state that leaves the same unused visual footprint as the expanded state.

---

## 8. Monthly status and bills

### 8.1 Bills remain collapsed under monthly status

Bills are part of monthly planning and should live inside the expanded monthly status card.

Do not create a separate top-level Bills screen in the prototype.

### 8.2 Bill progress

The collapsed monthly card should show concise bill status:

* number paid
* total number
* amount still reserved when useful

Avoid repeating expected and actual values when they are identical.

### 8.3 Paying a bill

The fastest path should be:

1. expand monthly status
2. tap the unpaid bill control
3. confirm the prefilled expected value

A one-tap payment may be used when the interaction remains reversible and the expected value is accepted as actual.

When editing payment details, allow:

* actual amount
* paid/unpaid status
* optional description if later justified

Do not expose a user-editable date in the initial prototype.

### 8.4 Recalculation feedback

If a payment changes period allocations, briefly explain the effect.

Example:

> Electricity was $16 above plan. Period allocations were recalculated.

Do not overwhelm the user with a detailed allocation table unless requested.

---

## 9. Recurring bill behavior

### 9.1 Bill creation

A bill should initially require only:

* name
* expected value
* starting month

Do not require a due date in the prototype.

### 9.2 Name edits

Renaming a bill applies across all months.

Do not ask for scope when editing only the name.

### 9.3 Expected-value edits

When changing an expected value, offer:

* This month only
* This and following months

The selected historical month determines where “following” begins.

### 9.4 Removal or deactivation

When removing a recurring bill, offer:

* This month only
* This and following months

Keep the interaction conceptually close to recurring-event editing in calendar applications.

### 9.5 UI terminology

Do not expose “template,” “instance,” or “version.”

Use ordinary language centered on the selected month.

---

## 10. Period cards

### 10.1 Periods are the primary expense-entry context

Every period card must expose an Add action even while collapsed.

Do not use a global floating expense button in the prototype.

This avoids needing to infer or select a default period.

### 10.2 Collapsed card

A collapsed period card should show:

* period range
* remaining balance
* compact spending context
* Add action
* Move leftover action when applicable

Example:

> **15–21**
> $214 left of $600
> `Add`

### 10.3 Expanded card

An expanded card may show:

* expense list
* transfer activity relevant to that period
* base allocation
* carried deficit
* explicit transfers in or out
* current balance

Keep the expanded list visually quieter than the balance summary.

### 10.4 Current-period emphasis

Highlight the current period through position, typography, or a restrained accent.

Do not rely on a large saturated background.

---

## 11. Open funds

### 11.1 Definition

A completed period with a positive remaining balance contains open funds.

Do not treat the current period as unresolved while it is still active.

### 11.2 Visibility

Open funds should be visible in:

* the completed period card
* the month selector through a notification indicator

The indicator should communicate pending allocation, not an application error.

### 11.3 Move leftover action

A completed positive period should expose:

> Move leftover

The action opens the universal transaction form prefilled with:

* full remaining amount
* originating period as source
* destination selection

Supported destinations:

* an envelope
* the next period within the same month

The amount remains editable.

### 11.4 Month boundary

Do not provide automatic transfer into the next month in the prototype.

Final-period open funds should normally be moved to an envelope or remain visibly open.

### 11.5 Recalculation

If later bill edits recreate a positive completed-period balance, the open-fund indicator returns.

Do not create a separate acknowledged or dismissed state.

---

## 12. Universal transaction form

Use one form for both expenses and transfers.

The conceptual model is:

[
\text{one destination}
\leftarrow
\text{one or more sources}
]

### 12.1 Normal expense

Default state when opened from a period:

* destination: Spent
* source: selected period
* amount input focused
* description optional

The common path should be:

1. tap Add
2. enter amount
3. save

### 12.2 Dynamic purpose

When destination is Spent, title the form:

> Add expense

When destination is an envelope or period, title the form:

> Move money

Do not require the user to choose an operation type before opening the form.

### 12.3 Supported examples

Ordinary expense:

> Spent ← 15–21

Split expense:

> Spent ← 15–21 + Groceries envelope

Envelope funding:

> Travel envelope ← 15–21

Envelope transfer:

> Travel envelope ← Emergency envelope

External funding:

> Travel envelope ← Outside budget

Period carry:

> 15–21 ← 8–14

### 12.4 Source constraints

* at least one source is always required
* the last source cannot be removed
* a source cannot equal the destination
* duplicate sources should be prevented or merged
* the originating period may be removed after another source is added
* negative source allocations are invalid

### 12.5 Destination constraints

“Outside budget” is a source for envelope funding, not an ordinary expense destination in the initial prototype.

Do not allow combinations that create unclear accounting semantics.

---

## 13. Split-allocation control

### 13.1 Source list

Show all active sources directly in the form.

Do not hide them behind a funding-source dropdown.

Each source row should display:

* source name
* exact allocated amount
* remove action when allowed

### 13.2 Adding a source

When a new source is added, redistribute the expense equally across all sources.

### 13.3 Removing a source

When a source is removed, preserve the relative proportions of the remaining sources where practical.

Any rounding residual should be assigned deterministically.

### 13.4 Allocation bar

Provide a segmented horizontal bar with draggable divisions.

The bar should:

* visually communicate ratios
* allow quick rebalancing
* update source amounts immediately
* remain usable on small screens

### 13.5 Exact amount entry

The allocation bar must not be the only input method.

Every source should retain an editable exact amount because bars alone are poor for:

* cent-level precision
* keyboard use
* accessibility
* narrow screens
* three or more funding sources

### 13.6 Validity by construction

Prefer automatic balancing over validation errors.

Useful behavior:

* editing one source adjusts a designated remainder source
* the final source absorbs rounding differences
* Save remains valid whenever the total can be reconciled automatically
* invalid negative allocations are blocked at input time

The UI should make it difficult to create an allocation total that does not equal the expense total.

---

## 14. Envelopes

### 14.1 Independent visual model

Envelopes are persistent balances, not children of the selected month.

Do not visually nest them inside monthly status or period sections.

### 14.2 Envelope overview

The Envelopes screen should show all envelopes at a glance:

* name
* current balance
* negative state when applicable

Example:

> Travel — $850
> Emergency — $2,400
> Car — −$120

### 14.3 Envelope details

Tapping an envelope opens transaction details showing:

* current balance
* money entering
* money leaving
* source or destination
* month and period context
* description when present

### 14.4 No primary actions on envelope screens

The initial prototype should not include Add, Remove, or Transfer actions on the envelope overview or detail screen.

All new transactions begin through a period’s Add action or Move leftover action.

This keeps the envelope area observational and gives the application one consistent transaction-entry context.

### 14.5 Discoverability tradeoff

Users may expect to modify an envelope from its detail screen.

Accept this limitation in the first prototype. Revisit only if usage shows that period-only transaction entry is confusing or unnecessarily slow.

---

## 15. Page-state model

Screens and components may change presentation according to the current task.

### 15.1 Overview state

Use when the user is scanning or navigating.

Priorities:

* selected month
* monthly safe-to-spend amount
* bill progress
* period balances
* open funds

### 15.2 Monthly-detail state

Use when the monthly card is expanded.

Priorities:

* unpaid bills
* paid-bill corrections
* expected versus actual differences
* monthly calculation explanation

Period cards remain accessible below.

### 15.3 Period-detail state

Use when a period is expanded.

Priorities:

* current period balance
* recorded expenses
* transfers affecting the period
* allocation breakdown

### 15.4 Entry state

Use when the universal transaction form is open, especially while the keyboard is visible.

Priorities:

* amount
* destination
* source allocation
* save action

Collapse or omit nonessential financial summary content behind the modal or sheet.

### Rule

When entering data on mobile, preserve the transaction context and remove competing chrome.

---

## 16. Visual hierarchy

### 16.1 Every screen must have one dominant focal area

For the Month screen, the priority order is:

1. monthly safe-to-spend amount
2. period balances and Add actions
3. bill detail when expanded
4. secondary calculation details

For the Envelopes screen:

1. envelope balances
2. envelope selection
3. transaction history

For Settings:

1. actionable application-health problems
2. appearance
3. data-management actions

### 16.2 Typography should carry hierarchy before containers do

Use type size, weight, spacing, and alignment before adding borders, shadows, or tinted backgrounds.

### 16.3 Monthly safe-to-spend is the hero metric

It should be the most visually prominent number on the Month screen.

Period balances come immediately after it in importance.

### 16.4 Negative values need clarity, not drama

Show negative balances clearly using:

* minus sign
* short explanatory text
* restrained status color
* contextual placement

Do not make overspending visually punitive.

---

## 17. Color system

### 17.1 Color roles

Use color semantically.

Suggested roles:

* `--brand`: navigation, actions, app identity
* `--positive`: available or resolved state
* `--warning`: open funds or low remaining balance
* `--negative`: negative balance or invalid action
* neutrals: text, surfaces, separators, inactive states

### 17.2 Brand color must not double as financial status

Do not use the brand color to mean available, overspent, or unresolved.

### 17.3 Use status color sparingly

Appropriate uses:

* compact balance indicators
* progress bars
* notification dots
* subtle tinted backgrounds
* short status text

Avoid:

* strongly colored full-card backgrounds
* simultaneous strong coloring of every period
* making every positive balance green

### 17.4 Never rely on color alone

Open funds, deficits, paid bills, and application-health states must also use text, icons, signs, or position.

---

## 18. Layout and spacing

### 18.1 Use a consistent spacing scale

Preferred spacing scale:

* 4
* 8
* 12
* 16
* 24
* 32

Avoid one-off spacing values without a strong reason.

### 18.2 Group by financial relationship

Place closely related values together:

* monthly balance and bill progress
* period balance and Add action
* envelope name and balance
* source name and allocation amount

Separate unrelated financial models with stronger spacing.

### 18.3 Preserve period visibility

The Month screen should use available vertical space primarily for period cards.

Do not allow an oversized collapsed monthly card to crowd out the operational region.

### 18.4 Responsive desktop behavior

On larger screens, preserve the same hierarchy rather than creating a dense dashboard.

Suitable adaptations include:

* wider period cards
* side-by-side monthly breakdown and bill list when expanded
* persistent navigation rail
* centered transaction sheet or dialog

Do not expose more concepts merely because more space exists.

---

## 19. Shape, borders, and surfaces

### 19.1 Use a limited radius scale

Preferred radii:

* small: 10px
* medium: 12px
* large: 16px

Do not introduce additional radius values casually.

### 19.2 Use cards selectively

Cards are appropriate for:

* monthly status
* period summaries
* transaction entry
* envelope balance summaries

Do not put every bill row, expense row, and setting inside separate elevated cards.

### 19.3 Prefer one surface language per screen

Avoid mixing:

* heavy shadows
* glass effects
* outlined cards
* highly tinted panels
* decorative dashed borders

### 19.4 Shadows are for real elevation

Use shadows for modals, sheets, or strongly emphasized surfaces.

Do not add shadows to every period card by default.

---

## 20. Typography

### 20.1 Use a small type system

Preferred roles:

* hero number
* section or card heading
* primary row value
* body text
* label and metadata

### 20.2 Month-screen hierarchy

Recommended hierarchy:

* monthly safe-to-spend: largest and strongest
* period balances: strong secondary emphasis
* bill names and envelope names: medium emphasis
* expected values and transaction descriptions: standard body
* labels and calculation metadata: muted and small

### 20.3 Labels should remain concise

Avoid excessive uppercase, letter spacing, or long explanatory labels.

Prefer:

* “Available”
* “Reserved”
* “Paid”
* “Left”
* “From”
* “To”

---

## 21. Buttons and touch behavior

### 21.1 Touch targets

Interactive elements should have a minimum target size of approximately 44–45px.

This includes:

* bill paid controls
* Add actions
* month selector
* allocation-bar handles
* source removal controls
* expansion affordances

### 21.2 Button hierarchy

Use consistently:

* primary: commit the current operation
* secondary: add source, edit, or navigate
* ghost: low-emphasis contextual actions
* destructive: reset or delete

### 21.3 Period Add action

The period Add action must remain easy to find while the card is collapsed.

Do not bury it in an overflow menu.

### 21.4 Destructive operations

Deleting records and resetting data require stronger affordances.

Routine corrections such as marking a bill unpaid should remain reversible and comparatively lightweight.

---

## 22. Motion and feedback

### 22.1 Motion should explain recalculation and movement

Good examples:

* monthly card expands and collapses
* bill status updates in place
* period balances animate briefly after recalculation
* a new expense appears in the selected period
* allocation-bar movement updates amounts continuously
* month changes slide horizontally

### 22.2 Keep motion restrained

Animations should feel responsive and should not delay input.

### 22.3 Feedback should match importance

Use:

* inline updates for balance changes
* brief toast for successful commits
* short explanation when bill variance recalculates periods
* stronger inline feedback for impossible allocations
* confirmation dialog for full data reset

Do not stack animation, toast, and modal confirmation for the same routine action.

---

## 23. Mobile-first behavior

### 23.1 The keyboard changes priorities

When an amount or description field is focused:

* keep the amount visible
* keep source totals visible
* keep Save reachable
* reduce nonessential headers
* allow source editing without dismissing the keyboard where practical

### 23.2 Allocation controls must survive narrow layouts

For multiple sources:

* stack source rows vertically
* keep exact amounts visible
* allow horizontal bar interaction without precision dependence
* avoid compressed multi-column forms

### 23.3 Bottom sheets should remain scrollable

The transaction form may exceed viewport height with multiple sources.

Use a stable header and commit action where appropriate, and ensure focused inputs are not hidden behind the keyboard.

---

## 24. Settings and application health

### 24.1 Appearance

Offer:

* System
* Light
* Dark

### 24.2 Application-health rows

Show explicit state and action rather than unexplained indicator lights.

Examples:

> **Installed app**
> Installed

> **Persistent storage**
> Not enabled · Enable

> **Offline storage**
> Ready

Status color may support these rows, but text must carry the meaning.

### 24.3 Data export and import

Export should produce a portable representation of all user data.

Import should:

* validate before replacing local data
* explain whether data will merge or replace
* reject unsupported or malformed data safely

The first prototype may use replacement-only import if clearly communicated.

### 24.4 Reset

Reset all data must require explicit confirmation and clearly state that the operation cannot be undone unless an export exists.

---

## 25. Accessibility and implementation rules

### 25.1 Never rely on color alone

Use text, icons, signs, and layout in addition to status color.

### 25.2 Maintain touch-friendly controls

Small checkboxes, drag handles, and remove icons must have enlarged interactive hit areas.

### 25.3 Support keyboard input

Exact allocation amounts, month setup, bill editing, and transaction entry must remain usable without drag gestures.

### 25.4 Provide semantic labels

Icons for expansion, payment, deletion, and source removal require accessible names.

### 25.5 Avoid excessive live-region updates

Do not announce every intermediate cent-level change while dragging an allocation boundary.

Announce meaningful committed results or stable totals.

### 25.6 Preserve contrast in light and dark themes

Muted labels, warning dots, negative balances, and selected allocation segments must remain distinguishable in both themes.

---

## 26. Prototype constraints

The first prototype includes:

* one implicit local budget
* explicit month setup
* recurring bills
* monthly bill occurrences
* global period recalculation
* fixed 7-day spending periods
* period deficits carried forward
* open-fund handling
* ordinary and split expenses
* envelope balances
* period-to-envelope transfers
* envelope-to-envelope transfers
* external envelope funding
* month navigation
* local import/export/reset
* light and dark themes
* PWA and persistent-storage status

The first prototype excludes:

* multi-user collaboration
* online synchronization
* multiple visible budgets
* bank integration
* categories
* analytics dashboards
* bill due dates
* user-editable transaction dates
* automatic next-month rollover
* multiple currencies
* actions initiated from envelope screens

Internal architecture should avoid blocking later DumbSync integration, but future synchronization requirements must not complicate the initial UI.

---

## 27. Change-management rules

Before adding or changing UI, ask:

1. What job is the user doing right now?
2. Is this information entered by the user or derivable?
3. Is the element primary, secondary, or optional for the current job?
4. Can the action be initiated from an existing context?
5. Does the change introduce a new financial concept into the UI?
6. Can the widget prevent invalid input instead of reporting it afterward?
7. Does it remain usable on a small screen with the keyboard open?
8. Does it preserve the independence of months, periods, and envelopes?
9. Is the pattern already present elsewhere?
10. Does it introduce a visual or interaction language the team must maintain?

If a change adds terminology, screens, modes, or persistent state without solving an observed usage problem, the default decision should be no.

---

## 28. Definition of success

A good design should let a user quickly:

* understand how much remains available this month
* see which bills remain unpaid
* understand each period’s balance
* record an ordinary expense with an amount and one save action
* split an expense across periods and envelopes when needed
* mark a bill as paid with minimal input
* identify completed periods with open funds
* move leftover money into an envelope or the next period
* inspect all envelope balances at a glance
* understand where any displayed balance came from
* export or restore their local data

It should do this without making the application feel like accounting software, exposing internal recurrence machinery, or crowding the mobile screen with persistent controls.

---

## 29. Implementation note

This document is intentionally conservative.

When in doubt:

* derive rather than ask
* reuse rather than add
* collapse rather than cram
* explain rather than surprise
* prevent invalid states rather than validate late
* preserve financial meaning while hiding implementation detail
* prioritize the current task over persistent visibility
* keep months, periods, and envelopes conceptually distinct

That bias should produce a product that remains simple even as the underlying financial model grows.
:::

