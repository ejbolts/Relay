# FFMI score and references

The main score is conventional FFMI: `weight_kg × (1 − body_fat_pct / 100) / height_m²`.
Sex selects reference data, never a multiplier. The optional male height-adjusted
figure adds `6.1 × (1.8 − height_m)` to the unrounded raw result. It is not used on
the population chart. The original [Kouri abstract](https://pubmed.ncbi.nlm.nih.gov/7496846/)
specifies 6.3; 6.1 is retained as a separate comparison convention, not a claim of
additional precision or a validated female correction.

The reference points come from table 2 of [Schutz et al. (2002)](https://www.nature.com/articles/0802037),
the 18–34-year subgroup of a non-random white Swiss sample, measured with BIA:

| Sex    | 5th percentile | Median (50th) | 95th percentile |
| ------ | -------------: | ------------: | --------------: |
| Male   |           16.8 |          18.9 |            21.1 |
| Female |           13.8 |          15.4 |            17.6 |

These are raw FFMI values from one reference population. They are not worldwide
norms, training stages, a gym-member survey, health thresholds or genetic ceilings.
No percentile is assigned to the user from the three plotted reference points.
The display domain expands to include outlying scores; its endpoints are layout
choices, not biological limits. Athlete/drug-use/historical records were removed
from the main scale because unrelated samples do not form an achievement ladder.

Score details shows sensitivity to a hypothetical ±3 percentage-point body-fat
change, clamped to 0–100%. This is an illustration, not a confidence interval or
an estimate of the user's actual measurement error. For example, 80 kg at 180 cm
and 15% fat scores 21.0; hypothetical 12–18% fat gives 20.2–21.7.

The frame model remains optional and separate. Its lean-mass equation and target
weight are unchanged. Male frame estimates assume roughly 4–12% body fat; the
female model assumes raw FFMI 20. Neither is an individual's predicted limit.
The model's FFMI is now expressed in the same raw units as the score. No source
links or named studies are rendered inside the app's help.
