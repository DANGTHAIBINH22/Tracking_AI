# Child / teen age test set

35 free-stock clips covering ages ~0 to ~25, fetched into the git-ignored
`data/age_kids/`. Before this, `data/` held only the Intel OpenVINO samples —
all adults — so nothing exercised the bottom of the age range.

```bash
bash eval/age_kids/fetch.sh     # ~150 MB, 720p, idempotent
```

`manifest.tsv` lists every clip with its Mixkit id, duration, max simultaneous
faces, max face size in pixels, and an **eyeballed** age band. The bands are
read off one detected face crop per clip — stock footage carries no birth
dates, so they support an age-*group* confusion matrix and gross-failure
hunting, not an MAE.

Groups, by filename prefix:

| prefix | clips | what it is for |
|---|---|---|
| `baby_` | 3 | 0-2, the range IMDB-trained heads barely saw |
| `child_` | 13 | ~2-13, frontal and large enough that the age head has no excuse |
| `teen_` | 10 | ~14-25, straddling the 0-18 / 18-35 bucket edge |
| `mixed_` | 5 | child and adult in one frame — neither may swallow the other |
| `farfield_` | 4 | faces at 35-49px, at/near `CFG.min_face_px_for_age` |

## Running it

```bash
PYTHONPATH=. uv run python eval/age_kids/run_eval.py
PYTHONPATH=. uv run python eval/age_kids/run_eval.py --ckpt models/model_imdb_cross_person_4.22_99.46.pth.tar
```

Scores the largest face in each clip against `eval_band` and reports group
accuracy, an indicative MAE, and a per-prefix breakdown. A prediction counts as
correct when its bracket overlaps the brackets the eyeballed band spans — "5-8"
legitimately spans `<6` and `6-13`, and insisting on one of them would be
grading the reference's precision rather than the model's.

## Results, all six brackets

Same 33 clips for every checkpoint (`children_teacher_learning` and
`farfield_woman_daughter_sidewalk` are `-` in the manifest — their largest face
switches between a child and an adult mid-clip, so a median has no right
answer):

| checkpoint | group accuracy | MAE (indicative) |
|---|---|---|
| v1 face+body (`model_imdb_cross_person...`) | 23/33 = **70%** | 5.81y |
| v1 face-only (`volo_d1_age_gender_imdb_faceonly`) | 24/33 = **73%** | 5.84y |
| **v2 Lagenda (`mivolo_v2_lagenda`, default)** | 30/33 = **91%** | **3.35y** |

Per prefix, v2 vs v1 face+body:

| | v2 | v1 f+b |
|---|---|---|
| `baby_` | 3/3 | 1/3 |
| `child_` | 10/11 | 7/11 |
| `children_` | 2/2 | 1/2 |
| `teen_` | 9/10 | 9/10 |
| `mixed_` | 4/4 | 4/4 |
| `farfield_` | 2/3 | 1/3 |

The whole gain is below 18. Teens, adults and the mixed adult+child clips are
unchanged — v1 was never wrong about them.

v2's three misses:

- `child_girl_library_homework` — 18.7 against a 13-16 band, one year over the
  bracket edge.
- `teen_girl_armchair_classroom` — 23.0 against 14-17. A real miss, not a
  boundary effect.
- `farfield_boy_deflated_ball` — 26.4 for a ~9-year-old at 35px. Resolution,
  not age.

### Predicted ages, per clip

Largest face per frame, 8 frames sampled per clip, median predicted age, via
`AgeGenderEstimator`. `v1 f+b` is the old default
(`model_imdb_cross_person_4.22_99.46.pth.tar`, dual-stream, IMDB-cleaned);
`v1 face` is the face-only volo_d1 on the same data; `v2` is MiVOLO v2 trained
on Lagenda (`mivolo_v2_lagenda.pth.tar`, ages 0-122), now the default in
`CFG.mivolo_ckpt`.

| clip | eyeballed | v1 f+b | v1 face | **v2** |
|---|---|---|---|---|
| baby_laughing_rollover | 0-1 | 7.6 | 7.5 | **0.8** |
| baby_smiling_sofa | 0-2 | 5.5 | 5.5 | **0.9** |
| child_boy_smiling_orange_room | 1-3 | 6.1 | 5.2 | **3.0** |
| child_sad_boy_swings | 4-6 | 10.2 | 9.3 | **8.2** |
| child_girl_legos | 4-6 | 12.3 | 11.8 | **7.0** |
| child_girl_maths_livingroom | 5-7 | 11.5 | 10.5 | **7.7** |
| child_sad_boy_to_camera | 5-8 | 12.4 | 11.6 | **8.0** |
| child_boy_behind_window | 5-9 (backlit) | 17.9 | 23.1 | **6.1** |
| child_unhappy_corner | 6-9 | 10.8 | 14.4 | **9.7** |
| children_classroom_raising_hands | 8-10 | 23.2 | 24.4 | **10.4** |
| child_girl_crying | 8-11 | 21.8 | 22.1 | **12.1** |
| child_boy_english_book | 9-12 | 13.9 | 13.6 | **11.4** |
| child_girl_coughing | 10-13 | 12.8 | 14.8 | 16.1 |
| children_playing_chess | 10-13 | 10.8 | 10.4 | 7.3 |
| child_girl_library_homework | 13-16 | 16.1 | 16.2 | 18.7 |
| teen_* (10 clips) | 14-25 | 19.8-29.0 | 17.8-30.0 | 19.6-27.1 |
| mixed_father_son_reading (adult face) | 30-40 | 38.9 | 37.5 | 38.1 |
| mixed_mother_daughter_reading (adult face) | 30-40 | 36.9 | 35.4 | 36.5 |
| farfield_boy_deflated_ball (35px) | 7-10 | 41.6 | 39.9 | 26.4 |
| farfield_family_walking_park (43px) | 5-8 | 32.5 | 36.3 | 28.7 |

**MAE over the 15 child clips, against eyeballed band midpoints: 5.83 (v1 f+b),
6.38 (v1 face), 2.05 (v2).** Adults move by under 1.5y, so nothing was traded
away at the top of the range. (The 3.35y in the table above is the same measure
over all 33 scored clips, children and adults together, which is why it is
higher.)

`baby_clapping_hands` reads 26.7 under v2 and 11.5 under v1 — v2 is right there.
The largest face in that clip is the mother, not the infant.

### What did not help

- **Face-only vs face+body.** `age_gender.py` used to hardcode a 6-channel
  face+body tensor, so face-only checkpoints could not load at all; that is
  fixed (it now reads `meta.with_persons_model`). Once measurable, the face-only
  v1 checkpoint turned out slightly *worse* on children, 6.38 vs 5.83. Same
  training data, so same bias.
- **`CFG.face_margin`.** Swept 0.00 / 0.15 / 0.30 / 0.45 / 0.60 with v2: MAE
  2.05 / 1.98 / 2.05 / 2.24 / 2.57. The 0.15 win is inside the noise of an
  eyeballed reference, so 0.30 was left alone.

Both were plumbing. The bias was the training distribution.

### Still open

- **Far-field is unfixed.** At 35-45px v2 still reads a child as ~26.
  `CFG.min_face_px_for_age` is 24, far below where the age head is trustworthy.
  Anything under roughly 60px should count as footfall, not demographics.
- **The `<6` boundary is inside the error bar.** `CFG.age_bins` now splits the
  under-18 range into `0-6` / `6-13` / `13-18` (see below), but v2's residual
  error on children is ~2 years, so a 5-to-7-year-old flips between the first
  two brackets from frame to frame. The per-track median vote in
  `Pipeline._reduce_votes` absorbs most of that; a single-frame reading of a
  child near 6 should not be trusted. `6-13` vs `13-18` is comfortably wider
  than the error and holds up.
- **Teens still read high.** `teen_girl_armchair_classroom` (eyeballed 14-17)
  comes out 24.3 and lands in `18-35`. Under-18 detection is reliable for
  children and unreliable for older teenagers, which matters if the bracket is
  ever used for anything but advert targeting.

## Age brackets

The `0-18` bucket was split once v2 made the distinction measurable — under the
v1 checkpoint every child read 10-12, so three child brackets would have been
three names for the same wrong answer. Brackets now, end to end:

| `CFG.age_bins` | `server/audience.AGE_GROUPS` | dropdown label |
|---|---|---|
| `0-6` | `<6` | <6 tuổi (Mầm non) |
| `6-13` | `6-13` | 6-13 tuổi (Thiếu nhi) |
| `13-18` | `13-18` | 13-18 tuổi (Thiếu niên / Học sinh) |
| `18-35` | `18-35` | 18-35 tuổi (Thanh niên / GenZ) |
| `35-55` | `35-55` | 35-55 tuổi (Trung niên / Gia đình) |
| `55+` | `>55` | >55 tuổi (Cao tuổi / Dưỡng sinh) |

Impressions recorded before the split keep the old `<18` label. They cannot be
re-bucketed — the database stores the bracket, never the measured age — so
`server/audience.LEGACY_SPANS` keeps `<18` a recognised value that reports as
its own row and, through `target_covers`, still matches adverts against all
three child brackets.
