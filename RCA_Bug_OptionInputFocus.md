# RCA: Option Input Loses Focus While Typing

**Date:** 2026-05-02  
**Component:** `ai-metimeter-client/src/app/pages/dashboard/create-assessment/`

## Summary

While editing `q.filteredOptions[optIndex]` in the Review/Edit step, the cursor drops out of the input after a character is typed. In some cases the typed value also appears to affect another option row.

## Root Cause

The option rows are rendered with:

```html
<div class="option-row" *ngFor="let opt of q.filteredOptions; let optIndex = index">
```

`q.filteredOptions` is an array of primitive strings. Angular's default `*ngFor` tracking uses item identity. For primitive strings, identity is effectively the primitive value itself.

That becomes unstable here because:

1. Multiple option entries often start with the same value, especially `''`
2. Typing into one field changes the tracked primitive value for that row
3. Angular treats the changed item as removed/re-added rather than as the same row
4. The DOM node for the active input can be recreated, so focus is lost
5. With duplicate primitive values, DOM reuse can look like the change leaked into another option

There is also a second issue in the same block: the text inputs are nested inside `mat-radio-group`.

```html
<mat-radio-group [(ngModel)]="q.correctAnswer">
  <mat-radio-button></mat-radio-button>
  <input matInput>
</mat-radio-group>
```

`mat-radio-group` is intended to manage the radio selection control. Wrapping unrelated text inputs inside it mixes two different form interactions in the same Material control boundary. That can interfere with focus and make option text editing behave like part of the radio control.

## Why `[(ngModel)]="q.filteredOptions[optIndex]"` Exposes It

The binding itself is valid, but each keystroke mutates the same array that `*ngFor` is iterating. Without a stable `trackBy`, Angular cannot reliably preserve the row identity for primitive duplicate values.

## Fix

Use stable index-based tracking for both question rows and option rows:

```html
*ngFor="let q of questions; let i = index; trackBy: trackByIndex"
*ngFor="let opt of q.filteredOptions; let optIndex = index; trackBy: trackByIndex"
```

Move `mat-radio-button` out of `mat-radio-group` and bind it directly to the question's selected answer:

```html
<mat-radio-button [name]="'correct-' + i"
  [checked]="q.correctAnswer === optIndex"
  (change)="setCorrectAnswer(q, optIndex)">
</mat-radio-button>
```

Use explicit one-way input binding plus an update handler for the option text:

```html
<input matInput [ngModel]="q.filteredOptions[optIndex]"
  (ngModelChange)="updateOption(q, optIndex, $event)"
  [ngModelOptions]="{standalone: true}"
  name="option-{{i}}-{{optIndex}}">
```

## Expected Result After Fix

- Typing in an option input keeps focus in the same field
- Editing one option no longer appears in neighboring rows
- Duplicate initial values like `''` no longer destabilize rendering
