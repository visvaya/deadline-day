# Dopasowanie krzywej wartości

Parametry nie są aktywne. Aktywacja czeka na manifest, płace i skalę pieniądza.
Raport jest źródłem wyliczonych przykładów, nie zmienia docelowych kotwic speka.
Kwoty: mln EUR; stosunki i błędy: ułamki, nie procenty. Optimum na zadeklarowanej siatce.

Metoda: przegląd całej zadeklarowanej siatki, odrzucenie zestawów łamiących
którekolwiek twarde ograniczenie, przecięcie z pasmem dopuszczalnych kolan, a dopiero
na tym przecięciu minimalizacja sumy kwadratów względnych błędów czterech kotwic.
Pusta siatka oznaczałaby brak rozwiązania na tej siatce, nigdy sprzeczność modelu.

Wersja narzędzia: **1.0.0**.
Zestawów wykonalnych w zadeklarowanej siatce: **355**.

| parametr | wartość |
| --- | ---: |
| `vmax` | 13 |
| `slope` | 6.6 |
| `midpoint` | 87.6 |
| `youngShift` | 4.8 |
| `peakEndShift` | -2.7 |
| `latePlusThreeShift` | -6.9 |
| `latePlusSixShift` | -11.1 |
| `FOREIGN_FEE_SOFT_KNEE` | 6 |

Pasmo wykonalnych kolan: **5.5 – 6.95**.

## Przykłady kwotowe

| przykład | wartość |
| --- | ---: |
| anchor70Age25 | 0.782 |
| anchor70Age25SignedError | 0.072 |
| anchor78Age26 | 2.151 |
| anchor78Age26SignedError | -0.143 |
| anchor85Age24 | 5.236 |
| anchor85Age24SignedError | -0.039 |
| anchor90Age22 | 8.554 |
| anchor90Age22SignedError | 0.104 |
| 19/peakStart | 1.935 |
| peakEnd/peakStart | 0.679 |
| peakEnd+3 | 0.367 |
| peakEnd+6 | 0.196 |
| medianAnchorError | 0.088 |
| worstAnchorError | 0.143 |
| lowerTail58Age25 | 0.134 |
| peakMinusTwoRatio | 1.309 |
| worstYearlyDropBound | 0.191 |
| primeNeutralOvrGain | 0.540 |
| primeSameOvrChange | -0.074 |
| primePlusOneOvrChange | 0.067 |
| primeMinusOneOvrChange | -0.197 |
| topAnchorBase | 8.554 |
| midAnchorBase | 5.236 |
| topLegendaryRawLow | 13.473 |
| topLegendaryRawHigh | 16.467 |
| softCappedLow | 8.224 |
| softCappedHigh | 8.431 |
| afterHaggleLow | 9.869 |
| afterHaggleHigh | 10.117 |
| spreadAbsolute | 0.207 |
| spreadVisible | 0.210 |
| spreadRelative | 0.025 |
| midOfferHigh | 7.783 |
| baseGrowthMidToTop | 0.634 |
| offerGrowthMidToTop | 0.083 |

## Górne kotwice po kwalifikacji kupców

| kotwica | baza | tiery | oferta od | oferta do | rozpiętość widoczna | względna | próg | wynik |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| 85/24 | 5.236 | very-high, legendary | 7.194 | 7.783 | 0.59 | 0.079 | ≥ 0.05 względnie | PASS |
| 90/22 | 8.554 | legendary | 8.224 | 8.431 | 0.21 | 0.025 | ≥ 0.15 mln | PASS |

## Wejścia dopasowania

```json
{
  "toolVersion": "1.0.0",
  "searchRange": {
    "vmax": [
      13
    ],
    "slope": [
      5.8,
      6.2,
      6.6,
      7,
      7.4
    ],
    "midpoint": [
      86.4,
      87,
      87.6,
      88.2,
      88.8
    ],
    "youngShift": [
      4.4,
      4.8,
      5.2,
      5.6,
      6
    ],
    "peakEndShift": [
      -2.4,
      -2.7,
      -3,
      -3.3,
      -3.6
    ],
    "latePlusThreeShift": [
      -6.6,
      -6.9,
      -7.2,
      -7.5,
      -7.8
    ],
    "latePlusSixShift": [
      -10.8,
      -11.1,
      -11.4,
      -11.7,
      -12
    ]
  },
  "priceAnchors": [
    {
      "ovr": 70,
      "age": 25,
      "target": 0.73
    },
    {
      "ovr": 78,
      "age": 26,
      "target": 2.51
    },
    {
      "ovr": 85,
      "age": 24,
      "target": 5.45
    },
    {
      "ovr": 90,
      "age": 22,
      "target": 7.75
    }
  ],
  "ageModel": {
    "defaultProfile": {
      "peakStart": 24,
      "peakEnd": 29,
      "declineBase": 1.25,
      "declineAccel": 0.55
    },
    "positionProfiles": {
      "BR": {
        "peakStart": 26,
        "peakEnd": 33,
        "declineBase": 1.2,
        "declineAccel": 0.6
      },
      "ŚO": {
        "peakStart": 26,
        "peakEnd": 32,
        "declineBase": 1.2,
        "declineAccel": 1.8
      },
      "LO": {
        "peakStart": 24,
        "peakEnd": 29,
        "declineBase": 1.2,
        "declineAccel": 0.71
      },
      "PO": {
        "peakStart": 24,
        "peakEnd": 29,
        "declineBase": 1.2,
        "declineAccel": 0.71
      },
      "POM": {
        "peakStart": 25,
        "peakEnd": 31,
        "declineBase": 1.3,
        "declineAccel": 1.3
      },
      "LS": {
        "peakStart": 23,
        "peakEnd": 28,
        "declineBase": 1.2,
        "declineAccel": 0.59
      },
      "PS": {
        "peakStart": 23,
        "peakEnd": 28,
        "declineBase": 1.2,
        "declineAccel": 0.59
      },
      "ŚN": {
        "peakStart": 24,
        "peakEnd": 30,
        "declineBase": 1.2,
        "declineAccel": 1.02
      },
      "CLS": {
        "peakStart": 23,
        "peakEnd": 28,
        "declineBase": 1.2,
        "declineAccel": 0.46
      },
      "CPS": {
        "peakStart": 23,
        "peakEnd": 28,
        "declineBase": 1.2,
        "declineAccel": 0.46
      },
      "ŚPD": {
        "peakStart": 26,
        "peakEnd": 32,
        "declineBase": 1.2,
        "declineAccel": 1.8
      },
      "ŚP": {
        "peakStart": 25,
        "peakEnd": 31,
        "declineBase": 1.3,
        "declineAccel": 1.3
      },
      "LP": {
        "peakStart": 23,
        "peakEnd": 29,
        "declineBase": 1.2,
        "declineAccel": 0.64
      },
      "PP": {
        "peakStart": 23,
        "peakEnd": 29,
        "declineBase": 1.2,
        "declineAccel": 0.64
      },
      "ŚPO": {
        "peakStart": 23,
        "peakEnd": 29,
        "declineBase": 1.2,
        "declineAccel": 0.52
      },
      "CN": {
        "peakStart": 25,
        "peakEnd": 31,
        "declineBase": 1.2,
        "declineAccel": 1.9
      },
      "N": {
        "peakStart": 24,
        "peakEnd": 30,
        "declineBase": 1.2,
        "declineAccel": 1.02
      }
    },
    "ratioReferenceOvr": 70,
    "ratioReferenceAge": 24,
    "ratioBands": [
      {
        "label": "19/peakStart",
        "ageForDefaultProfile": 19,
        "min": 1.9,
        "max": 2.3
      },
      {
        "label": "peakEnd/peakStart",
        "ageForDefaultProfile": 29,
        "min": 0.55,
        "max": 0.7
      },
      {
        "label": "peakEnd+3",
        "ageForDefaultProfile": 32,
        "min": 0.28,
        "max": 0.4
      },
      {
        "label": "peakEnd+6",
        "ageForDefaultProfile": 35,
        "min": 0.12,
        "max": 0.2
      }
    ]
  },
  "constraintThresholds": {
    "minMarketValue": 0.05,
    "maxYearlyDrop": 0.2,
    "medianAnchorError": 0.15,
    "worstAnchorError": 0.25,
    "topAnchorCeiling": 9,
    "minVisibleSpread": 0.15,
    "minRelativeSpread": 0.05
  },
  "transfer": {
    "haggleSaleBonus": 0.2,
    "marketEmptyMultiplier": 1.4,
    "priceDeviation": [
      0.9,
      1.1
    ],
    "maxDomesticFee": 5.5,
    "maxForeignFee": 11,
    "maxUnhaggledForeignFee": 9.166666666666668,
    "foreignTiers": [
      {
        "name": "high",
        "buyerFactor": 1.15,
        "maxSpend": 7
      },
      {
        "name": "very-high",
        "buyerFactor": 1.2,
        "maxSpend": 9
      },
      {
        "name": "legendary",
        "buyerFactor": 1.25,
        "maxSpend": 11
      }
    ]
  }
}
```

## Wynik z pełną precyzją

```json
{
  "params": {
    "vmax": 13,
    "slope": 6.6,
    "midpoint": 87.6,
    "youngShift": 4.8,
    "peakEndShift": -2.7,
    "latePlusThreeShift": -6.9,
    "latePlusSixShift": -11.1
  },
  "knee": 6,
  "feasibleKnees": [
    5.5,
    5.55,
    5.6,
    5.65,
    5.7,
    5.75,
    5.8,
    5.85,
    5.9,
    5.95,
    6,
    6.05,
    6.1,
    6.15,
    6.2,
    6.25,
    6.3,
    6.35,
    6.4,
    6.45,
    6.5,
    6.55,
    6.6,
    6.65,
    6.7,
    6.75,
    6.8,
    6.85,
    6.95
  ],
  "examples": {
    "anchor70Age25": 0.782239604884118,
    "anchor70Age25SignedError": 0.07156110258098364,
    "anchor78Age26": 2.150925040460117,
    "anchor78Age26SignedError": -0.14305775280473418,
    "anchor85Age24": 5.236001323763272,
    "anchor85Age24SignedError": -0.03926581215352809,
    "anchor90Age22": 8.554442496540714,
    "anchor90Age22SignedError": 0.10379903181170506,
    "19/peakStart": 1.9349863237218379,
    "peakEnd/peakStart": 0.6790664197694761,
    "peakEnd+3": 0.3669935927154061,
    "peakEnd+6": 0.1964227693323353,
    "medianAnchorError": 0.08768006719634436,
    "worstAnchorError": 0.14305775280473418,
    "lowerTail58Age25": 0.13371344729142118,
    "peakMinusTwoRatio": 1.3089297886752085,
    "worstYearlyDropBound": 0.19113335281791033,
    "primeNeutralOvrGain": 0.54,
    "primeSameOvrChange": -0.07383335656311196,
    "primePlusOneOvrChange": 0.06717849771453,
    "primeMinusOneOvrChange": -0.19725673303388747,
    "topAnchorBase": 8.554442496540714,
    "midAnchorBase": 5.236001323763272,
    "topLegendaryRawLow": 13.473246932051623,
    "topLegendaryRawHigh": 16.467301805840872,
    "softCappedLow": 8.224198695969447,
    "softCappedHigh": 8.431167109219512,
    "afterHaggleLow": 9.869038435163336,
    "afterHaggleHigh": 10.117400531063414,
    "spreadAbsolute": 0.2069684132500651,
    "spreadVisible": 0.21,
    "spreadRelative": 0.025225225225225228,
    "midOfferHigh": 7.782755490623809,
    "baseGrowthMidToTop": 0.6337739369386519,
    "offerGrowthMidToTop": 0.08331388791243288
  },
  "upperAnchorSpreads": [
    {
      "label": "85/24",
      "base": 5.236001323763272,
      "spread": {
        "low": 7.194054006160236,
        "high": 7.782755490623809,
        "spread": 0.5887014844635727,
        "visibleSpread": 0.59,
        "relative": 0.07882431529726118,
        "tiers": [
          {
            "name": "very-high",
            "low": 7.194054006160236,
            "high": 7.5
          },
          {
            "name": "legendary",
            "low": 7.314256783296839,
            "high": 7.782755490623809
          }
        ]
      },
      "passes": true
    },
    {
      "label": "90/22",
      "base": 8.554442496540714,
      "spread": {
        "low": 8.224198695969447,
        "high": 8.431167109219512,
        "spread": 0.2069684132500651,
        "visibleSpread": 0.21,
        "relative": 0.025225225225225228,
        "tiers": [
          {
            "name": "legendary",
            "low": 8.224198695969447,
            "high": 8.431167109219512
          }
        ]
      },
      "passes": true
    }
  ]
}
```
