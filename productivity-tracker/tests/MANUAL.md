# Manual frontend checklist

Run `python3 -m http.server 8000` at the repository root and open http://localhost:8000.
About 15 minutes.

## Views

- [ ] Header shows "PRODUCTIVITY TRACKER" as a small label above the view title on every view
- [ ] Tabs under the title read Projects, Reports, Timeline, Calendar in that order; Projects is open on load
- [ ] Tabs show an icon and a label each; the active tab is underlined in the accent color
- [ ] New project dialog: leave the name empty and press Cancel; the dialog closes. Same for Edit task with the name cleared and Delete.
- [ ] New project dialog: type a name and press Enter; the project is created. Edit task: change the name and press Enter; the task is renamed, not deleted. Same for Edit record.
- [ ] Narrow window (under 400px): tabs stack icon over label, nothing overflows
- [ ] Timeline: empty state shows "Create a project first" with a "+ New project" button that opens the dialog
- [ ] Projects: "+ New project" above the list; create one, it opens in detail with 0m total
- [ ] Timeline: "+ Add record" at the top opens the record dialog
- [ ] Calendar: select a past day, "+ Add record" opens the dialog pre-filled with that day 09:00 to 10:00
- [ ] No floating button anywhere; the running bar is not overlapped
- [ ] Projects: play on the card starts a timer; the running bar appears with a live clock
- [ ] Projects: stop from the running bar; the record shows in Timeline under Today
- [ ] Reports: switch all five periods; totals, daily chart, weekly chart, hours chart, by-project bar render
- [ ] Calendar: today is outlined, the selected day lists its records, month arrows work

## Dialogs

- [ ] Project dialog: rename and recolor, the card updates
- [ ] Task dialog: add, rename, mark done (strikethrough), delete
- [ ] Record dialog: add a manual record, edit its times, delete it; end before start shows an alert

## Midnight split

- [ ] Add a manual record from yesterday 23:30 to today 00:30
- [ ] Timeline shows it under Yesterday (30m) and Today (30m)
- [ ] Calendar shows 30m on each of the two days and the same 30m row under each selected day
- [ ] Clicking either Timeline row opens the full 23:30 to 00:30 record

## Themes and type

- [ ] Headings render in Archivo, body in Inter, labels and times in a monospace; the empty state is italic serif
- [ ] No rounded corners anywhere; buttons, cards, chips, dialog and calendar cells are rectangles with 1px borders
- [ ] Save buttons are inverted: dark on light theme, light on dark theme
- [ ] Menu: Theme System follows the OS setting; Light and Dark override it
- [ ] Menu: Accent Teal, Blue, Purple recolor chips, play buttons, the + button, the weekly chart
- [ ] Reload: theme and accent persist, no flash of the other theme
- [ ] In Light: all four views, the running bar, and all three dialogs are readable; date inputs are light
- [ ] In Dark: same check

## Countdown

- [ ] Projects view shows the mode row: Stopwatch active by default
- [ ] Tap Countdown: a drawer slides out on the right with 15, 25, 45, 60 and a minutes field; tap Stopwatch: it slides away
- [ ] Type 1 in the minutes field, press play on a project: running bar shows an hourglass and 1:00 counting down, red under 0:60
- [ ] Tap a preset: it becomes active and the minutes field clears
- [ ] At zero: chime, running bar disappears, Timeline shows a 1m record
- [ ] Start a 1-minute countdown, close the tab, reopen after two minutes: no running bar, a 1m record exists
- [ ] Start a countdown, press stop early: record ends at the stop time
- [ ] Reload: Countdown and the chosen length are still selected

## Ticking sound

- [ ] With nothing running, press the timer button: it turns accent color, no sound
- [ ] Start a stopwatch or countdown: ticking starts; switch tabs for 30 seconds: no gaps
- [ ] Stop the record: ticking stops, button stays on
- [ ] Press the button again: off; start a record: no sound

## Install and offline

- [ ] No badge next to the title and no Data source row in the menu
- [ ] Chrome address bar shows an install icon; install; the app opens in its own window
- [ ] Installed copy: turn Wi-Fi off, open it; the page loads with the same fonts and everything works

## Backup

- [ ] Export downloads `productivity-backup.json`; it contains `"version": 2` and string ids
- [ ] Import shows a dialog with counts and date, and the buttons Cancel, Merge, Replace all
- [ ] Replace all with that file restores the same data
- [ ] Create a new project, then Merge the same file: the new project stays, nothing is duplicated
- [ ] In a second browser profile (or private window) create a project, export, Merge it here: both sets of projects are present
- [ ] Import of an empty `{}` file shows an error and changes nothing

## Guided tour

- [ ] Fresh browser (no data): the empty Projects view shows "Take the tour" under "+ New project"; it opens the tour with a demo "Example project" card and the mode row
- [ ] Cards 1 to 7: welcome (centered), mode row, play button, running bar (demo bar with 12:34), tabs, menu button (Backup), menu button (Theme with live chips); the counter reads "n of 7"
- [ ] Clicking the dimmed page or the highlighted control does nothing; Skip leaves at any card; Back is disabled on card 1; the last button reads Done
- [ ] Arrow keys move between cards; Esc leaves
- [ ] On the Theme card, tap Dark then Purple: the page changes behind the card
- [ ] After Done or Skip: the demo card and demo bar are gone, "Take the tour" is gone from the empty state, and Menu, Help, Guided tour starts it again
- [ ] With a project and a timer running: the tour points at the real play button and the real running bar; stored data (DevTools, localStorage `productivity.data`) is unchanged afterwards
- [ ] Phone width: every card fits on screen next to its control

## Keyboard shortcuts

- [ ] Press ?: the list opens; press ? again or Esc: it closes. Menu, Help, Keyboard shortcuts opens the same list
- [ ] 1, 2, 3, 4 switch to Projects, Reports, Timeline, Calendar
- [ ] N opens New project; type a name containing n, t, r, s: the letters go into the field and nothing else happens
- [ ] Open a project, press T: New task opens. Esc closes it; Esc again returns to the project list
- [ ] R opens Add record
- [ ] With nothing running, S starts a timer on the open project, or on the last tracked project from the list view; S again stops it
- [ ] M toggles Stopwatch and Countdown with the drawer animation
- [ ] In Calendar, left and right arrows move the month
- [ ] Comma opens the menu
- [ ] During the tour, number and letter keys do nothing; arrows and Esc still drive the tour

## Paste tasks

- [ ] Open a project, + Add task, paste three lines "- Read\n- Write\n3. Email": the dialog closes and three tasks Read, Write, Email appear
- [ ] + Add task, paste a single line: it lands in the field, nothing is created until Save
- [ ] Paste six lines: a confirmation asks "Create 6 tasks?"; Cancel creates nothing, OK creates six
- [ ] Edit an existing task and paste two lines: the field gets the text, no tasks are created

## Sub-tasks

- [ ] In a project, + Add task "Chapter 2"; on its row press + Sub, add "Related work"; on that row + Sub, add "Reading"; the "Reading" row has no + Sub
- [ ] Rows are indented one step per level; the running bar and play buttons work on all three
- [ ] Start a timer on "Reading", stop after a minute: all three rows show 1m; "Chapter 2" shows the sum of everything under it
- [ ] Start a timer on "Chapter 2" itself: allowed, and the time is added to its row only
- [ ] Add record: the Task list shows the three tasks indented in tree order
- [ ] Click "Chapter 2", Delete: all three rows disappear at once, the undo bar reads "Deleted "Chapter 2" and 2 sub-tasks"; Undo brings all three back with their time
- [ ] Export, then Import with Replace all: the tree comes back as it was

## Undo

- [ ] Timeline: open a record, Delete; the bar reads "Deleted a 30m record" (or its length); Undo brings it back under the same day
- [ ] Project: Delete; the list returns and the bar names the project and its record count; Undo brings the project, its tasks and records back
- [ ] With a timer running, delete a record: the bar sits above the running bar, neither covers the other
- [ ] Delete a record and wait ten seconds: the bar goes away; reload: the record is gone
- [ ] Delete two records in a row, then Undo: only the second comes back
