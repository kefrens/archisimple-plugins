# Review sheet — zone UC

84133_PLU_20181012 · chapter pages 45–56 · 16 rules drafted by Claude Opus 5.5 (a subagent), from the written conventions of the evaluation set on 2026-11-20.
Validated by independent cross-check (a second model, Fable 5.2, that did not see this truth) reconciled by Claude Code; not validated by the owner on 2026-11-20.

Scope: Left out as out of scope: art. 2 office floor area cap (75 m2) and social-housing shares (30 % / 25 %); art. 3 access-road widths (5 m) and gate recess (5 m from the alignment); art. 4 stormwater formula; art. 5 (characteristics of plots, not regulated, not a listed kind); art. 11 roof slopes (25-35 %), window proportions, awning and pillar sizes, fence and wall heights (0.50 m, 0.60, 0.80 m, 1.80 m); art. 12 parking (25 m2, 2.30 m, 1 place per 50 m2 / 25 m2); art. 14 cycle parking (0.75 / 1.5 / 3 m2, 1.5 %). Art. 6 setbacks from river and canal banks (zone UC: 20 m Eze, 20 m Ourgouse, 10 m other watercourses; UCa: 20 m Eze) were left out as not road or public-space setbacks. Described rules not listed: art. 6 and 7 'dispositions particulières' (extensions of non-compliant buildings, public-service technical works) and art. 7 annexes allowed on the side boundaries.

Check each **number, sector and page** against its quote. Wording does not matter.

## The rules, by sector

### (whole zone)

- **road_setback** · ≥ 10 m · page 49 · tc01
  > 10 mètres de l’axe de la RD956,
  > _note: Art. 6 zone UC: minimum 10 m from the axis of the RD956._
- **road_setback** · ≥ 10 m · page 49 · tc02
  > 10 mètres de l’axe des autres voies et emprises publiques ou privées existantes, modifiées ou à créer,
  > _note: Art. 6 zone UC: minimum 10 m from the axis of the other roads and public spaces._
- **boundary_setback** · 1 × altitude_difference − 4 m, min 4 m · page 50 · tc07
  > Dans le reste de la zone UC, les constructions et piscines doivent s’implanter en respectant un recul (L) au moins égal à la différence de niveau (H) entre tout point du bâtiment à édifier et le point le plus proche de la limite séparative, diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m.
  > _note: Art. 7 rest of zone UC: L = H-4 >= 4 m._
- **building_distance** · not regulated · page 50 · tc08
  > aux autres sur une même propriété Non règlementé.
  > _note: Art. 8: not regulated._
- **footprint_ratio** · ≤ 30 % (plot_area) · page 50 · tc09
  > Dans la zone UC, l’emprise au sol totale des constructions ne peut excéder 30% de la surface de l’unité foncière.
  > _note: Art. 9 zone UC: footprint at most 30 % of the plot._
- **height_facade** · ≤ 6.5 m · page 51 · tc11
  > La hauteur des constructions ne peut excéder 6,50 mètres à l’égout du toit (ou acrotère) et 8 mètres au faîtage.
  > _note: Art. 10: at most 6.50 m at the eaves (or parapet)._
- **height_total** · ≤ 8 m · page 51 · tc12
  > La hauteur des constructions ne peut excéder 6,50 mètres à l’égout du toit (ou acrotère) et 8 mètres au faîtage.
  > _note: Art. 10: at most 8 m at the ridge._
- **height_total** · ≤ 3.5 m · page 51 · tc13
  > 3,5 mètres dans le cas d’une implantation en limite séparative, et sur une profondeur de 4 mètres,
  > _note: Art. 10 annexes: ridge at most 3.5 m when on the boundary, within a 4 m depth._
- **height_total** · ≤ 4 m · page 51 · tc14
  > 4 mètres dans le cas d’une implantation à minimum 4 mètres de la limite séparative.
  > _note: Art. 10 annexes: ridge at most 4 m when at least 4 m from the boundary._
- **green_ratio** · ≥ 50 % (plot_area) · page 54 · tc15
  > Dans la zone UC, au minimum 50 % de la surface totale du terrain sera traitée en pleine terre.
  > _note: Art. 13 zone UC: at least 50 % open ground._

### UCa

- **road_setback** · ≥ 10 m · page 49 · tc03
  > 10 mètres de l’axe de la RD 165,
  > _note: Art. 6 sub-sectors UCa: minimum 10 m from the axis of the RD 165._
- **road_setback** · ≥ 6 m · page 49 · tc04
  > 6 mètres de l’axe des autres voies publiques ou privées, existantes, modifiées ou à créer,
  > _note: Art. 6 sub-sectors UCa: minimum 6 m from the axis of the other roads._
- **boundary_setback** · 1 × altitude_difference − 4 m, min 4 m · page 49 · tc05
  > Soit sur une des limites séparatives latérales en respectant un recul (L) par rapport à la limite séparative opposée au moins égal à la différence de niveau (H) entre tout point du bâtiment à édifier et le point le plus proche de la limite séparative, diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m (cas 1) ;
  > _note: Art. 7 UCa, case 1: on one side boundary, L = H-4 >= 4 m from the opposite boundary._
- **boundary_setback** · 1 × altitude_difference − 4 m, min 4 m · page 50 · tc06
  > Soit en respectant un recul (L) au moins égal à la différence de niveau (H) entre tout point du bâtiment à édifier et le point le plus proche de la limite séparative, diminuée de 4 mètres, avec un minimum de 4 mètres, soit L = H-4 ≥ 4m (cas 2) ;
  > _note: Art. 7 UCa, case 2: set back L = H-4 >= 4 m._
- **footprint_ratio** · ≤ 40 % (plot_area) · page 51 · tc10
  > Dans le sous-secteur UCa, l’emprise au sol totale des constructions ne peut excéder 40% de la surface de l’unité foncière.
  > _note: Art. 9 UCa: footprint at most 40 % of the plot._
- **green_ratio** · ≥ 40 % (plot_area) · page 54 · tc16
  > Dans le sous-secteur UCa, au minimum 40 % de la surface totale du terrain sera traitée en pleine terre.
  > _note: Art. 13 UCa: at least 40 % open ground._

## Figures the text writes that no truth quote covers

The drafter's likely misses: if a rule of the scope's kinds is among them, say so and it is added. Most are outside the scope (fences, thresholds, parking).

- page 45 · **75m2** — Article 2 – Occupations et utilisations du sol soumises à des conditions particulières Sont autorisés sous conditions, dans toute la zone :  les constructions à destination de bureaux sous réserve que leur surface de pl
- page 46 · **25%** — lan Local d’Urbanisme de la commune de la Tour d’Aigues – Tome 5 - Règlement © G2C Territoires 46 ZONE UC  Tout programme de construction à usage d’habitation de plus de 3 logements devra comporter au minimum 30% de log
- page 47 · **5 mètres** —  Dans le cas de 2 constructions réalisées en double front, la largeur de cette voie est de 5 mètres (cas 3 et 4).
- page 49 · **20 mètres** — Article 6 – Implantation des constructions par rapport aux voies et emprises publiques  Dispositions générales Dans l’ensemble de la zone UC, les constructions (y compris les annexes) doivent s’implanter en respectant u
- page 52 · **35%** — Les pentes doivent être comprises entre 25 et 35%.
- page 52 · **1 mètre** — Les fenêtres seront rectangulaires dans le sens de la hauteur dans une proportion de 1 x 1,5 à 1,6 et ne dépasseront que rarement 1 mètre de large.
- page 53 · **1,5 mètre** — Lorsqu’ils seront envisagés sur une autre façade, ces auvents auront des dimensions suffisantes pour être utilisés comme porche ou terrasse abritée (minimum 1,5 mètre de profondeur).
- page 53 · **0,50 mètre** — Elle doit être de forme simple : Seules les clôtures grillagées (sur piquets métalliques) éventuellement doublées d’une haie vive peuvent être autorisées, sans soubassements maçonnés d’une hauteur supérieure à 0,50 mètre
- page 53 · **0,80 mètre** — Dans ce cas, en bordure de voirie publique, seuls sont autorisés des murets d’une hauteur maximale de 0,80 mètre surmontés d’une grille ou d’un grillage, avec une hauteur totale de 1,80 mètre maximum.
- page 53 · **1,80 mètre** — Des murs maçonnés, enduits comme la construction, d’une hauteur maximum de 1,80 mètre pourront être autorisés en limite séparative avec les zones destinées à recevoir des activités industrielles et artisanales ou entre l
- page 54 · **25 m2** — Pour chaque place de stationnement, une surface moyenne de 25 m2, dégagement y compris, doit être prévue.
- page 54 · **2,30 mètres** — Les places ont une largeur minimale de 2,30 mètres.
- page 54 · **50 m2** — Pour les constructions à usage d’habitation, il est exigé l’aménagement d’une place de stationnement par tranche entamée de 50 m2 de surface de plancher.
- page 55 · **0,75 m2** — Pour le stationnement des cycles, il sera exigé :  Habitat collectif et opérations d’ensemble : minimum 0,75 m2 par logement de 2 pièces ou moins, 1,5 m2 par logement de 3 pièces et plus, avec une surface minimale total
- page 55 · **1,5 m2** — Pour le stationnement des cycles, il sera exigé :  Habitat collectif et opérations d’ensemble : minimum 0,75 m2 par logement de 2 pièces ou moins, 1,5 m2 par logement de 3 pièces et plus, avec une surface minimale total
- page 55 · **3 m2** — Pour le stationnement des cycles, il sera exigé :  Habitat collectif et opérations d’ensemble : minimum 0,75 m2 par logement de 2 pièces ou moins, 1,5 m2 par logement de 3 pièces et plus, avec une surface minimale total
- page 55 · **1,5%** — Pour le stationnement des cycles, il sera exigé :  Habitat collectif et opérations d’ensemble : minimum 0,75 m2 par logement de 2 pièces ou moins, 1,5 m2 par logement de 3 pièces et plus, avec une surface minimale total

