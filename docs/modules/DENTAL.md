# Dental Module

Source of truth for CareFlow's first **specialty module**: an interactive odontogram (dental
chart), tooth-level conditions, treatment planning, and permanent dental history — available
only to dental clinics.

It is also the first module built on the **clinic type foundation**, which is what lets
CareFlow serve dental, medical, aesthetic, therapy and wellness clinics from one application
instead of forking a separate product per specialty.

---

## 1. Clinic types and capabilities

### Where the type lives

`clinics.clinic_type` — one of `dental`, `medical`, `aesthetic`, `therapy`, `wellness`,
`other` (text + CHECK, per `CLAUDE.md`).

It is on the **clinic**, not only the organization, because one organization can run
different kinds of branches: "Smile Dental & Aesthetic Center" may have a dental branch and
an aesthetic one. The clinic does the clinical work, so the clinic carries the type.

`organizations.business_type` (which existed since migration 0001) is kept. It now means
"what the business described itself as at sign-up", and supplies the **default** type for
the organization's clinics — the first clinic via `create_organization()`, later ones via the
clinic form. **Nothing gates on it.**

### Onboarding

The sign-up form asks for a **clinic type** and requires an explicit choice — it no longer
silently defaults to "Other", because the type switches specialty tools on and off. Each
clinic added later can have its own type, set on the clinic form.

### The capability registry

Features are never gated by comparing clinic types in components. There is one registry,
mirrored in two places:

| Side | Where | Role |
| --- | --- | --- |
| Database | `app.clinic_type_has_capability(type, capability)` | **Authoritative.** Every specialty table's RLS calls it. |
| Application | `lib/clinic-types.ts` → `clinicHasCapability(type, capability)` | Rendering: which tabs and buttons appear. |

A capability is a **whole module** (`"dental"`), not a sub-feature flag — nothing in the
product turns on a dental chart without dental history, and a flag per sub-feature would be
configuration nobody sets. Adding the aesthetic module later means one row in the SQL
registry and one entry in the TS map.

If the two sides ever disagree the failure is **closed**: the UI would show a tab whose data
the database then refuses. Never the reverse.

`app.capable_clinics(capability)` returns the caller's clinics that have a capability as an
array, shaped like `app.permitted_clinics()` so RLS evaluates it once per statement.

---

## 2. When the dental module appears

On a patient's profile, the **Dental Chart** and **Dental History** tabs appear when **both**:

1. the **patient's clinic** has the `dental` capability, and
2. the viewer holds `dental.view` for that clinic.

It is the patient's clinic that decides, not the user's. Someone with access to a dental
branch and an aesthetic branch sees a chart on the dental branch's patients only. (There is
no "active clinic" switcher in this app — see `CLAUDE.md` — and the patient's clinic is the
more precise rule anyway.)

This is enforced **three times**, independently:

| Layer | Enforcement |
| --- | --- |
| UI | Tabs are not rendered; dental data is not even fetched. |
| Server actions | `app/(app)/patients/dental-actions.ts` refuses a non-dental clinic or a missing permission before calling the database. |
| Database | RLS on every dental table requires permission **and** a dental-capable clinic **and** a visible patient. Even the organization owner cannot create dental data in an aesthetic clinic. |

Forcing `?tab=dental` in the URL for a non-dental patient renders nothing — verified in the
browser.

---

## 3. Tooth identity and numbering

Every record references a tooth by its **ISO 3950 code** (the FDI two-digit notation:
`16` = upper right first molar), held in the static reference table `dental_teeth`.

ISO 3950 is an international standard, so the code is stable forever and unambiguous for
permanent and (later) primary teeth. What a clinic **sees** is derived from it:

| `clinics.tooth_numbering` | Upper right first molar shows as |
| --- | --- |
| `fdi` (default) | `16` |
| `universal` | `3` |

Switching the preference changes **rendering only** — no stored record is rewritten, which
is the brief's requirement that "changing the displayed numbering system does not break
historical records". Universal numbers are derived once, in the migration, from quadrant and
position (18→1 … 28→16, 38→17 … 48→32) and asserted by the test suite.

`dental_teeth` currently holds the 32 permanent teeth. The `dentition` column and the code
range (`11`–`85`) already accommodate primary teeth (`51`–`85`, lettered A–T in Universal)
when paediatric charting is added.

---

## 4. Surfaces

`mesial`, `distal`, `buccal` (covers buccal/facial/labial), `lingual` (covers
lingual/palatal), `occlusal`, `incisal` — the `dental_surface_set` domain.

The UI offers **incisal** for anterior teeth and **occlusal** for posterior teeth. The
database accepts either on any tooth rather than forbidding the "wrong" one, because
clinicians do occasionally chart it that way on a canine.

On the odontogram, each tooth has the conventional **five-part surface diagram**:

- centre = occlusal / incisal
- the side facing the **middle of the chart** = lingual; the **outer edge** = buccal
- the side facing the **midline** = mesial; the other = distal

So mesial is on the right for teeth on the viewer's left (the patient's right) and on the
left for teeth on the viewer's right. `zoneForSurface()` in `lib/dental/teeth.ts` is the one
place this is decided.

---

## 5. Conditions vs treatments

These are deliberately **separate**. "Tooth 26 has caries" is an observation; "composite
restoration on 26" is a procedure with a lifecycle.

### Conditions (`dental_conditions`)

One finding on one tooth, optionally on specific surfaces.

| Code | Drawn as |
| --- | --- |
| `caries` | on the charted surfaces (red) |
| `restoration` | on the charted surfaces |
| `crown`, `bridge` | the crown |
| `implant`, `root_canal_treated` | the root(s) |
| `missing`, `extracted` | ghosted tooth, crossed out |
| `impacted` | the crown, dashed outline |
| `for_extraction` | an X marker |
| `under_observation` | a dot marker |
| `other` | the crown |

**Healthy is not stored.** A healthy tooth is one with no present findings; a stored
"healthy" row would have to be kept consistent with every other row on that tooth.

Lifecycle: `present` → `resolved` | `entered_in_error`; `resolved` → `entered_in_error`.
A condition is **never edited in place** — to change one, resolve it or mark it entered in
error, then record a new one.

Adding a code is one line in the `dental_condition_code` domain and one entry in
`lib/dental/vocabulary.ts`. Until the UI entry exists, `conditionMeta()` renders the raw code
instead of breaking.

### Treatments (`dental_treatments` + `dental_treatment_teeth`)

A procedure across **one or more teeth**. A bridge on 14–16 is one treatment with three rows
in `dental_treatment_teeth`, not three treatments.

Lifecycle:

```
planned ──(appointment linked)──► scheduled
   │  ◄──(appointment unlinked)──┘   │
   │                                  │
   ├──── sign-off (dental.complete) ──┴──► completed ──► entered_in_error
   │
   └──► cancelled
```

- **Linking an appointment schedules; it never completes.** The brief (§10) is explicit that
  an appointment existing must not mark planned work done.
- **Completion is an explicit sign-off** requiring `dental.complete`, stamped with the real
  signer and time by the database.
- A **completed treatment is frozen**. The only change it admits is `entered_in_error`, with
  a reason; its original completion stamps are kept as evidence of what was recorded.
- Recording a procedure "performed now" still creates it as a plan and then completes it, so
  the sign-off rules live in exactly one place.

### How the two connect: `resulting_condition`

A treatment may declare what the tooth **becomes** when it is done — an extraction →
`extracted`, a crown → `crown`. On completion, the database writes that condition onto every
treated tooth, linked back via `source_treatment_id`.

The link is **declared by the dentist when planning, never inferred** from a procedure name.
And completing a treatment **never resolves an existing finding** by itself: whether the
caries is actually gone after a restoration is a clinical judgment, so the dentist resolves
it explicitly. (The chart therefore shows both caries and restoration on a tooth until they
do.)

---

## 6. History

Nothing is ever deleted or overwritten, so history is simply every record, read in order.

- **Patient-level**: the Dental History tab — every finding, resolution, plan, sign-off,
  cancellation and correction, grouped by day.
- **Tooth-level**: select a tooth on the chart to see its timeline in the side panel.

Both come from `buildHistory()` in `lib/dental/chart.ts`, so they can never disagree.
A condition written by completing a treatment appears as part of that completion, not as a
second event. Records marked **entered in error stay in the history**, struck through with
the reason — a clinical record shows what was believed and when, including the mistakes.

Every event carries who did it, when, which teeth and surfaces, and any notes; treatments
also carry the practitioner, the linked appointment and service.

---

## 7. Appointment and service integration

- The **appointment sheet** (appointments list, calendar, patient profile) shows a **Dental
  chart** button for a dental clinic's appointment. It opens
  `/patients/{id}?tab=dental&appointment={appointmentId}`: the chart shows a banner, and
  treatments planned or recorded there are **pre-linked** to that appointment.
- A treatment can link to a **service** from the patient's own clinic (enforced by the
  database); choosing one fills in the procedure name.
- The **practitioner** defaults to the linked appointment's practitioner, otherwise the
  person recording.
- Planned treatments can be **scheduled** into any upcoming appointment of the same patient
  (the database refuses another patient's appointment).

Invoicing, payments and follow-ups continue to hang off the appointment exactly as before —
the dental module adds clinical detail to an appointment; it does not replace any of those
workflows.

---

## 8. Permissions

Three keys, following the coarse-grain precedent recorded in `CLAUDE.md` for Phases 7 and 10,
rather than the brief's eight. The distinctions kept are the ones a clinic actually enforces:

| Permission | Allows | Default roles |
| --- | --- | --- |
| `dental.view` | Read the chart, conditions, treatments, history | owner, practitioner, admin, clinic_manager |
| `dental.record` | Record conditions; plan, schedule, cancel treatments; correct entries | owner, practitioner |
| `dental.complete` | Sign off a treatment as performed | owner, practitioner |

`dental.complete` is separate from `dental.record` because signing off a procedure is a
clinical act distinct from charting it: an assistant may chart findings without being the one
who signs off. A custom role holding `dental.record` but not `dental.complete` can plan but
not complete — asserted in the test suite.

**Receptionist, finance and inventory manager get none.** The dental chart is a clinical
record, so least privilege applies. A clinic that wants its front desk to see treatment plans
(to book them) grants `dental.view` through a custom role; the default does not assume it.

Dental access also **follows patient access**: every dental policy requires the caller to be
able to see the patient, so a practitioner limited to assigned patients
(`patients.view.assigned`) sees exactly those patients' charts.

---

## 9. Audit

Every change is audited **by database trigger**, not by the application, so no write path can
skip it:

| Action | When |
| --- | --- |
| `dental.condition.added` | A finding is recorded |
| `dental.condition.recorded_from_treatment` | Completion writes a resulting condition |
| `dental.condition.resolved` | A finding is resolved |
| `dental.condition.corrected` | A finding is marked entered in error |
| `dental.treatment.planned` | A treatment is planned |
| `dental.treatment.tooth_added` | A tooth is attached to a treatment |
| `dental.treatment.scheduled` / `unscheduled` | An appointment is linked / unlinked |
| `dental.treatment.completed` | Sign-off |
| `dental.treatment.cancelled` | Cancellation |
| `dental.treatment.corrected` | Marked entered in error |

Each row records the actor, time, clinic, patient, the record, the new and **previous**
status, and the reason where one is given. Metadata carries ids and clinical codes, not
patient names (the `audit_logs` rule against patient-identifying detail).

A clinic holding dental records **cannot be re-typed as non-dental**: every dental policy
requires the dental capability, so re-typing would make its patients' dental history
unreachable. The database refuses the change (`clinics_guard_dental_type_change`).

---

## 10. AI assistant

No AI tool reads dental data yet, and the assistant's system prompt already forbids
diagnosing conditions or recommending treatment.

The module is shaped for authorized **read-only** tools later ("show this patient's dental
history", "which planned treatments are pending"): the records are structured, the
permissions are explicit, and `buildHistory()` already produces a summarisable timeline. Any
such tool must be gated on `dental.view` through the existing registry, and must only
retrieve and summarise what was recorded. It must never decide that a tooth has caries, needs
extraction, or needs a root canal — clinical judgment stays with the dentist.

---

## 11. Data model

```
dental_teeth                     static reference: 32 permanent teeth, keyed by ISO 3950 code
dental_conditions                a finding on one tooth
  ├─ clinic_id, patient_id       composite FKs to clinics / patients (tenant-safe)
  ├─ tooth_code  ──► dental_teeth
  ├─ surfaces    dental_surface_set
  ├─ condition   dental_condition_code
  └─ source_treatment_id ──► dental_treatments   (set only by completion)
dental_treatments                a procedure through its lifecycle
  ├─ clinic_id, patient_id       composite FKs
  ├─ appointment_id ──► appointments   (same patient, enforced)
  ├─ service_id     ──► services       (same clinic, enforced)
  ├─ practitioner_id ──► profiles
  └─ resulting_condition
dental_treatment_teeth           which teeth (and surfaces) a treatment covers
  └─ treatment_id ──► dental_treatments, tooth_code ──► dental_teeth
```

Reused, not duplicated: `patients`, `clinics`, `appointments`, `services`, `profiles`
(practitioners), `audit_logs`, the permission system and its RLS helpers.

Writes go through six `SECURITY INVOKER` RPCs (`dental_record_conditions`,
`dental_set_condition_status`, `dental_plan_treatment`, `dental_schedule_treatment`,
`dental_complete_treatment`, `dental_close_treatment`) because each spans several rows. None
accepts a clinic or organization id — both are read off the patient. RLS and triggers remain
the enforcement point, so the rules hold for a direct write too. Column-level INSERT grants
mean a client cannot even name a system column (`source_treatment_id`, completion stamps).

---

## 12. Deferred, with reasons

- **Primary (deciduous) teeth.** The schema accepts them; the chart draws the permanent
  dentition only, as the brief asks for first.
- **Per-tooth surfaces within one treatment in the UI.** The data model stores surfaces per
  tooth; the dialog applies one surface set to every selected tooth, which covers the common
  case. Chart teeth needing different surfaces as separate treatments.
- **Editing a plan's teeth after creation.** Cancel and re-plan; both steps are audited.
- **Resolving existing findings as part of sign-off.** Deliberately a separate, explicit step
  (see §5). A "also resolve findings on these teeth" option in the sign-off dialog would be a
  reasonable convenience later, as long as it stays an explicit choice.
- **Dental AI tools** — see §10.
- **Other specialty modules** (aesthetic treatment areas, therapy plans, medical encounters).
  The capability registry is ready for them; none is built.

---

## 13. Files

| Area | Path |
| --- | --- |
| Clinic types, capability registry | `supabase/migrations/20260928090000_clinic_type_foundation.sql`, `lib/clinic-types.ts` |
| Dental schema, RLS, triggers, RPCs | `supabase/migrations/20260928091000_dental_module.sql` |
| Tests | `supabase/tests/dental_test.sql` (43 assertions) |
| Vocabulary, teeth, chart state, history | `lib/dental/` |
| Queries / actions | `lib/dental/queries.ts`, `app/(app)/patients/dental-actions.ts` |
| Validation | `lib/validation/dental.schema.ts` |
| UI | `components/dental/` (odontogram, chart panel, dialogs, history) |
