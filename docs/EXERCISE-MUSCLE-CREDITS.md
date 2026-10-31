# Exercise muscle-credit audit

Reviewed 18 October 2026: **38 built-in strength exercises and 7 cardio entries**.
**Cable Shoulder Extensions was skipped at the owner's request and remains unchanged.**
This is an audit of the built-in catalogue, not an inspection of private workout records
or a classification of every exercise a person may have imported or created.

## What a credited set means

One completed working set contributes **1.0** to a directly trained muscle group and
**0.5** to a meaningful assisting group. More than one group can receive a full set when
both are deliberate major targets. Bench press remains **Pectorals 1.0, Triceps 0.5,
Front delts 0.5**. Warmups, unfinished sets, failed sets with zero reps and cardio do not
add strength-set credits. Existing rules for drop sets and completed reps on failed sets
are retained.

This is a practical bookkeeping model. A [dose-response meta-analysis][F] evaluated
counting indirect sets as half a set, supporting the distinction between direct and
indirect work. It does **not** validate the exact exercise-by-exercise factors below.
Those classifications are our implementation judgments, informed by the movement
references. EMG studies help identify involvement; activation percentages are not
converted into set credits or claims about equivalent muscle growth.

We credit substantial targeted or assisting work rather than every muscle that contracts
to maintain posture. This includes heavily loaded spinal erectors in hinges and bent-over
rows, but does not make a normal plank a glute working set. Grip credits assume the hands
are bearing the load; straps or assistance can change that demand.

## Corrections applied

| Exercise | Previous issue | Reviewed default |
| --- | --- | --- |
| Incline Dumbbell Press | Front delts received a full set, unlike the bench-press convention. | Pectorals 1; Front delts and Triceps 0.5 each. Assumes an ordinary low/moderate incline, not a near-vertical press. [P] |
| Overhead Press | Counted Pectorals but omitted Side delts. | Front delts 1; Side delts and Triceps 0.5 each. A strict near-vertical press is treated as shoulder work. [S] |
| Dumbbell Shoulder Press | Side delts omitted. | Same shoulder and triceps convention as Overhead Press. [S] |
| Deadlift | Knee-extension assistance was omitted, and Upper back used a separate label. | Add Quadriceps 0.5; use Mid / Upper Back 0.5. Other existing credits remain. [D] |
| Barbell Row | Loaded spinal-erector and forearm assistance were omitted. | Add Spinal erectors and Forearms 0.5 each for the unsupported bent-over variant. [B], [G] |
| Single-Arm Lat Pulldown (Machine) | Received no elbow-flexor or grip credit, unlike the two-arm pulldown. | Lats 1; Biceps and Forearms 0.5 each. Assumes a normal elbow-bending pulldown. [E] |
| Seated Cable Row | Lat work was discounted; rear-delt and forearm assistance were omitted. | Mid / Upper Back and Lats 1 each; Biceps, Rear deltoids and Forearms 0.5 each. [B], [G] |
| Seated Machine Row | Same inconsistency as the cable row. | Same targets as the cable row; no unsupported lower-back credit. [B] |
| Seated / Lying Leg Curl | Gastrocnemius knee-flexion assistance was omitted. | Hamstrings 1; Calves 0.5. Ankle position can change the assisting demand. [L], [A] |
| Machine / Single-Arm Preacher Curl | Forearm elbow-flexor assistance was omitted, unlike the other curls. | Biceps 1; Forearms 0.5. [G] |
| Plank | Incidental glute bracing received a half set. | Core 1 only for the standard unweighted plank. [L] |
| Hanging Leg Raise | Hip flexors were treated as minor assistance despite producing the leg raise. | Core and Hip flexors 1 each, assuming a controlled pelvic curl as well as hip flexion. [A] |

The old **Upper back** name also resolves to **Mid / Upper Back**, preventing duplicate
bars. When both names occur on one exercise, the existing alias rule takes the larger
credit rather than adding the two labels together.

## Complete built-in strength catalogue

Each number below is the credit **per logged working set**, not a percentage of effort.
An em dash means no additional group is credited under the default convention.

| Exercise | Direct credit: 1.0 each | Assisting credit: 0.5 each | Review / reference |
| --- | --- | --- | --- |
| Barbell Bench Press | Pectorals | Triceps; Front delts | Retained; matches the requested example. [P] |
| Incline Dumbbell Press | Pectorals | Front delts; Triceps | Updated; incline angle changes emphasis. [P] |
| Overhead Press | Front delts | Side delts; Triceps | Updated; strict vertical press. [S] |
| Dumbbell Shoulder Press | Front delts | Side delts; Triceps | Updated. [S] |
| Lateral Raise | Side delts | Upper traps | Retained; ordinary controlled lateral raise. [S] |
| Cable Fly | Pectorals | Front delts | Retained; horizontal adduction, without an elbow-extension credit. [L] |
| Pec Deck | Pectorals | — | Retained; chest fly variant, not reverse pec deck. [L] |
| Triceps Pushdown | Triceps | — | Retained; elbow-extension isolation. [L] |
| Single-Arm Cable Triceps Pushdown | Triceps | — | Retained; same action, one arm. [L] |
| Triceps Machine Extension | Triceps | — | Retained; elbow-extension isolation. [L] |
| Dips | Pectorals; Triceps | Front delts | Retained; parallel-bar dips. Torso angle changes emphasis. [P] |
| Deadlift | Glutes; Hamstrings; Spinal erectors | Quadriceps; Mid / Upper Back; Forearms | Updated; conventional barbell deadlift. [D] |
| Barbell Row | Mid / Upper Back; Lats | Biceps; Rear deltoids; Forearms; Spinal erectors | Updated; unsupported bent-over row. [B], [G] |
| Pull-up | Lats | Biceps; Forearms | Retained; standard pull-up rather than a straight-arm scapular pull. [B], [E] |
| Lat Pulldown | Lats | Biceps; Forearms | Retained; elbow-bending pulldown. [B], [E] |
| Single-Arm Lat Pulldown (Machine) | Lats | Biceps; Forearms | Updated; elbow-bending machine variant. [E] |
| Seated Cable Row | Mid / Upper Back; Lats | Biceps; Rear deltoids; Forearms | Updated; controlled shoulder extension and scapular retraction. [B], [G] |
| Seated Machine Row | Mid / Upper Back; Lats | Biceps; Rear deltoids; Forearms | Updated; same pulling actions with torso support. [B], [G] |
| Face Pull | Rear deltoids | Mid / Upper Back | Retained; upper-back assistance. Rotator-cuff subgroups remain outside the app's display taxonomy. [L] |
| Cable Shoulder Extensions | **Skipped** | **Skipped** | No analysis or mapping change in this audit. |
| Barbell Curl | Biceps | Forearms | Retained; loaded elbow flexion and forearm assistance. [E] |
| Machine Bicep Preacher Curl | Biceps | Forearms | Updated; supported curl with forearm elbow-flexor assistance. [G] |
| Single-Arm Preacher Curl | Biceps | Forearms | Updated; the same elbow-flexion convention. [G] |
| Hammer Curl | Biceps | Forearms | Retained; the app groups elbow-flexor work under Biceps and forearm assistance under Forearms. [E] |
| Back Squat | Quadriceps; Glutes | Adductors | Retained; normal squat depth and stance. [L] |
| Front Squat | Quadriceps | Glutes; Adductors | Retained; conservative knee-dominant default. [L] |
| Romanian Deadlift | Hamstrings; Glutes | Spinal erectors | Retained; hip hinge with a relatively fixed knee angle. [R] |
| Leg Press | Quadriceps; Glutes | Adductors | Retained; normal foot placement and range. [L] |
| Single Leg Press | Quadriceps; Glutes | Adductors | Retained; same movement, one leg. [L] |
| Bulgarian Split Squat | Quadriceps; Glutes | Adductors | Retained; stance and torso angle can shift the balance. [L] |
| Leg Extension | Quadriceps | — | Retained; knee-extension isolation. [L] |
| Seated Leg Curl | Hamstrings | Calves | Updated; gastrocnemius assists knee flexion. [L], [A] |
| Lying Leg Curl | Hamstrings | Calves | Updated; same assistance, with ankle-position dependence. [L], [A] |
| Hip Thrust | Glutes | Hamstrings; Adductors | Retained as an assistance estimate, not a substitute for direct hamstring work. [L], [T] |
| Standing Calf Raise | Calves | — | Retained; the app combines gastrocnemius and soleus. [L] |
| Back Extension Machine | Spinal erectors; Hamstrings | Glutes | Retained for the illustrated 45-degree hip-hinge/back-extension variant; see the variant note below. [A], [R] |
| Seated Ab Crunch Machine | Core | — | Retained; loaded trunk flexion. [A] |
| Plank | Core | — | Updated; standard anti-extension hold. [L] |
| Hanging Leg Raise | Core; Hip flexors | — | Updated; assumes a pelvic curl, not just lifting straight legs to horizontal. [A] |

**Technique-sensitive cases:** a seated spinal-extension machine that fixes the pelvis
should not automatically inherit the hip-hinge credits shown for Back Extension Machine.
The catalogue's illustration depicts the 45-degree bench variant, so that existing default
is retained instead of guessing the user's equipment. A hanging raise without pelvic
movement is more hip-flexor dominant. Steep incline presses, chest-supported barbell rows,
row elbow paths, dip torso angles, squat depth and straps also change the assumptions.

Hip-thrust hamstring assistance is deliberately only a half-credit convention. In a
[nine-week training comparison][T], hamstring growth was small despite glute growth;
assistance credits should not be read as equivalent to direct hamstring training.

## Cardio and custom exercises

Running, Incline Treadmill Walking, Cycling, Cycling (Indoor), Rowing, Stair Climber and
Walking receive **zero strength-set credits**. They remain cardio activities even though
muscles are active during them. Both weekly-set and muscle-volume calculations enforce
this distinction, including a cardio exercise with a saved muscle-contribution row.

Custom exercises keep their explicit saved contributions. If none exist, the existing
fallback gives 1.0 to the owner's muscle-group field; this audit does not infer secondary
muscles from arbitrary names or overwrite owner-created exercises. Imported aliases are
not a promise that every similarly named movement has been individually assessed.

## Applying the review to an existing installation

The existing startup synchronisation refreshes built-in contribution rows without
recreating exercises or editing saved sets. Consequently historical totals for built-in
exercises use the reviewed defaults too. An account's workout-cache revision changes
when its mappings change, so cached snapshots cannot retain the old contribution rows.
Repeated synchronisation is idempotent, other accounts are unaffected by a single-account
refresh, and custom mappings are preserved. No database schema migration is required.

## References

These sources inform muscle involvement and variant assumptions. The exact 1.0/0.5
classification is the app's judgment, not an exercise-specific result claimed by a source.

- [F — Pelland et al.: direct, indirect and fractional set counting][F].
- [P — NASM bench-press muscle involvement][P] and [bench-inclination experiment][P2].
- [S — ACE-sponsored shoulder exercise EMG research][S].
- [B — ACE-sponsored back exercise EMG research][B].
- [E — ACE biceps exercise review and pulldown involvement][E].
- [G — NASM curl anatomy, including the forearm's brachioradialis elbow flexor][G].
- [L — NASM exercise library: movement targets across the catalogue][L].
- [D — NSCA conventional deadlift technique and involved muscles][D].
- [R — NSCA Romanian deadlift technique manual excerpt][R].
- [A — ACE core anatomy and movement actions][A].
- [T — Plotkin et al.: hip-thrust versus squat training study][T].

[F]: https://pubmed.ncbi.nlm.nih.gov/41343037/
[P]: https://www.nasm.org/resource-center/exercise-library/barbell-bench-press
[P2]: https://pubmed.ncbi.nlm.nih.gov/33049982/
[S]: https://www.acefitness.org/certifiednews/images/article/pdfs/ACEShoulderStudy.pdf
[B]: https://contentcdn.eacefitness.com/April2018/ACE_BackExerStudy.pdf
[E]: https://www.acefitness.org/resources/pros/expert-articles/9033/building-better-biceps-evidence-based-exercises-for-strength-and-function/
[G]: https://www.nasm.org/resource-center/exercise-library/barbell-bicep-curl
[L]: https://www.nasm.org/resource-center/exercise-library
[D]: https://www.nsca.com/education/articles/tsac-report/the-deadlift-and-its-application-to-overall-performance/
[R]: https://www.nsca.com/education/articles/kinetic-select/romanian-deadlift-rdl/
[A]: https://www.acefitness.org/images/webcontent/SAP-Reports/Core_SAP_Reports.pdf
[T]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/

## Equipment variants

The expanded catalogue uses the existing movement estimates for equivalent equipment variants; each variant retains its own exercise ID and progress. These remain bookkeeping estimates. Chest-supported dumbbell rows and band rows use the supported/cable row mapping, without spinal-erector credit. Straight-arm pulldowns and dumbbell pullovers give one direct lat credit without curl/biceps credit. Cable kickbacks and hip abduction give one direct glute credit. All 83 built-in strength exercises have explicit mappings.
