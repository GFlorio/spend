# Prototype scope assumptions

This backlog assumes:

* One implicit local budget/workspace; no budget name or budget switcher.
* Generic `$` display, using device-locale number formatting.
* Local-only operation with no accounts, sharing, or sync.
* No History screen; previous months are opened through the month selector.
* No user-editable date for expenses or transfers. Their originating period supplies the time context.
* Bill payments retain a payment date, defaulting to the current device date.
* No categories, due dates, attachments, or notes.
* Envelopes have a separate overview, but money movement is initiated from period cards.
* Envelope balances may be negative.
* All amounts are stored in integer minor units rather than floating-point values.

---

# Epic 1 — Month navigation and lifecycle

Enable users to explicitly create, open, and adjust monthly plans without accidentally generating data.

## MTH-1 — View a month workspace

**As a user, I want to open the app directly into a month so that I can immediately see my financial status.**

Acceptance:

* The current month opens by default when it exists.
* Otherwise, the most recently created month opens.
* The screen contains the monthly status card and all period cards.
* Historical months use the same interface as the current month.

## MTH-2 — Open the month selector

**As a user, I want to tap the month name and select another month without navigating to a separate History screen.**

Acceptance:

* Tapping the month title opens a month-selection sheet.
* Created months are listed in chronological order.
* The currently selected month is clearly indicated.
* Months containing open funds show an attention dot.
* The sheet contains an action for starting another month.

## MTH-3 — Create the first month

**As a user, I want to enter my available monthly amount so that I can begin planning.**

Acceptance:

* The amount is required.
* There is no copy option when no previous month exists.
* No month data is persisted until the user confirms.
* Confirming creates the month and its spending periods.

## MTH-4 — Create a subsequent month

**As a user, I want to confirm the new month’s amount and decide whether to copy the prior bill setup so that fluctuating income or incomplete data does not propagate accidentally.**

Acceptance:

* The amount defaults to the previous month’s amount.
* A toggle such as **Copy July’s bills** defaults to enabled.
* Copying includes bill names, active recurring bills, and expected values.
* It never copies paid states, actual bill values, expenses, transfers, or period balances.
* The month is created only after explicit confirmation.

## MTH-5 — Cancel month creation safely

**As a user, I want to inspect a potential new month without accidentally creating it.**

Acceptance:

* Merely selecting an uncreated month does not materialize any data.
* Canceling the setup leaves the data store unchanged.
* Returning later presents the setup again.

## MTH-6 — Change the monthly available amount

**As a user, I want to correct or update the available amount for a month so that the plan reflects reality.**

Acceptance:

* The monthly amount can be changed after creation.
* Existing bills and transactions remain unchanged.
* Period allocations are recalculated immediately.
* The recalculation uses the same global allocation rules as initial creation.
* The resulting change is visible in the monthly and period balances.

---

# Epic 2 — Monthly status and bills

Give users an at-a-glance monthly status while keeping bill payment directly accessible inside the same compact card.

## STA-1 — View the collapsed monthly status

**As a user, I want to see the most important monthly figures without expanding a large dashboard.**

Acceptance:

* The primary number is the amount left or safe to spend for the month.
* Bill progress is shown beneath it, such as `4 of 7 paid`.
* The amount still reserved for unpaid bills may be shown compactly.
* The card remains small enough that period cards are visible without substantial scrolling.

## STA-2 — Expand the monthly status

**As a user, I want to expand the monthly status when I need bill details or an explanation of the total.**

Acceptance:

* Expanding the card reveals individual bills.
* It also exposes a compact calculation breakdown.
* Collapsing the card returns to the main number and bill progress.
* Envelopes are not displayed as children of this card.

## BIL-1 — Add a recurring monthly bill

**As a user, I want to add a bill with a name and expected amount so that it is reserved in the monthly plan.**

Acceptance:

* Name and expected amount are required.
* No due date is requested.
* The bill begins in the currently selected month.
* It becomes part of the bill setup available to following months.
* Adding it recalculates the monthly and period amounts.

## BIL-2 — Mark a bill as paid quickly

**As a user, I want to mark an unpaid bill as paid with one action when the expected amount was correct.**

Acceptance:

* The bill row has a direct paid/unpaid control.
* Marking it paid defaults the actual amount to the expected amount.
* Payment date defaults to the current device date.
* The user does not have to open a full form for the common case.

## BIL-3 — Record a different actual bill value

**As a user, I want to enter the actual amount when it differs from the expected amount.**

Acceptance:

* Opening the bill row exposes actual amount and payment date.
* The expected amount remains visible for comparison.
* Actual versus expected is emphasized only when they differ.
* Saving recalculates all period allocations globally.

## BIL-4 — Correct or undo a bill payment

**As a user, I want to edit a payment or mark the bill unpaid again so that mistakes are easy to reverse.**

Acceptance:

* A paid bill can be reopened and edited.
* The actual amount and payment date can be changed.
* The bill can be returned to unpaid status.
* Reversing or editing the payment restores the appropriate expected or actual reservation.

## BIL-5 — Rename a recurring bill

**As a user, I want a bill rename to appear consistently across months.**

Acceptance:

* Renaming changes the displayed name in every month.
* The user is not asked to choose a recurrence scope for name-only changes.
* Historical expected and actual amounts remain unchanged.

## BIL-6 — Change an expected bill amount

**As a user, I want to decide whether an expected-value change applies only to one month or from that month forward.**

Acceptance:

* The user chooses between:

  * **Only July**
  * **July and following months**
* Previous months are never changed by a forward-propagating edit.
* The currently selected month is the reference point, even when it is historical.

## BIL-7 — Remove a bill from one or more months

**As a user, I want to remove a bill only for one month or stop it from that month forward.**

Acceptance:

* The same recurrence choices are offered:

  * Current selected month only
  * Selected month and following months
* Removing a paid bill requires an explicit confirmation.
* Remaining bill and period calculations update immediately.

---

# Epic 3 — Spending periods and open funds

Divide the monthly spending pool into predictable seven-day periods and make positive or negative carry behavior explicit.

## PER-1 — Generate seven-day periods

**As a user, I want the month divided into simple fixed ranges so that I can pace ordinary spending.**

Acceptance:

* Periods are:

  * 1–7
  * 8–14
  * 15–21
  * 22–28
  * 29–end of month
* The final period is omitted when the month ends on the 28th.
* Period membership is based on calendar dates, not locale-specific week definitions.

## PER-2 — Allocate funds proportionally

**As a user, I want shorter final periods to receive a proportionally smaller allocation.**

Acceptance:

* Allocations are proportional to the number of days in each period.
* Global bill changes are distributed using the same proportions.
* Rounding is deterministic.
* Any residual minor units are assigned to a defined period, normally the last one.
* All base period allocations exactly sum to the monthly spending pool.

## PER-3 — View a collapsed period card

**As a user, I want to see each period’s remaining amount and add activity without expanding it.**

Acceptance:

* The card shows the date range.
* It shows the amount remaining.
* It may show spent versus allocated as secondary information.
* A persistent **+ Add** action is visible while the card is collapsed.
* The current period is visually distinguishable.

## PER-4 — Expand a period

**As a user, I want to inspect the activity and balance calculation for a period.**

Acceptance:

* Expanding reveals expenses and transfers associated with that period.
* Each item shows amount, description when present, and source/destination summary.
* The card can explain base allocation, carried deficit, transfers, and spending.
* The **+ Add** action remains available.

## PER-5 — Carry a deficit forward

**As a user, I want overspending in one period to reduce the next period’s available amount.**

Acceptance:

* A negative balance reduces the following period’s adjusted allocation.
* Deficits cascade through multiple periods when necessary.
* A deficit in the final period remains visible as a month-end overrun.
* Carrying a deficit does not deduct the same money twice from the monthly total.

## PER-6 — Contain positive balances

**As a user, I want unused money to remain in its original period until I deliberately move it.**

Acceptance:

* Positive balances do not automatically increase the following period.
* The money remains visible in the original period.
* The current period is not treated as unresolved merely because it has a positive balance.

## PER-7 — Move leftover funds

**As a user, I want to move a completed period’s remaining money somewhere purposeful.**

Acceptance:

* A completed period with a positive balance displays **Move leftover**.
* The amount defaults to the full positive balance but remains editable.
* Valid destinations are:

  * The immediately following period, when one exists
  * An envelope
* The source period is preselected.
* Moving the entire balance leaves the source period at zero.

## PER-8 — Identify months with open funds

**As a user, I want to know which previous months still contain unassigned money.**

Acceptance:

* A month receives an attention dot when at least one completed period has a positive balance.
* All periods in a past month are considered completed.
* In the current month, only periods whose end date has passed are considered completed.
* The dot disappears automatically when no completed period has a positive balance.
* Later bill edits may cause the dot to reappear.

---

# Epic 4 — Universal activity entry and split allocation

Use one form for expenses and transfers rather than separate expense, funding, and transfer workflows.

## TRX-1 — Open the activity form from a period

**As a user, I want every new operation to begin from a visible period so that its context is unambiguous.**

Acceptance:

* Every period card has a **+ Add** action.
* The form opens with the amount field focused.
* The originating period is retained as the activity’s temporal context.
* No user-editable date is shown.

## TRX-2 — Record a normal expense

**As a user, I want to record a basic expense with as few actions as possible.**

Acceptance:

* Destination defaults to **Spent**.
* Source defaults to the originating period.
* The only primary fields are:

  * Amount
  * Optional description
  * Sources
* A one-source expense can be saved immediately after entering the amount.

## TRX-3 — Add multiple funding sources

**As a user, I want to split an expense between the period and one or more envelopes.**

Acceptance:

* The source list initially contains only the originating period.
* The user can add envelopes as additional sources.
* The originating period can be removed after another source exists.
* It remains available to be added again.
* The final source cannot be removed.
* The same source cannot appear twice.

## TRX-4 — Allocate amounts visually and exactly

**As a user, I want to adjust a split quickly while retaining exact monetary control.**

Acceptance:

* Each source has an editable exact amount.
* A segmented allocation bar reflects the same amounts.
* Dragging a divider updates adjacent source amounts.
* Adding a source redistributes the total equally among all sources.
* Removing a source redistributes its amount proportionally among the remaining sources.
* One source absorbs residual minor units so that allocations always equal the total.
* The bar is not the only way to enter amounts.

## TRX-5 — Change the destination to move money

**As a user, I want the same form to move money into an envelope or another period.**

Acceptance:

* The destination can be changed from **Spent** to a valid envelope or period.
* The form title changes contextually:

  * **Add expense**
  * **Move money**
* A destination cannot also appear as a source.
* Source options are filtered to combinations supported by the accounting model.

## TRX-6 — Fund an envelope from the whole month

**As a user, I want to move money to an envelope without selecting a particular period.**

Acceptance:

* A source such as **Whole month** or **All periods** is available for envelope funding.
* The amount is debited proportionally across all period allocations.
* This changes period balances but does not count as spending.
* Funding from one specific period affects only that period.

## TRX-7 — Fund an envelope from outside the budget

**As a user, I want to add externally sourced money to an envelope without affecting the month.**

Acceptance:

* **Outside budget** is available as a source when the destination is an envelope.
* The envelope balance increases.
* The monthly amount and all period balances remain unchanged.
* The transaction is still associated with the originating period for ordering and display.

## TRX-8 — Transfer between envelopes

**As a user, I want to move money from one envelope to another using the same activity form.**

Acceptance:

* One envelope can be selected as the source and another as the destination.
* The source decreases by exactly the amount the destination increases.
* The transfer does not affect monthly or period spending balances.
* The operation appears in both envelope transaction histories.

## TRX-9 — Transfer money into a period

**As a user, I want to deliberately increase a period using money from another valid source.**

Acceptance:

* A period may be selected as a destination.
* Valid sources may include another period or an envelope.
* Period-to-period movement does not change the monthly total.
* Envelope-to-period movement reduces the envelope and increases the period’s available amount.

## TRX-10 — Allow negative envelope balances

**As a user, I want to use an envelope even when doing so takes it below zero.**

Acceptance:

* The save operation is not blocked by insufficient envelope balance.
* The projected resulting balance is shown before saving.
* Negative balances have a clear sign and status treatment.
* They are not represented only through color.

## TRX-11 — Prevent invalid allocations

**As a user, I want the form to keep allocations valid while I edit them.**

Acceptance:

* Allocations always equal the transaction total before saving.
* Negative source allocations cannot be entered.
* Zero-total activities cannot be saved.
* Self-transfers are prevented.
* Duplicate sources are prevented.
* The last remaining source cannot be removed.

## TRX-12 — Edit or delete an activity

**As a user, I want to correct an expense or transfer without creating compensating records manually.**

Acceptance:

* Existing activities reopen in the same form used for creation.
* Amount, description, destination, and sources can be changed.
* Deleting reverses all associated source and destination effects.
* A partial refund can be represented by reducing the expense amount.
* A full refund can be represented by deleting the expense.

---

# Epic 5 — Envelopes

Present envelopes as persistent balances independent of the selected month.

## ENV-1 — Create an envelope inline

**As a user, I want to create an envelope while choosing a source or destination so that I do not need a separate setup workflow.**

Acceptance:

* Envelope pickers include **New envelope**.
* Only a name is required.
* The new envelope becomes the selected source or destination.
* It is persisted when the enclosing activity is saved.
* Canceling the activity does not leave an unintended empty envelope.

## ENV-2 — View all envelope balances

**As a user, I want a separate overview of all envelopes so that they are not presented as children of one month.**

Acceptance:

* Envelopes have a top-level destination alongside Month and Settings.
* Every envelope shows its current persistent balance.
* The selected month does not change the displayed current balances.
* Positive, zero, and negative values are distinguishable.

## ENV-3 — Inspect an envelope’s transaction history

**As a user, I want to see how an envelope reached its current balance.**

Acceptance:

* Tapping an envelope opens its details.
* Transactions show:

  * Amount
  * Direction
  * Counterparty or `Spent`
  * Month and period
  * Optional description
* Transfers between envelopes are represented clearly in both histories.
* The displayed transactions reconcile to the current balance.

## ENV-4 — Keep envelope views informational

**As a user, I want envelope pages to remain focused on balances and history rather than presenting another set of financial actions.**

Acceptance:

* There are no Add money, Remove money, or Transfer buttons on the envelope overview.
* Money movement is initiated from a period’s **+ Add** action.
* Envelope details remain primarily a transaction inspection view.

## ENV-5 — Rename an envelope

**As a user, I want to correct an envelope name without affecting its balance or history.**

Acceptance:

* Renaming changes the label everywhere.
* Existing transactions continue referencing the same envelope identity.
* No financial recalculation occurs.

This can be considered a lower-priority prototype story, but some correction mechanism is useful.

---

# Epic 6 — Calculation integrity and explainability

Ensure every displayed amount is reproducible and that edits never silently create or destroy money.

## CAL-1 — Derive balances from primary records

**Technical enabler:** Monthly, period, bill, and envelope balances are calculated from user-entered facts rather than treated as independently editable stored totals.

Primary records include:

* Monthly available amount
* Bill expectations and payments
* Expenses
* Transfers
* Source allocations

## CAL-2 — Calculate the monthly amount correctly

The monthly safe-to-spend figure must account for:

* Monthly available amount
* Actual values of paid bills
* Expected values of unpaid bills
* Expenses funded by periods
* Net transfers entering or leaving the monthly period pool

It must not be calculated by naïvely summing displayed period balances when deficit carry is also displayed.

## CAL-3 — Explain displayed balances

**As a user, I want to inspect how an important balance was calculated when it surprises me.**

Acceptance:

* Monthly, period, and envelope balances expose a compact breakdown.
* The breakdown references recognizable items rather than internal accounting terms.
* Bill variance and deficit carry are explicitly identified.
* Internal transfers do not appear as spending.

## CAL-4 — Enforce conservation rules

The following invariants always hold:

* A split expense’s sources sum exactly to its total.
* An internal transfer decreases sources by exactly the amount added to the destination.
* Whole-month envelope funding does not count as an expense.
* Envelope-funded expenses do not reduce weekly funds again.
* Editing or deleting a transaction reverses its previous effects before applying the new ones.
* Period deficit carry changes pacing but does not double-deduct from the month.

## CAL-5 — Use deterministic monetary arithmetic

Acceptance:

* Monetary values use integer minor units.
* No calculations depend on binary floating-point arithmetic.
* Proportional distributions have a deterministic remainder rule.
* Recalculating the same records produces the same balances.

---

# Epic 7 — Local persistence and data portability

Make the prototype fully usable offline and keep the user in control of their data.

## DAT-1 — Use the app without an account

**As a user, I want to begin using the app immediately without registration.**

Acceptance:

* No authentication or account creation is required.
* One implicit local workspace is created.
* The app does not ask for a budget name or currency.

## DAT-2 — Work fully offline

**As a user, I want every core operation to work without a network connection.**

Acceptance:

* Months, bills, expenses, transfers, and envelopes can all be viewed and edited offline.
* Changes are persisted locally immediately.
* Reloading the app offline restores the latest committed state.
* No feature in the prototype depends on a remote server.

## DAT-3 — Recover from interrupted editing

**As a user, I want confirmed operations to survive a tab closure or app restart.**

Acceptance:

* Saving an operation writes it atomically.
* Partially completed forms do not create partial financial records.
* Derived balances can be rebuilt from the stored primary records.

## DAT-4 — Export all financial data

**As a user, I want to download a complete backup of my data.**

Acceptance:

* Export produces a single versioned file.
* It includes all months, bills, payments, transactions, allocations, and envelopes.
* Derived totals do not need to be exported when they can be recalculated.
* Export works offline.

## DAT-5 — Import a backup

**As a user, I want to restore an exported dataset.**

Acceptance:

* The file is validated before modifying local data.
* The app shows a concise summary of what will be restored.
* Import replaces the local financial dataset rather than attempting a complex merge.
* Invalid or unsupported files leave existing data untouched.

## DAT-6 — Reset all data

**As a user, I want to erase the local dataset when needed.**

Acceptance:

* Reset is clearly destructive.
* It requires explicit confirmation.
* It removes all financial records.
* Theme or installation state may remain, since they are application preferences rather than financial data.

## DAT-7 — Maintain stable internal identities

**Technical enabler:** Months, bills, bill series, transactions, allocations, and envelopes have stable unique IDs and internal creation/update timestamps.

These are not shown as user-editable fields, but they support deterministic ordering and later DumbSync integration.

---

# Epic 8 — Settings, PWA status, and interaction quality

Keep Settings operational and ensure the application works well as an installable responsive PWA.

## SET-1 — Select an appearance mode

**As a user, I want the app to follow my visual preference.**

Acceptance:

* Options are:

  * System
  * Light
  * Dark
* System is the default.
* The preference persists locally.

## SET-2 — View installation status

**As a user, I want to know whether the app is installed and install it when supported.**

Acceptance:

* Settings shows one of:

  * Installed
  * Installation available
  * Installation unsupported in this browser
* When installation is available, the row provides the relevant action.
* Status is communicated with text and iconography, not only a colored light.

## SET-3 — Manage persistent storage permission

**As a user, I want to know whether the browser may evict my local data.**

Acceptance:

* Settings shows whether persistent storage is granted.
* When supported and not granted, an action requests it.
* Unsupported APIs are reported clearly.
* Denial does not prevent use of the application.

## SET-4 — View offline readiness

**As a user, I want to know whether the app is ready for offline use.**

Acceptance:

* Settings reports whether the application shell and local data layer are available offline.
* A failure state provides a concise explanation or retry action.
* This status is separate from future synchronization status.

## SET-5 — Access data controls

**As a user, I want export, import, and reset controls grouped in one predictable location.**

Acceptance:

* The Settings screen contains a dedicated Data section.
* Export is the least destructive and most prominent action.
* Import and reset require confirmation before replacing or deleting data.

## UX-1 — Support mobile and desktop

Acceptance:

* Mobile uses compact stacked cards and bottom navigation.
* Desktop may use a narrow sidebar and wider cards.
* The interaction hierarchy remains consistent across layouts.
* Common operations do not require hover.

## UX-2 — Keep split allocation accessible

Acceptance:

* Exact amount fields remain usable without dragging.
* Allocation controls are keyboard accessible.
* Touch targets are appropriately sized.
* Screen readers receive source names, amounts, and resulting balances.
* Color is never the sole indicator of positive, warning, or negative state.

## UX-3 — Preserve immediate feedback

Acceptance:

* Confirmed local operations update visible balances without perceptible network-style delay.
* Bill variance, transfers, and recalculations produce immediate feedback.
* Destructive operations offer undo where practical or an explicit confirmation where not.

---

# Deferred epics

These remain outside the local prototype but should be preserved in the product roadmap.

## FUT-1 — Multiple budgets

* Create and switch between multiple budget workspaces.
* Introduce names only when multiple budgets make them necessary.
* Keep envelopes, months, and bills scoped to one budget.

## FUT-2 — DumbSync collaboration

* Map one budget workspace to one DumbSync channel.
* Join or share a channel with another household member.
* Synchronize local records when connectivity returns.
* Keep all members read/write.
* Surface synchronization state without requiring complex conflict-resolution workflows.

## FUT-3 — Conflict visibility and activity attribution

* Attach actor identity to synchronized mutations.
* Retain enough history to explain concurrent edits.
* Allow household members to inspect rather than silently lose conflicting changes.

---

# Suggested implementation slices

## Slice 1 — Basic usable budget

* Local data model
* Month creation
* Period generation
* Monthly status
* Bill creation and payment
* One-source period expenses
* Basic balance calculations

This slice should already answer:

* How much is left this month?
* Which bills are unpaid?
* How much remains in each period?
* How do I record an expense?

## Slice 2 — Full financial behavior

* Split funding
* Envelopes
* Universal move-money destination
* Whole-month envelope funding
* Period deficit carry
* Open funds and `Move leftover`
* Envelope transaction history
* Editing and deletion

## Slice 3 — Durable PWA prototype

* Month-selector attention dots
* Import/export/reset
* Offline application shell
* Persistent storage status
* Installation status
* Theme selection
* Responsive and accessibility refinement

This produces eight MVP epics, roughly fifty implementation-ready stories and enablers, while keeping multi-budget and DumbSync work outside the prototype boundary.

