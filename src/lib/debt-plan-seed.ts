export const seededDebtBalances: Record<string, number> = {
  "debt-p-boa": 13404.93,
  "debt-t-boa": 3268.68,
  "debt-b-boa": 6902.73,
  "debt-discover": 5250.59,
  "debt-ikea": 2972.41,
  "debt-amazon": 10856.51,
  "debt-tally": 2039.25
}

export const seededAmazonDebt = {
  id: 'debt-amazon',
  lender: 'Amazon',
  dueDay: null as number | null,
  minimum: 400,
  extraPayment: 0,
  paidFromAccountId: '',
  chargeAccountId: '',
  type: 'credit-card' as const,
  apr: 24.49,
  promoApr: null as number | null,
  promoEndsOn: null as string | null,
  balance: 10856.51,
}

export const seededRecurringCharges: Record<string, number> = {
  'debt-p-boa': 682,
}

export const defaultMonthlyDebtBudget = 4000
export const defaultSnowballDebtId = 'debt-amazon'

export type SeededHistoryMonth = {
  year: number
  month: number
  interest: Record<string, number>
  charged: Record<string, number>
  paid: Record<string, number>
  balance: Record<string, number>
  totalInterest: number
  totalPaid: number
  extra: number
}

export const seededDebtHistory: SeededHistoryMonth[] = []

export type SeededAffirmLoan = {
  id: string
  name: string
  loanId: string
  startMonth: string
  startDate?: string
  lastPayment: string
  startingBalance: number
  monthly: number
  remaining: number
}

export const seededAffirmLoans: SeededAffirmLoan[] = [
  {
    "id": "affirm-UTTX-OXVD",
    "name": "Amazon",
    "loanId": "UTTX-OXVD",
    "startMonth": "2026-05",
    "startDate": "2026-05-19",
    "lastPayment": "2026-12",
    "startingBalance": 72.59,
    "monthly": 9.08,
    "remaining": 36.27
  },
  {
    "id": "affirm-OQG5-Q7FI",
    "name": "Amazon",
    "loanId": "OQG5-Q7FI",
    "startMonth": "2026-05",
    "startDate": "2026-05-01",
    "lastPayment": "2026-10",
    "startingBalance": 56.92,
    "monthly": 9.49,
    "remaining": 18.96
  },
  {
    "id": "affirm-9V0A-NCYE",
    "name": "Amazon",
    "loanId": "9V0A-NCYE",
    "startMonth": "2026-05",
    "startDate": "2026-05-07",
    "lastPayment": "2027-01",
    "startingBalance": 80.17,
    "monthly": 9.73,
    "remaining": 41.25
  },
  {
    "id": "affirm-T533-4FQQ",
    "name": "Amazon",
    "loanId": "T533-4FQQ",
    "startMonth": "2026-06",
    "startDate": "2026-06-15",
    "lastPayment": "2027-06",
    "startingBalance": 117.13,
    "monthly": 9.76,
    "remaining": 87.85
  },
  {
    "id": "affirm-NJB7-E0FZ",
    "name": "Amazon",
    "loanId": "NJB7-E0FZ",
    "startMonth": "2026-05",
    "startDate": "2026-05-19",
    "lastPayment": "2027-02",
    "startingBalance": 99.43,
    "monthly": 9.95,
    "remaining": 59.63
  },
  {
    "id": "affirm-ZSUO-T0MW",
    "name": "Amazon",
    "loanId": "ZSUO-T0MW",
    "startMonth": "2026-07",
    "startDate": "2026-07-11",
    "lastPayment": "2027-07",
    "startingBalance": 129.52,
    "monthly": 10.79,
    "remaining": 107.94
  },
  {
    "id": "affirm-ZT9F-Q2JL",
    "name": "Amazon",
    "loanId": "ZT9F-Q2JL",
    "startMonth": "2026-05",
    "startDate": "2026-05-18",
    "lastPayment": "2027-02",
    "startingBalance": 110.47,
    "monthly": 11.05,
    "remaining": 66.27
  },
  {
    "id": "affirm-Z71F-KBJU",
    "name": "Amazon",
    "loanId": "Z71F-KBJU",
    "startMonth": "2026-06",
    "startDate": "2026-06-04",
    "lastPayment": "2026-11",
    "startingBalance": 69.77,
    "monthly": 11.63,
    "remaining": 34.88
  },
  {
    "id": "affirm-MQ98-SVZ7",
    "name": "Amazon",
    "loanId": "MQ98-SVZ7",
    "startMonth": "2026-05",
    "lastPayment": "2026-08",
    "startingBalance": 47.01,
    "monthly": 11.76,
    "remaining": 0
  },
  {
    "id": "affirm-MW75-T5DP",
    "name": "Amazon",
    "loanId": "MW75-T5DP",
    "startMonth": "2026-06",
    "startDate": "2026-06-18",
    "lastPayment": "2027-05",
    "startingBalance": 142.66,
    "monthly": 11.89,
    "remaining": 106.99
  },
  {
    "id": "affirm-OOXL-2XU0",
    "name": "Amazon",
    "loanId": "OOXL-2XU0",
    "startMonth": "2026-07",
    "lastPayment": "2027-01",
    "startingBalance": 76.28,
    "monthly": 12.71,
    "remaining": 50.86
  },
  {
    "id": "affirm-GFEN-JNIN",
    "name": "Amazon",
    "loanId": "GFEN-JNIN",
    "startMonth": "2026-05",
    "lastPayment": "2027-03",
    "startingBalance": 161.53,
    "monthly": 13.46,
    "remaining": 134.61
  },
  {
    "id": "affirm-YBSO-KFGG",
    "name": "Amazon",
    "loanId": "YBSO-KFGG",
    "startMonth": "2026-06",
    "startDate": "2026-06-18",
    "lastPayment": "2026-12",
    "startingBalance": 83.85,
    "monthly": 13.81,
    "remaining": 42.42
  },
  {
    "id": "affirm-OBFH-XBSF",
    "name": "Amazon",
    "loanId": "OBFH-XBSF",
    "startMonth": "2026-05",
    "startDate": "2026-05-19",
    "lastPayment": "2027-01",
    "startingBalance": 118.22,
    "monthly": 14.11,
    "remaining": 61.78
  },
  {
    "id": "affirm-MXAF-24V1",
    "name": "Amazon",
    "loanId": "MXAF-24V1",
    "startMonth": "2026-06",
    "startDate": "2026-06-08",
    "lastPayment": "2027-05",
    "startingBalance": 169.38,
    "monthly": 14.12,
    "remaining": 127.02
  },
  {
    "id": "affirm-XAZT-P6CT",
    "name": "Amazon",
    "loanId": "XAZT-P6CT",
    "startMonth": "2026-06",
    "lastPayment": "2027-04",
    "startingBalance": 153.29,
    "monthly": 14.52,
    "remaining": 109.73
  },
  {
    "id": "affirm-YMPJ-D6CE",
    "name": "Amazon",
    "loanId": "YMPJ-D6CE",
    "startMonth": "2026-05",
    "startDate": "2026-05-14",
    "lastPayment": "2027-04",
    "startingBalance": 176.39,
    "monthly": 14.7,
    "remaining": 117.59
  },
  {
    "id": "affirm-Y5B7-HYB9",
    "name": "Amazon",
    "loanId": "Y5B7-HYB9",
    "startMonth": "2026-06",
    "startDate": "2026-06-11",
    "lastPayment": "2026-11",
    "startingBalance": 89.49,
    "monthly": 14.92,
    "remaining": 44.73
  },
  {
    "id": "affirm-4GEC-3N0H",
    "name": "Amazon",
    "loanId": "4GEC-3N0H",
    "startMonth": "2026-05",
    "startDate": "2026-05-16",
    "lastPayment": "2027-03",
    "startingBalance": 168.42,
    "monthly": 15.31,
    "remaining": 107.18
  },
  {
    "id": "affirm-F448-MZ3V",
    "name": "Amazon",
    "loanId": "F448-MZ3V",
    "startMonth": "2026-06",
    "startDate": "2026-06-04",
    "lastPayment": "2027-05",
    "startingBalance": 189.52,
    "monthly": 15.79,
    "remaining": 142.15
  },
  {
    "id": "affirm-R0H6-HLOL",
    "name": "Amazon",
    "loanId": "R0H6-HLOL",
    "startMonth": "2026-07",
    "startDate": "2026-07-09",
    "lastPayment": "2027-06",
    "startingBalance": 190.4,
    "monthly": 15.87,
    "remaining": 158.66
  },
  {
    "id": "affirm-OMBU-UABN",
    "name": "Amazon",
    "loanId": "OMBU-UABN",
    "startMonth": "2026-06",
    "lastPayment": "2027-05",
    "startingBalance": 190.78,
    "monthly": 15.9,
    "remaining": 143.08
  },
  {
    "id": "affirm-E7RL-NXAN",
    "name": "Amazon",
    "loanId": "E7RL-NXAN",
    "startMonth": "2026-05",
    "lastPayment": "2026-08",
    "startingBalance": 64.31,
    "monthly": 16.07,
    "remaining": 0
  },
  {
    "id": "affirm-ZCRY-SKFG",
    "name": "Amazon",
    "loanId": "ZCRY-SKFG",
    "startMonth": "2026-05",
    "lastPayment": "2027-04",
    "startingBalance": 199.73,
    "monthly": 16.65,
    "remaining": 166.43
  },
  {
    "id": "affirm-04QB-LTSS",
    "name": "Amazon",
    "loanId": "04QB-LTSS",
    "startMonth": "2026-05",
    "startDate": "2026-05-20",
    "lastPayment": "2027-01",
    "startingBalance": 149.99,
    "monthly": 16.67,
    "remaining": 83.31
  },
  {
    "id": "affirm-0UP3-MIED",
    "name": "Amazon",
    "loanId": "0UP3-MIED",
    "startMonth": "2026-05",
    "startDate": "2026-05-01",
    "lastPayment": "2027-04",
    "startingBalance": 206.95,
    "monthly": 17.24,
    "remaining": 137.99
  },
  {
    "id": "affirm-RHEN-UW68",
    "name": "Amazon",
    "loanId": "RHEN-UW68",
    "startMonth": "2026-05",
    "lastPayment": "2027-02",
    "startingBalance": 173.71,
    "monthly": 17.37,
    "remaining": 104.23
  },
  {
    "id": "affirm-9ZJQ-LCIB",
    "name": "Amazon",
    "loanId": "9ZJQ-LCIB",
    "startMonth": "2026-05",
    "startDate": "2026-05-16",
    "lastPayment": "2027-04",
    "startingBalance": 210.72,
    "monthly": 17.56,
    "remaining": 140.48
  },
  {
    "id": "affirm-34PL-THDW",
    "name": "Amazon",
    "loanId": "34PL-THDW",
    "startMonth": "2026-05",
    "startDate": "2026-05-03",
    "lastPayment": "2027-04",
    "startingBalance": 213.07,
    "monthly": 17.76,
    "remaining": 142.03
  },
  {
    "id": "affirm-IU7A-GBU4",
    "name": "Amazon",
    "loanId": "IU7A-GBU4",
    "startMonth": "2026-05",
    "startDate": "2026-05-09",
    "lastPayment": "2026-08",
    "startingBalance": 66.85,
    "monthly": 16.2,
    "remaining": 2.05
  },
  {
    "id": "affirm-83G0-48US",
    "name": "Amazon",
    "loanId": "83G0-48US",
    "startMonth": "2026-05",
    "lastPayment": "2027-10",
    "startingBalance": 348.39,
    "monthly": 19.37,
    "remaining": 309.65
  },
  {
    "id": "affirm-69P3-1RZT",
    "name": "Amazon",
    "loanId": "69P3-1RZT",
    "startMonth": "2026-08",
    "startDate": "2026-08-17",
    "lastPayment": "2027-07",
    "startingBalance": 236.7,
    "monthly": 19.73,
    "remaining": 216.97
  },
  {
    "id": "affirm-KFZT-J0HA",
    "name": "Amazon",
    "loanId": "KFZT-J0HA",
    "startMonth": "2026-06",
    "startDate": "2026-06-11",
    "lastPayment": "2027-06",
    "startingBalance": 242.66,
    "monthly": 20.22,
    "remaining": 182
  },
  {
    "id": "affirm-pura-38",
    "name": "Pura",
    "loanId": "",
    "startMonth": "2026-05",
    "startDate": "2026-05-06",
    "lastPayment": "2027-01",
    "startingBalance": 167.39,
    "monthly": 20.49,
    "remaining": 85.43
  },
  {
    "id": "affirm-8LZA-08ZV",
    "name": "Amazon",
    "loanId": "8LZA-08ZV",
    "startMonth": "2026-06",
    "startDate": "2026-06-12",
    "lastPayment": "2027-05",
    "startingBalance": 249.11,
    "monthly": 20.76,
    "remaining": 186.83
  },
  {
    "id": "affirm-T462-4V4K",
    "name": "Wayfair",
    "loanId": "T462-4V4K",
    "startMonth": "2026-05",
    "lastPayment": "2026-08",
    "startingBalance": 88.68,
    "monthly": 22.19,
    "remaining": 0
  },
  {
    "id": "affirm-VQWL-1KXQ",
    "name": "Amazon",
    "loanId": "VQWL-1KXQ",
    "startMonth": "2026-07",
    "startDate": "2026-07-08",
    "lastPayment": "2028-01",
    "startingBalance": 413.36,
    "monthly": 22.96,
    "remaining": 367.44
  },
  {
    "id": "affirm-SBD8-JN8Y",
    "name": "Amazon",
    "loanId": "SBD8-JN8Y",
    "startMonth": "2026-05",
    "lastPayment": "2027-06",
    "startingBalance": 327.32,
    "monthly": 23.39,
    "remaining": 233.76
  },
  {
    "id": "affirm-ET8K-L7CS",
    "name": "Wayfair",
    "loanId": "ET8K-L7CS",
    "startMonth": "2026-05",
    "lastPayment": "2026-08",
    "startingBalance": 95.51,
    "monthly": 23.9,
    "remaining": 0
  },
  {
    "id": "affirm-81Z6-XU07",
    "name": "Amazon",
    "loanId": "81Z6-XU07",
    "startMonth": "2026-06",
    "lastPayment": "2027-09",
    "startingBalance": 375.11,
    "monthly": 24.92,
    "remaining": 300.35
  },
  {
    "id": "affirm-BRP7-AQFH",
    "name": "Affirm virtual card",
    "loanId": "BRP7-AQFH",
    "startMonth": "2026-05",
    "lastPayment": "2026-08",
    "startingBalance": 287.17,
    "monthly": 86.19,
    "remaining": 0
  },
  {
    "id": "affirm-XW6L-6OUJ",
    "name": "Amazon",
    "loanId": "XW6L-6OUJ",
    "startMonth": "2026-07",
    "lastPayment": "2028-06",
    "startingBalance": 688.86,
    "monthly": 28.71,
    "remaining": 631.44
  },
  {
    "id": "affirm-S3LT-LNXJ",
    "name": "Amazon",
    "loanId": "S3LT-LNXJ",
    "startMonth": "2026-05",
    "startDate": "2026-05-10",
    "lastPayment": "2027-08",
    "startingBalance": 470.27,
    "monthly": 29.39,
    "remaining": 352.71
  },
  {
    "id": "affirm-ET3B-PWT5",
    "name": "Amazon",
    "loanId": "ET3B-PWT5",
    "startMonth": "2026-06",
    "startDate": "2026-06-18",
    "lastPayment": "2027-11",
    "startingBalance": 526.56,
    "monthly": 29.5,
    "remaining": 438.06
  },
  {
    "id": "affirm-UHF1-W7C",
    "name": "Amazon",
    "loanId": "UHF1-W7C",
    "startMonth": "2026-05",
    "startDate": "2026-05-25",
    "lastPayment": "2027-11",
    "startingBalance": 583.21,
    "monthly": 30.69,
    "remaining": 460.45
  },
  {
    "id": "affirm-rolling-smokes-50",
    "name": "Rolling smokes",
    "loanId": "",
    "startMonth": "2026-05",
    "startDate": "2026-05-10",
    "lastPayment": "2026-11",
    "startingBalance": 237.88,
    "monthly": 34.11,
    "remaining": 101.44
  },
  {
    "id": "affirm-petstore-direct-51",
    "name": "Petstore direct",
    "loanId": "",
    "startMonth": "2026-08",
    "startDate": "2026-08-16",
    "lastPayment": "2027-07",
    "startingBalance": 443.58,
    "monthly": 36.97,
    "remaining": 406.61
  },
  {
    "id": "affirm-CMGL-OOPZ",
    "name": "Amazon",
    "loanId": "CMGL-OOPZ",
    "startMonth": "2026-05",
    "startDate": "2026-05-04",
    "lastPayment": "2028-04",
    "startingBalance": 1010.28,
    "monthly": 42.1,
    "remaining": 926.08
  },
  {
    "id": "affirm-made-by-merry-53",
    "name": "Made by merry",
    "loanId": "",
    "startMonth": "2026-05",
    "startDate": "2026-05-24",
    "lastPayment": "2026-10",
    "startingBalance": 289.49,
    "monthly": 48.99,
    "remaining": 93.53
  },
  {
    "id": "affirm-sachem-54",
    "name": "Sachem",
    "loanId": "",
    "startMonth": "2026-05",
    "startDate": "2026-05-09",
    "lastPayment": "2026-12",
    "startingBalance": 531.75,
    "monthly": 68.05,
    "remaining": 259.55
  },
  {
    "id": "affirm-AOJF-ZDD7",
    "name": "Affirm virtual card",
    "loanId": "AOJF-ZDD7",
    "startMonth": "2026-05",
    "startDate": "2026-05-03",
    "lastPayment": "2026-11",
    "startingBalance": 609.7,
    "monthly": 87.1,
    "remaining": 261.3
  },
]
