/** Historical snowball months from Debt Calculator 3.0 (Sept 2022–July 2026). */

export const seededHistoryDebts = [
  {
    "id": "debt-p-boa",
    "lender": "P BoA",
    "apr": 14.49,
    "type": "credit-card"
  },
  {
    "id": "debt-t-boa",
    "lender": "T BoA",
    "apr": 24.49,
    "type": "credit-card"
  },
  {
    "id": "debt-b-boa",
    "lender": "B BoA",
    "apr": 22.74,
    "type": "credit-card"
  },
  {
    "id": "debt-discover",
    "lender": "Discover",
    "apr": 16.49,
    "type": "credit-card"
  },
  {
    "id": "debt-ikea",
    "lender": "Ikea",
    "apr": 21.99,
    "type": "loan"
  },
  {
    "id": "debt-paypal-3",
    "lender": "Paypal [3]",
    "apr": 0,
    "type": "credit-card"
  },
  {
    "id": "debt-citi",
    "lender": "Citi",
    "apr": 23.49,
    "type": "credit-card"
  },
  {
    "id": "debt-paypal",
    "lender": "Paypal",
    "apr": 24.74,
    "type": "credit-card"
  },
  {
    "id": "debt-ally-cs",
    "lender": "Ally CS",
    "apr": 0,
    "type": "credit-card"
  },
  {
    "id": "debt-ally-cpt",
    "lender": "Ally CPT",
    "apr": 14.99,
    "type": "credit-card"
  },
  {
    "id": "debt-springboard",
    "lender": "Springboard",
    "apr": 8.74,
    "type": "loan"
  },
  {
    "id": "debt-amazon",
    "lender": "Amazon",
    "apr": 24.49,
    "type": "credit-card"
  },
  {
    "id": "debt-affirm",
    "lender": "Affirm",
    "apr": 15.99,
    "type": "loan"
  },
  {
    "id": "debt-tally",
    "lender": "Tally",
    "apr": 16,
    "type": "credit-card"
  },
  {
    "id": "debt-bread",
    "lender": "Bread",
    "apr": 23.99,
    "type": "loan"
  }
] as const

export const seededHistoryOpening: Record<string, number> = {
  "debt-p-boa": 17218.69,
  "debt-t-boa": 6922.34,
  "debt-b-boa": 10996.92,
  "debt-discover": 6089.53,
  "debt-citi": 4287.98,
  "debt-paypal": 2109.11,
  "debt-ally-cs": 1625,
  "debt-ally-cpt": 5429.79,
  "debt-springboard": 6620.73,
  "debt-amazon": 4928.67,
  "debt-affirm": 659.04,
  "debt-tally": 4000,
  "debt-bread": 335.63
}

export const seededDebtHistory = [
  {
    "year": 2022,
    "month": 8,
    "interest": {
      "debt-p-boa": 207.92,
      "debt-t-boa": 141.27,
      "debt-b-boa": 208.39,
      "debt-discover": 83.68,
      "debt-citi": 83.94,
      "debt-paypal": 43.48,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 67.83,
      "debt-springboard": 48.22,
      "debt-amazon": 100.59,
      "debt-affirm": 8.78,
      "debt-tally": 53.33,
      "debt-bread": 6.71
    },
    "charged": {
      "debt-p-boa": 161.2,
      "debt-b-boa": -245.77
    },
    "paid": {
      "debt-p-boa": 400,
      "debt-t-boa": 232,
      "debt-b-boa": 207,
      "debt-discover": 175,
      "debt-citi": 130,
      "debt-paypal": 50,
      "debt-ally-cs": 125,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 160,
      "debt-affirm": 60,
      "debt-bread": 17.75
    },
    "balance": {
      "debt-p-boa": 17187.81,
      "debt-t-boa": 6831.61,
      "debt-b-boa": 10752.54,
      "debt-discover": 5998.21,
      "debt-citi": 4241.92,
      "debt-paypal": 2102.6,
      "debt-ally-cs": 1500,
      "debt-ally-cpt": 5332.62,
      "debt-springboard": 6433.95,
      "debt-amazon": 4869.26,
      "debt-affirm": 607.82,
      "debt-tally": 4053.33,
      "debt-bread": 324.59
    },
    "totalInterest": 1054.14,
    "totalPaid": 1956.75,
    "extra": 0
  },
  {
    "year": 2022,
    "month": 9,
    "interest": {
      "debt-p-boa": 207.54,
      "debt-t-boa": 139.42,
      "debt-b-boa": 203.76,
      "debt-discover": 82.43,
      "debt-citi": 83.04,
      "debt-paypal": 43.35,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 66.61,
      "debt-springboard": 46.86,
      "debt-amazon": 251.69,
      "debt-affirm": 8.1,
      "debt-tally": 54.04,
      "debt-bread": 6.49
    },
    "charged": {
      "debt-p-boa": 916.86,
      "debt-t-boa": 14.4,
      "debt-discover": 1379.64,
      "debt-citi": 168.2
    },
    "paid": {
      "debt-p-boa": 1330,
      "debt-t-boa": 150,
      "debt-b-boa": 383,
      "debt-discover": 175,
      "debt-citi": 180,
      "debt-paypal": 50,
      "debt-ally-cs": 125,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 177,
      "debt-affirm": 59.13,
      "debt-bread": 331.08
    },
    "balance": {
      "debt-p-boa": 16982.21,
      "debt-t-boa": 6835.44,
      "debt-b-boa": 10573.3,
      "debt-discover": 7285.28,
      "debt-citi": 4313.15,
      "debt-paypal": 2095.95,
      "debt-ally-cs": 1375,
      "debt-ally-cpt": 5234.23,
      "debt-springboard": 6245.81,
      "debt-amazon": 4943.95,
      "debt-affirm": 556.79,
      "debt-tally": 4107.38,
      "debt-bread": 0
    },
    "totalInterest": 1193.33,
    "totalPaid": 3360.21,
    "extra": 0
  },
  {
    "year": 2022,
    "month": 10,
    "interest": {
      "debt-p-boa": 205.06,
      "debt-t-boa": 139.5,
      "debt-b-boa": 200.36,
      "debt-discover": 100.11,
      "debt-citi": 84.43,
      "debt-paypal": 43.21,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 65.38,
      "debt-springboard": 45.49,
      "debt-amazon": 100.9,
      "debt-affirm": 7.42,
      "debt-tally": 54.77
    },
    "charged": {
      "debt-citi": -1800
    },
    "paid": {
      "debt-p-boa": 400,
      "debt-t-boa": 150,
      "debt-b-boa": 400,
      "debt-discover": 175,
      "debt-citi": 180,
      "debt-paypal": 50,
      "debt-ally-cs": 125,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 160,
      "debt-affirm": 59.13,
      "debt-tally": 100
    },
    "balance": {
      "debt-p-boa": 16787.27,
      "debt-t-boa": 6824.94,
      "debt-b-boa": 10373.67,
      "debt-discover": 7210.39,
      "debt-citi": 2417.58,
      "debt-paypal": 2089.16,
      "debt-ally-cs": 1250,
      "debt-ally-cpt": 5134.61,
      "debt-springboard": 6056.3,
      "debt-amazon": 4884.85,
      "debt-affirm": 505.08,
      "debt-tally": 4062.14
    },
    "totalInterest": 1046.63,
    "totalPaid": 2199.13,
    "extra": 0
  },
  {
    "year": 2022,
    "month": 11,
    "interest": {
      "debt-p-boa": 202.71,
      "debt-t-boa": 139.29,
      "debt-b-boa": 196.58,
      "debt-discover": 99.08,
      "debt-citi": 47.32,
      "debt-paypal": 43.07,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 64.14,
      "debt-springboard": 44.11,
      "debt-amazon": 99.69,
      "debt-affirm": 6.73,
      "debt-tally": 54.16
    },
    "charged": {},
    "paid": {
      "debt-p-boa": 400,
      "debt-t-boa": 150,
      "debt-b-boa": 400,
      "debt-discover": 175,
      "debt-citi": 180,
      "debt-paypal": 50,
      "debt-ally-cs": 125,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 176,
      "debt-affirm": 59.13,
      "debt-tally": 100
    },
    "balance": {
      "debt-p-boa": 16589.97,
      "debt-t-boa": 6814.22,
      "debt-b-boa": 10170.25,
      "debt-discover": 7134.47,
      "debt-citi": 2284.91,
      "debt-paypal": 2082.23,
      "debt-ally-cs": 1125,
      "debt-ally-cpt": 5033.75,
      "debt-springboard": 5865.41,
      "debt-amazon": 4808.54,
      "debt-affirm": 452.68,
      "debt-tally": 4016.3
    },
    "totalInterest": 996.88,
    "totalPaid": 2215.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 0,
    "interest": {
      "debt-p-boa": 200.32,
      "debt-t-boa": 139.07,
      "debt-b-boa": 192.73,
      "debt-discover": 98.04,
      "debt-citi": 44.73,
      "debt-paypal": 42.93,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 62.88,
      "debt-springboard": 42.72,
      "debt-amazon": 98.13,
      "debt-affirm": 6.03,
      "debt-tally": 53.55
    },
    "charged": {
      "debt-p-boa": 485.8,
      "debt-t-boa": 156.07,
      "debt-b-boa": 1183.08,
      "debt-discover": 226.62,
      "debt-citi": 571.42,
      "debt-paypal": 454.36,
      "debt-ally-cs": 165,
      "debt-ally-cpt": -62.49,
      "debt-springboard": -0.68,
      "debt-amazon": 319.57,
      "debt-affirm": 73.48,
      "debt-tally": -49.46
    },
    "paid": {
      "debt-p-boa": 400,
      "debt-t-boa": 150,
      "debt-b-boa": 400,
      "debt-discover": 175,
      "debt-citi": 180,
      "debt-paypal": 81,
      "debt-ally-cs": 165,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 160,
      "debt-affirm": 59.13,
      "debt-tally": 100
    },
    "balance": {
      "debt-p-boa": 16876.1,
      "debt-t-boa": 6959.36,
      "debt-b-boa": 11146.05,
      "debt-discover": 7284.13,
      "debt-citi": 2721.05,
      "debt-paypal": 2498.52,
      "debt-ally-cs": 1125,
      "debt-ally-cpt": 4869.14,
      "debt-springboard": 5672.45,
      "debt-amazon": 5066.25,
      "debt-affirm": 473.06,
      "debt-tally": 3920.4
    },
    "totalInterest": 981.13,
    "totalPaid": 2270.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 1,
    "interest": {
      "debt-p-boa": 203.78,
      "debt-t-boa": 142.03,
      "debt-b-boa": 211.22,
      "debt-discover": 100.1,
      "debt-citi": 53.26,
      "debt-paypal": 51.51,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 60.82,
      "debt-springboard": 41.31,
      "debt-amazon": 103.39,
      "debt-affirm": 6.3,
      "debt-tally": 52.27
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 110,
      "debt-b-boa": 355,
      "debt-discover": 150,
      "debt-citi": 100,
      "debt-paypal": 81,
      "debt-ally-cs": 362,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16679.88,
      "debt-t-boa": 6991.39,
      "debt-b-boa": 11002.27,
      "debt-discover": 7234.23,
      "debt-citi": 2674.32,
      "debt-paypal": 2469.03,
      "debt-ally-cs": 763,
      "debt-ally-cpt": 4764.97,
      "debt-springboard": 5478.77,
      "debt-amazon": 4992.64,
      "debt-affirm": 420.23,
      "debt-tally": 3862.67
    },
    "totalInterest": 1025.99,
    "totalPaid": 2498.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 2,
    "interest": {
      "debt-p-boa": 201.41,
      "debt-t-boa": 142.68,
      "debt-b-boa": 208.49,
      "debt-discover": 99.41,
      "debt-citi": 52.35,
      "debt-paypal": 50.9,
      "debt-ally-cpt": 59.52,
      "debt-springboard": 39.9,
      "debt-amazon": 101.89,
      "debt-affirm": 5.6,
      "debt-tally": 51.5
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 110,
      "debt-b-boa": 355,
      "debt-discover": 150,
      "debt-citi": 100,
      "debt-paypal": 81,
      "debt-ally-cs": 763,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16481.29,
      "debt-t-boa": 7024.07,
      "debt-b-boa": 10855.76,
      "debt-discover": 7183.64,
      "debt-citi": 2626.67,
      "debt-paypal": 2438.93,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 4659.49,
      "debt-springboard": 5283.67,
      "debt-amazon": 4917.53,
      "debt-affirm": 366.7,
      "debt-tally": 3804.17
    },
    "totalInterest": 1013.65,
    "totalPaid": 2899.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 3,
    "interest": {
      "debt-p-boa": 199.01,
      "debt-t-boa": 143.35,
      "debt-b-boa": 205.72,
      "debt-discover": 98.72,
      "debt-citi": 51.42,
      "debt-paypal": 50.28,
      "debt-ally-cpt": 58.2,
      "debt-springboard": 38.48,
      "debt-amazon": 100.36,
      "debt-affirm": 4.89,
      "debt-tally": 50.72
    },
    "charged": {
      "debt-p-boa": 442.86,
      "debt-amazon": 28,
      "debt-b-boa": 550.28,
      "debt-citi": -119.25
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 216,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 541,
      "debt-paypal": 81,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16557.16,
      "debt-t-boa": 6951.42,
      "debt-b-boa": 11221.76,
      "debt-discover": 7132.35,
      "debt-citi": 2017.84,
      "debt-paypal": 2408.21,
      "debt-ally-cpt": 4552.7,
      "debt-springboard": 5087.15,
      "debt-amazon": 4840.89,
      "debt-affirm": 312.46,
      "debt-tally": 3744.89
    },
    "totalInterest": 1001.15,
    "totalPaid": 2718.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 4,
    "interest": {
      "debt-p-boa": 199.93,
      "debt-t-boa": 141.87,
      "debt-b-boa": 212.65,
      "debt-discover": 98.01,
      "debt-citi": 51.19,
      "debt-paypal": 49.65,
      "debt-ally-cpt": 56.87,
      "debt-springboard": 37.05,
      "debt-amazon": 98.79,
      "debt-affirm": 4.16,
      "debt-tally": 49.93
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 496,
      "debt-paypal": 81,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16357.09,
      "debt-t-boa": 6862.29,
      "debt-b-boa": 11044.41,
      "debt-discover": 7080.36,
      "debt-citi": 1573.02,
      "debt-paypal": 2376.86,
      "debt-ally-cpt": 4444.57,
      "debt-springboard": 4889.21,
      "debt-amazon": 4762.69,
      "debt-affirm": 257.49,
      "debt-tally": 3684.82
    },
    "totalInterest": 1000.1,
    "totalPaid": 2688.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 5,
    "interest": {
      "debt-p-boa": 197.51,
      "debt-t-boa": 140.05,
      "debt-b-boa": 209.29,
      "debt-discover": 97.3,
      "debt-citi": 37.38,
      "debt-paypal": 49,
      "debt-ally-cpt": 55.52,
      "debt-springboard": 35.61,
      "debt-amazon": 97.2,
      "debt-affirm": 3.43,
      "debt-tally": 49.13
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 640,
      "debt-paypal": 81,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16154.6,
      "debt-t-boa": 6771.33,
      "debt-b-boa": 10863.71,
      "debt-discover": 7027.66,
      "debt-citi": 970.41,
      "debt-paypal": 2344.87,
      "debt-ally-cpt": 4335.09,
      "debt-springboard": 4689.82,
      "debt-amazon": 4682.88,
      "debt-affirm": 201.79,
      "debt-tally": 3623.95
    },
    "totalInterest": 971.42,
    "totalPaid": 2832.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 6,
    "interest": {
      "debt-p-boa": 195.07,
      "debt-t-boa": 138.19,
      "debt-b-boa": 205.87,
      "debt-discover": 96.57,
      "debt-citi": 19,
      "debt-paypal": 48.34,
      "debt-ally-cpt": 54.15,
      "debt-springboard": 34.16,
      "debt-amazon": 95.57,
      "debt-affirm": 2.69,
      "debt-tally": 48.32
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 370,
      "debt-paypal": 81,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 15949.67,
      "debt-t-boa": 6678.52,
      "debt-b-boa": 10679.57,
      "debt-discover": 6974.23,
      "debt-citi": 619.4,
      "debt-paypal": 2312.21,
      "debt-ally-cpt": 4224.24,
      "debt-springboard": 4488.97,
      "debt-amazon": 4601.45,
      "debt-affirm": 145.35,
      "debt-tally": 3562.27
    },
    "totalInterest": 937.93,
    "totalPaid": 2562.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 7,
    "interest": {
      "debt-p-boa": 192.59,
      "debt-t-boa": 136.3,
      "debt-b-boa": 202.38,
      "debt-discover": 95.84,
      "debt-citi": 31.72,
      "debt-paypal": 47.67,
      "debt-ally-cpt": 52.77,
      "debt-springboard": 32.69,
      "debt-amazon": 93.91,
      "debt-affirm": 1.94,
      "debt-tally": 47.5
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 138,
      "debt-paypal": 81,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.13,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 15742.26,
      "debt-t-boa": 6583.82,
      "debt-b-boa": 10491.95,
      "debt-discover": 6920.07,
      "debt-citi": 513.13,
      "debt-paypal": 2278.88,
      "debt-ally-cpt": 4112.01,
      "debt-springboard": 4286.67,
      "debt-amazon": 4518.36,
      "debt-affirm": 88.16,
      "debt-tally": 3499.77
    },
    "totalInterest": 935.31,
    "totalPaid": 2330.13,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 8,
    "interest": {
      "debt-p-boa": 1093.14,
      "debt-t-boa": 134.36,
      "debt-b-boa": 198.82,
      "debt-discover": 95.09,
      "debt-citi": 13.37,
      "debt-paypal": 58.54,
      "debt-ally-cpt": 51.37,
      "debt-springboard": 31.22,
      "debt-amazon": 92.21,
      "debt-affirm": -29.01,
      "debt-tally": 46.66
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 432,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-citi": 526.5,
      "debt-paypal": 300,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-affirm": 59.16,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16569.4,
      "debt-t-boa": 6487.19,
      "debt-b-boa": 10300.77,
      "debt-discover": 6865.16,
      "debt-citi": 0,
      "debt-paypal": 2037.42,
      "debt-ally-cpt": 3998.37,
      "debt-springboard": 4082.89,
      "debt-amazon": 4433.57,
      "debt-affirm": 0,
      "debt-tally": 3436.43
    },
    "totalInterest": 1785.77,
    "totalPaid": 2803.66,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 9,
    "interest": {
      "debt-p-boa": 200.08,
      "debt-t-boa": 132.39,
      "debt-b-boa": 195.2,
      "debt-discover": 94.34,
      "debt-paypal": 54.65,
      "debt-ally-cpt": 49.95,
      "debt-springboard": 29.74,
      "debt-amazon": 90.48,
      "debt-tally": 45.82
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 538,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16369.47,
      "debt-t-boa": 6388.58,
      "debt-b-boa": 10105.97,
      "debt-discover": 6809.5,
      "debt-paypal": 1554.08,
      "debt-ally-cpt": 3883.32,
      "debt-springboard": 3877.63,
      "debt-amazon": 4347.06,
      "debt-tally": 3372.25
    },
    "totalInterest": 892.65,
    "totalPaid": 2590,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 10,
    "interest": {
      "debt-p-boa": 197.66,
      "debt-t-boa": 130.38,
      "debt-b-boa": 191.51,
      "debt-discover": 93.57,
      "debt-paypal": 46.95,
      "debt-ally-cpt": 48.51,
      "debt-springboard": 28.24,
      "debt-amazon": 88.72,
      "debt-tally": 44.96
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-t-boa": 5.2,
      "debt-b-boa": 357.14,
      "debt-discover": 186.21,
      "debt-springboard": -222.14,
      "debt-amazon": 796.89
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 85,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16167.13,
      "debt-t-boa": 6293.16,
      "debt-b-boa": 10264.62,
      "debt-discover": 6939.28,
      "debt-paypal": 1516.03,
      "debt-ally-cpt": 3766.83,
      "debt-springboard": 3448.73,
      "debt-amazon": 5027.66,
      "debt-tally": 3307.22
    },
    "totalInterest": 870.5,
    "totalPaid": 2137,
    "extra": 0
  },
  {
    "year": 2023,
    "month": 11,
    "interest": {
      "debt-p-boa": 195.22,
      "debt-t-boa": 128.43,
      "debt-b-boa": 194.51,
      "debt-discover": 95.36,
      "debt-paypal": 31.26,
      "debt-ally-cpt": 47.05,
      "debt-springboard": 25.12,
      "debt-amazon": 102.61,
      "debt-tally": 44.1
    },
    "charged": {
      "debt-p-boa": 624.11,
      "debt-paypal": -138.18,
      "debt-ally-cpt": 5.26,
      "debt-amazon": 28,
      "debt-tally": -3.28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 40,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16420.46,
      "debt-t-boa": 6190.59,
      "debt-b-boa": 10069.13,
      "debt-discover": 6884.64,
      "debt-paypal": 1369.1,
      "debt-ally-cpt": 3654.14,
      "debt-springboard": 3238.85,
      "debt-amazon": 4953.27,
      "debt-tally": 3238.03
    },
    "totalInterest": 863.66,
    "totalPaid": 2092,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 0,
    "interest": {
      "debt-p-boa": 198.28,
      "debt-t-boa": 126.34,
      "debt-b-boa": 190.81,
      "debt-discover": 94.61,
      "debt-paypal": 28.23,
      "debt-ally-cpt": 45.65,
      "debt-springboard": 23.59,
      "debt-amazon": 101.09,
      "debt-tally": 43.17
    },
    "charged": {
      "debt-p-boa": 661,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16713.74,
      "debt-t-boa": 6085.93,
      "debt-b-boa": 9869.95,
      "debt-discover": 6829.25,
      "debt-paypal": 1397.33,
      "debt-ally-cpt": 3534.79,
      "debt-springboard": 3027.44,
      "debt-amazon": 4877.36,
      "debt-tally": 3171.2
    },
    "totalInterest": 851.77,
    "totalPaid": 2052,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 1,
    "interest": {
      "debt-p-boa": 201.82,
      "debt-t-boa": 124.2,
      "debt-b-boa": 187.04,
      "debt-discover": 93.85,
      "debt-paypal": 28.81,
      "debt-ally-cpt": 44.16,
      "debt-springboard": 22.05,
      "debt-amazon": 99.54,
      "debt-tally": 42.28
    },
    "charged": {
      "debt-p-boa": 166,
      "debt-amazon": 28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 47,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16515.56,
      "debt-t-boa": 5979.14,
      "debt-b-boa": 9666.98,
      "debt-discover": 6773.09,
      "debt-paypal": 1379.14,
      "debt-ally-cpt": 3413.94,
      "debt-springboard": 2814.49,
      "debt-amazon": 4799.9,
      "debt-tally": 3103.49
    },
    "totalInterest": 843.75,
    "totalPaid": 2099,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 2,
    "interest": {
      "debt-p-boa": 199.43,
      "debt-t-boa": 122.02,
      "debt-b-boa": 183.19,
      "debt-discover": 93.07,
      "debt-paypal": 28.43,
      "debt-ally-cpt": 42.65,
      "debt-springboard": 20.5,
      "debt-amazon": 97.96,
      "debt-tally": 41.38
    },
    "charged": {
      "debt-p-boa": 225.57,
      "debt-paypal": 260.08,
      "debt-amazon": 55.28
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 48,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16374.55,
      "debt-t-boa": 5870.16,
      "debt-b-boa": 9460.17,
      "debt-discover": 6716.17,
      "debt-paypal": 1619.65,
      "debt-ally-cpt": 3291.59,
      "debt-springboard": 2599.98,
      "debt-amazon": 4748.13,
      "debt-tally": 3034.87
    },
    "totalInterest": 828.63,
    "totalPaid": 2100,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 3,
    "interest": {
      "debt-p-boa": 197.72,
      "debt-t-boa": 119.8,
      "debt-b-boa": 179.27,
      "debt-discover": 92.29,
      "debt-paypal": 33.39,
      "debt-ally-cpt": 41.12,
      "debt-springboard": 18.94,
      "debt-amazon": 96.9,
      "debt-tally": 40.46
    },
    "charged": {
      "debt-p-boa": 889.75,
      "debt-paypal": 113.62
    },
    "paid": {
      "debt-p-boa": 566,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 55,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16896.02,
      "debt-t-boa": 5758.96,
      "debt-b-boa": 9249.44,
      "debt-discover": 6658.46,
      "debt-paypal": 1711.66,
      "debt-ally-cpt": 3167.71,
      "debt-springboard": 2383.92,
      "debt-amazon": 4640.04,
      "debt-tally": 2965.33
    },
    "totalInterest": 819.89,
    "totalPaid": 2107,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 4,
    "interest": {
      "debt-p-boa": 204.02,
      "debt-t-boa": 117.53,
      "debt-b-boa": 175.28,
      "debt-discover": 91.5,
      "debt-paypal": 35.29,
      "debt-ally-cpt": 39.57,
      "debt-springboard": 17.36,
      "debt-amazon": 94.7,
      "debt-tally": 39.54
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-b-boa": 1574.99
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 1288.01,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16800.04,
      "debt-t-boa": 5645.49,
      "debt-b-boa": 10609.71,
      "debt-discover": 6599.95,
      "debt-paypal": 458.94,
      "debt-ally-cpt": 3042.28,
      "debt-springboard": 2166.28,
      "debt-amazon": 4529.73,
      "debt-tally": 2894.87
    },
    "totalInterest": 814.79,
    "totalPaid": 3756.01,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 5,
    "interest": {
      "debt-p-boa": 202.86,
      "debt-t-boa": 115.22,
      "debt-b-boa": 201.05,
      "debt-discover": 90.69,
      "debt-paypal": 9.46,
      "debt-ally-cpt": 38,
      "debt-springboard": 15.78,
      "debt-amazon": 92.44,
      "debt-tally": 38.6
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal": 99.44
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-paypal": 567.85,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 205,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16702.9,
      "debt-t-boa": 5529.71,
      "debt-b-boa": 10420.76,
      "debt-discover": 6540.65,
      "debt-paypal": 0,
      "debt-ally-cpt": 2915.28,
      "debt-springboard": 1947.06,
      "debt-amazon": 4417.17,
      "debt-tally": 2823.47
    },
    "totalInterest": 804.1,
    "totalPaid": 3035.85,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 6,
    "interest": {
      "debt-p-boa": 201.69,
      "debt-t-boa": 112.85,
      "debt-b-boa": 197.47,
      "debt-discover": 89.88,
      "debt-ally-cpt": 36.42,
      "debt-springboard": 14.18,
      "debt-amazon": 90.15,
      "debt-tally": 37.65
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-amazon": 518.87
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 914,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16604.59,
      "debt-t-boa": 5411.56,
      "debt-b-boa": 10228.23,
      "debt-discover": 6480.53,
      "debt-ally-cpt": 2786.7,
      "debt-springboard": 1726.24,
      "debt-amazon": 4112.19,
      "debt-tally": 2751.11
    },
    "totalInterest": 780.29,
    "totalPaid": 3177,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 7,
    "interest": {
      "debt-p-boa": 200.5,
      "debt-t-boa": 110.44,
      "debt-b-boa": 193.83,
      "debt-discover": 89.05,
      "debt-ally-cpt": 34.81,
      "debt-springboard": 12.57,
      "debt-amazon": 83.92,
      "debt-tally": 36.68
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-amazon": 162.77
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 650,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16505.09,
      "debt-t-boa": 5291,
      "debt-b-boa": 10032.06,
      "debt-discover": 6419.58,
      "debt-ally-cpt": 2656.51,
      "debt-springboard": 1503.82,
      "debt-amazon": 3708.88,
      "debt-tally": 2677.79
    },
    "totalInterest": 761.8,
    "totalPaid": 2913,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 8,
    "interest": {
      "debt-p-boa": 199.3,
      "debt-t-boa": 107.98,
      "debt-b-boa": 190.11,
      "debt-discover": 88.22,
      "debt-ally-cpt": 33.18,
      "debt-springboard": 10.95,
      "debt-amazon": 75.69,
      "debt-tally": 35.7
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-amazon": 180.98
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 1180,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16404.39,
      "debt-t-boa": 5167.98,
      "debt-b-boa": 9832.17,
      "debt-discover": 6357.8,
      "debt-ally-cpt": 2524.69,
      "debt-springboard": 1279.77,
      "debt-amazon": 2785.56,
      "debt-tally": 2603.5
    },
    "totalInterest": 741.13,
    "totalPaid": 3443,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 9,
    "interest": {
      "debt-p-boa": 198.08,
      "debt-t-boa": 105.47,
      "debt-b-boa": 186.32,
      "debt-discover": 87.37,
      "debt-ally-cpt": 31.54,
      "debt-springboard": 9.32,
      "debt-amazon": 56.85,
      "debt-tally": 34.71
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-amazon": 503.4
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 1000,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16302.47,
      "debt-t-boa": 5042.45,
      "debt-b-boa": 9628.49,
      "debt-discover": 6295.16,
      "debt-ally-cpt": 2391.23,
      "debt-springboard": 1054.09,
      "debt-amazon": 2345.81,
      "debt-tally": 2528.21
    },
    "totalInterest": 709.66,
    "totalPaid": 3263,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 10,
    "interest": {
      "debt-p-boa": 196.85,
      "debt-t-boa": 102.91,
      "debt-b-boa": 182.46,
      "debt-discover": 86.51,
      "debt-ally-cpt": 29.87,
      "debt-springboard": 7.68,
      "debt-amazon": 47.87,
      "debt-tally": 33.71
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-amazon": 88.88
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 235,
      "debt-amazon": 550,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16199.33,
      "debt-t-boa": 4914.36,
      "debt-b-boa": 9420.95,
      "debt-discover": 6231.67,
      "debt-ally-cpt": 2256.1,
      "debt-springboard": 826.77,
      "debt-amazon": 1932.56,
      "debt-tally": 2451.92
    },
    "totalInterest": 687.86,
    "totalPaid": 2813,
    "extra": 0
  },
  {
    "year": 2024,
    "month": 11,
    "interest": {
      "debt-p-boa": 195.61,
      "debt-t-boa": 100.29,
      "debt-b-boa": 178.53,
      "debt-discover": 85.63,
      "debt-ally-cpt": 28.18,
      "debt-springboard": 6.02,
      "debt-amazon": 39.44,
      "debt-tally": 32.69
    },
    "charged": {
      "debt-p-boa": 1489.64,
      "debt-amazon": 684.58
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 165,
      "debt-springboard": 832.79,
      "debt-amazon": 2656.58,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16902.57,
      "debt-t-boa": 4783.65,
      "debt-b-boa": 9209.47,
      "debt-discover": 6167.3,
      "debt-ally-cpt": 2119.28,
      "debt-springboard": 0,
      "debt-amazon": 0,
      "debt-tally": 2374.61
    },
    "totalInterest": 666.39,
    "totalPaid": 5517.37,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 0,
    "interest": {
      "debt-p-boa": 204.1,
      "debt-t-boa": 97.63,
      "debt-b-boa": 174.52,
      "debt-discover": 84.75,
      "debt-ally-cpt": 26.47,
      "debt-tally": 31.66
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-b-boa": 1842.54
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 973.75,
      "debt-tally": 110
    },
    "balance": {
      "debt-p-boa": 16806.67,
      "debt-t-boa": 4650.28,
      "debt-b-boa": 10836.53,
      "debt-discover": 6102.05,
      "debt-ally-cpt": 1172,
      "debt-tally": 2296.28
    },
    "totalInterest": 619.13,
    "totalPaid": 2836.75,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 1,
    "interest": {
      "debt-p-boa": 202.94,
      "debt-t-boa": 94.9,
      "debt-b-boa": 205.35,
      "debt-discover": 83.85,
      "debt-ally-cpt": 14.64,
      "debt-tally": 30.62
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-tally": 365.22
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 231,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 500,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16709.61,
      "debt-t-boa": 4514.18,
      "debt-b-boa": 10651.88,
      "debt-discover": 6035.91,
      "debt-ally-cpt": 686.65,
      "debt-tally": 2626.11
    },
    "totalInterest": 632.3,
    "totalPaid": 2319,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 2,
    "interest": {
      "debt-p-boa": 201.77,
      "debt-t-boa": 92.13,
      "debt-b-boa": 201.85,
      "debt-discover": 82.94,
      "debt-ally-cpt": 22.05,
      "debt-tally": 35.01
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 660,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ally-cpt": 708.7,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16611.38,
      "debt-t-boa": 3946.31,
      "debt-b-boa": 10463.73,
      "debt-discover": 5968.85,
      "debt-ally-cpt": 0,
      "debt-tally": 2595.12
    },
    "totalInterest": 635.75,
    "totalPaid": 2956.7,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 3,
    "interest": {
      "debt-p-boa": 200.58,
      "debt-t-boa": 80.54,
      "debt-b-boa": 198.29,
      "debt-discover": 82.02,
      "debt-tally": 34.6
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-ikea": 6226.8,
      "debt-paypal-3": 4456.29
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 431,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16511.96,
      "debt-t-boa": 3595.85,
      "debt-b-boa": 10272.02,
      "debt-discover": 5900.87,
      "debt-ikea": 6226.8,
      "debt-paypal-3": 4456.29,
      "debt-tally": 2563.72
    },
    "totalInterest": 596.03,
    "totalPaid": 2019,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 4,
    "interest": {
      "debt-p-boa": 199.38,
      "debt-t-boa": 73.39,
      "debt-b-boa": 194.65,
      "debt-discover": 81.09,
      "debt-tally": 34.18
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 400,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 100,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16411.34,
      "debt-t-boa": 3269.23,
      "debt-b-boa": 10076.68,
      "debt-discover": 5831.96,
      "debt-ikea": 6008.8,
      "debt-paypal-3": 4356.29,
      "debt-tally": 2531.91
    },
    "totalInterest": 582.69,
    "totalPaid": 2306,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 5,
    "interest": {
      "debt-p-boa": 198.17,
      "debt-t-boa": 66.72,
      "debt-b-boa": 190.95,
      "debt-discover": 80.14,
      "debt-tally": 33.76
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": 348
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 691,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16309.51,
      "debt-t-boa": 3185.95,
      "debt-b-boa": 9877.63,
      "debt-discover": 5762.1,
      "debt-ikea": 5790.8,
      "debt-paypal-3": 4013.29,
      "debt-tally": 2499.67
    },
    "totalInterest": 569.74,
    "totalPaid": 2647,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 6,
    "interest": {
      "debt-p-boa": 196.94,
      "debt-t-boa": 65.02,
      "debt-b-boa": 187.18,
      "debt-discover": 79.18,
      "debt-tally": 33.33
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": 1956.76
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 1559,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16206.45,
      "debt-t-boa": 3100.97,
      "debt-b-boa": 9674.81,
      "debt-discover": 5691.28,
      "debt-ikea": 5572.8,
      "debt-paypal-3": 4411.05,
      "debt-tally": 2466.99
    },
    "totalInterest": 561.65,
    "totalPaid": 3515,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 7,
    "interest": {
      "debt-p-boa": 195.69,
      "debt-t-boa": 63.29,
      "debt-b-boa": 183.34,
      "debt-discover": 78.21,
      "debt-tally": 32.89
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 1675,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 16102.14,
      "debt-t-boa": 3014.26,
      "debt-b-boa": 9468.15,
      "debt-discover": 5619.49,
      "debt-ikea": 5354.8,
      "debt-paypal-3": 2736.05,
      "debt-tally": 2433.89
    },
    "totalInterest": 553.42,
    "totalPaid": 3631,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 8,
    "interest": {
      "debt-p-boa": 194.43,
      "debt-t-boa": 61.52,
      "debt-b-boa": 179.42,
      "debt-discover": 77.22,
      "debt-tally": 32.45
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-ikea": -754.39,
      "debt-paypal-3": 3218
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 2676,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 15996.58,
      "debt-t-boa": 2925.77,
      "debt-b-boa": 9257.57,
      "debt-discover": 5546.71,
      "debt-ikea": 4382.41,
      "debt-paypal-3": 3278.05,
      "debt-tally": 2400.34
    },
    "totalInterest": 545.04,
    "totalPaid": 4632,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 9,
    "interest": {
      "debt-p-boa": 193.16,
      "debt-t-boa": 59.71,
      "debt-b-boa": 175.43,
      "debt-discover": 76.22,
      "debt-tally": 32
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 572,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 15889.73,
      "debt-t-boa": 2835.48,
      "debt-b-boa": 9043,
      "debt-discover": 5472.93,
      "debt-ikea": 4164.41,
      "debt-paypal-3": 2706.05,
      "debt-citi": 0,
      "debt-paypal": 0,
      "debt-ally-cs": 0,
      "debt-ally-cpt": 0,
      "debt-springboard": 0,
      "debt-tally": 2366.34
    },
    "totalInterest": 536.52,
    "totalPaid": 2528,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 10,
    "interest": {
      "debt-p-boa": 191.87,
      "debt-t-boa": 57.87,
      "debt-b-boa": 171.36,
      "debt-discover": 75.21,
      "debt-tally": 31.55
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": 2176.95,
      "debt-amazon": 7102.04
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 30,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 15781.6,
      "debt-t-boa": 2743.35,
      "debt-b-boa": 8824.36,
      "debt-discover": 5398.14,
      "debt-ikea": 3946.41,
      "debt-paypal-3": 4853,
      "debt-amazon": 7102.04,
      "debt-affirm": 0,
      "debt-tally": 2331.9
    },
    "totalInterest": 527.86,
    "totalPaid": 1986,
    "extra": 0
  },
  {
    "year": 2025,
    "month": 11,
    "interest": {
      "debt-p-boa": 190.56,
      "debt-t-boa": 55.99,
      "debt-b-boa": 167.22,
      "debt-discover": 74.18,
      "debt-tally": 31.09
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": 562,
      "debt-amazon": 6000
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 218,
      "debt-paypal-3": 305,
      "debt-amazon": 211,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 15672.17,
      "debt-t-boa": 2649.34,
      "debt-b-boa": 8601.59,
      "debt-discover": 5322.32,
      "debt-ikea": 3728.41,
      "debt-paypal-3": 5110,
      "debt-amazon": 12891.04,
      "debt-tally": 2296.99
    },
    "totalInterest": 519.04,
    "totalPaid": 2472,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 0,
    "interest": {
      "debt-p-boa": 189.24,
      "debt-t-boa": 54.07,
      "debt-b-boa": 163,
      "debt-discover": 73.14,
      "debt-amazon": 263.08,
      "debt-affirm": 0,
      "debt-tally": 30.63
    },
    "charged": {
      "debt-p-boa": -679.59,
      "debt-t-boa": -110.13,
      "debt-b-boa": -14.84,
      "debt-discover": 450.56,
      "debt-ikea": 259,
      "debt-paypal-3": -79.96,
      "debt-amazon": -811.28
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-paypal-3": 832,
      "debt-amazon": 430,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 14199.82,
      "debt-t-boa": 2443.28,
      "debt-b-boa": 8359.75,
      "debt-discover": 5696.01,
      "debt-ikea": 3842.41,
      "debt-paypal-3": 4198.04,
      "debt-amazon": 11912.84,
      "debt-tally": 2261.61
    },
    "totalInterest": 773.16,
    "totalPaid": 3145,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 1,
    "interest": {
      "debt-p-boa": 171.46,
      "debt-t-boa": 49.86,
      "debt-b-boa": 158.42,
      "debt-discover": 78.27,
      "debt-amazon": 243.12,
      "debt-tally": 30.15
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-paypal-3": 1000,
      "debt-amazon": 430,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 14071.28,
      "debt-t-boa": 2343.14,
      "debt-b-boa": 8128.16,
      "debt-discover": 5624.29,
      "debt-ikea": 3697.41,
      "debt-paypal-3": 3198.04,
      "debt-amazon": 11725.97,
      "debt-tally": 2225.77
    },
    "totalInterest": 731.28,
    "totalPaid": 3313,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 2,
    "interest": {
      "debt-p-boa": 169.91,
      "debt-t-boa": 47.82,
      "debt-b-boa": 154.03,
      "debt-discover": 77.29,
      "debt-amazon": 239.31,
      "debt-tally": 29.68
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": -754.76
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-paypal-3": 925,
      "debt-amazon": 430,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 13941.19,
      "debt-t-boa": 2240.96,
      "debt-b-boa": 7892.19,
      "debt-discover": 5551.57,
      "debt-ikea": 3552.41,
      "debt-paypal-3": 1518.28,
      "debt-amazon": 11535.27,
      "debt-tally": 2189.45
    },
    "totalInterest": 718.04,
    "totalPaid": 3238,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 3,
    "interest": {
      "debt-p-boa": 168.34,
      "debt-t-boa": 45.73,
      "debt-b-boa": 149.56,
      "debt-discover": 76.29,
      "debt-amazon": 235.42,
      "debt-tally": 29.19
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-paypal-3": 568.17
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-paypal-3": 1270,
      "debt-amazon": 400,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 13809.53,
      "debt-t-boa": 2136.69,
      "debt-b-boa": 7651.75,
      "debt-discover": 5477.86,
      "debt-ikea": 3407.41,
      "debt-paypal-3": 816.45,
      "debt-amazon": 11370.69,
      "debt-tally": 2152.64
    },
    "totalInterest": 704.53,
    "totalPaid": 3553,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 4,
    "interest": {
      "debt-p-boa": 166.75,
      "debt-t-boa": 43.61,
      "debt-b-boa": 145,
      "debt-discover": 75.27,
      "debt-amazon": 232.06,
      "debt-tally": 28.7
    },
    "charged": {
      "debt-p-boa": 682,
      "debt-t-boa": 1400
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-paypal-3": 816.45,
      "debt-amazon": 400,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 13676.28,
      "debt-t-boa": 3430.3,
      "debt-b-boa": 7406.75,
      "debt-discover": 5403.14,
      "debt-ikea": 3262.41,
      "debt-paypal-3": 0,
      "debt-amazon": 11202.75,
      "debt-tally": 2115.34
    },
    "totalInterest": 691.39,
    "totalPaid": 3099.45,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 5,
    "interest": {
      "debt-p-boa": 165.14,
      "debt-t-boa": 70.01,
      "debt-b-boa": 140.36,
      "debt-discover": 74.25,
      "debt-amazon": 228.63,
      "debt-tally": 28.2
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-amazon": 400,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 13541.42,
      "debt-t-boa": 3350.31,
      "debt-b-boa": 7157.11,
      "debt-discover": 5327.39,
      "debt-ikea": 3117.41,
      "debt-amazon": 11031.38,
      "debt-tally": 2077.54
    },
    "totalInterest": 706.59,
    "totalPaid": 2283,
    "extra": 0
  },
  {
    "year": 2026,
    "month": 6,
    "interest": {
      "debt-p-boa": 163.51,
      "debt-t-boa": 68.37,
      "debt-b-boa": 135.63,
      "debt-discover": 73.21,
      "debt-amazon": 225.13,
      "debt-tally": 27.7
    },
    "charged": {
      "debt-p-boa": 682
    },
    "paid": {
      "debt-p-boa": 982,
      "debt-t-boa": 150,
      "debt-b-boa": 390,
      "debt-discover": 150,
      "debt-ikea": 145,
      "debt-amazon": 400,
      "debt-tally": 66
    },
    "balance": {
      "debt-p-boa": 13404.93,
      "debt-t-boa": 3268.68,
      "debt-b-boa": 6902.73,
      "debt-discover": 5250.59,
      "debt-ikea": 2972.41,
      "debt-amazon": 10856.51,
      "debt-tally": 2039.25
    },
    "totalInterest": 693.55,
    "totalPaid": 2283,
    "extra": 0
  }
]
