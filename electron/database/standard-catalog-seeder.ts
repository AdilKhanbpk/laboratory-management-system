/**
 * Standard Clinical Laboratory Test Catalog Definitions & Database Reset Service
 * Exactly modeled after the clinical laboratory test catalog specification.
 */

export interface StandardTestDefinition {
  testCode: string;
  testName: string;
  category: string;
  pricePaisa: number;
  sampleType?: string;
  collectionContainer?: string;
  parameters: Array<{
    name: string;
    unit?: string | null;
    type?: 'numeric' | 'text' | 'options';
    displayOrder: number;
    ranges?: Array<{
      gender?: 'all' | 'male' | 'female';
      minAgeDays?: number;
      maxAgeDays?: number;
      normalLow?: number | null;
      normalHigh?: number | null;
      panicLow?: number | null;
      panicHigh?: number | null;
      displayText: string;
    }>;
  }>;
}

export const STANDARD_TEST_CATALOG: StandardTestDefinition[] = [
  // ==========================================
  // 1. CHEMICAL PATHOLOGY
  // ==========================================
  {
    testCode: 'GLU',
    testName: 'Blood Glucose',
    category: 'Chemical Pathology',
    pricePaisa: 15000,
    sampleType: 'Serum / Fluoride Plasma',
    parameters: [
      {
        name: 'Glucose (Fasting)',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 70,
            normalHigh: 110,
            panicLow: 45,
            panicHigh: 400,
            displayText: '70 - 110 mg/dl',
          },
        ],
      },
      {
        name: 'Glucose (Random)',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 70,
            normalHigh: 160,
            panicLow: 45,
            panicHigh: 400,
            displayText: '70 - 160 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'UREA',
    testName: 'Blood Urea',
    category: 'Chemical Pathology',
    pricePaisa: 20000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Blood Urea',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 20,
            normalHigh: 40,
            displayText: '20 - 40 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'CREAT',
    testName: 'Serum Creatinine',
    category: 'Chemical Pathology',
    pricePaisa: 20000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Serum Creatinine',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0.7,
            normalHigh: 1.2,
            displayText: '0.7 - 1.2 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'CHOL',
    testName: 'Serum Cholesterol',
    category: 'Chemical Pathology',
    pricePaisa: 25000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Cholesterol',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 100,
            normalHigh: 200,
            displayText: '100 - 200 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'TRIG',
    testName: 'Serum Triglycerides',
    category: 'Chemical Pathology',
    pricePaisa: 25000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Triglycerides',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 100,
            normalHigh: 200,
            displayText: '100 - 200 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'BILIRUBIN',
    testName: 'Serum Bilirubin (Total & Direct)',
    category: 'Chemical Pathology',
    pricePaisa: 35000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Bilirubin (Total)',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0.1,
            normalHigh: 1.0,
            displayText: '0.1 - 1.0 mg/dl',
          },
        ],
      },
      {
        name: 'Direct Bilirubin',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0.0,
            normalHigh: 0.5,
            displayText: '0.0 - 0.5 mg/dl',
          },
        ],
      },
      {
        name: 'Indirect Bilirubin',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 3,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0.0,
            normalHigh: 0.3,
            displayText: '0.0 - 0.3 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'SGPT',
    testName: 'SGPT (ALT)',
    category: 'Chemical Pathology',
    pricePaisa: 25000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'SGPT (ALT)',
        unit: 'u/l',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 20,
            normalHigh: 40,
            displayText: '20 - 40 u/l',
          },
        ],
      },
    ],
  },
  {
    testCode: 'ALP',
    testName: 'Alkaline Phosphatase',
    category: 'Chemical Pathology',
    pricePaisa: 30000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Alkaline Phosphatase',
        unit: 'u/l',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 60,
            normalHigh: 300,
            displayText: '60 - 300 u/l',
          },
        ],
      },
    ],
  },
  {
    testCode: 'URIC',
    testName: 'Serum Uric Acid',
    category: 'Chemical Pathology',
    pricePaisa: 20000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Uric Acid',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'male',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 3.5,
            normalHigh: 7.0,
            displayText: '3.5 - 7.0 mg/dl',
          },
          {
            gender: 'female',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 3.5,
            normalHigh: 6.0,
            displayText: '3.5 - 6.0 mg/dl',
          },
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 3.5,
            normalHigh: 7.0,
            displayText: '3.5 - 7.0 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'CA',
    testName: 'Serum Calcium',
    category: 'Chemical Pathology',
    pricePaisa: 25000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Calcium',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 8.5,
            normalHigh: 10.5,
            displayText: '8.5 - 10.5 mg/dl',
          },
        ],
      },
    ],
  },
  {
    testCode: 'AMYL',
    testName: 'Serum Amylase',
    category: 'Chemical Pathology',
    pricePaisa: 40000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Amylase',
        unit: 'u/l',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 60,
            normalHigh: 120,
            displayText: '60 - 120 u/l',
          },
        ],
      },
    ],
  },
  {
    testCode: 'PHOS',
    testName: 'Serum Phosphorus',
    category: 'Chemical Pathology',
    pricePaisa: 25000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Phosphorus',
        unit: 'mg/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 2.5,
            normalHigh: 4.8,
            displayText: '2.5 - 4.8 mg/dl',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 2. HAEMATOLOGY
  // ==========================================
  {
    testCode: 'CBC',
    testName: 'Complete Blood Count (CBC)',
    category: 'Haematology',
    pricePaisa: 40000,
    sampleType: 'Whole Blood EDTA',
    parameters: [
      {
        name: 'Hemoglobin',
        unit: 'g/dl',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'male',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 13.0,
            normalHigh: 18.0,
            displayText: '13.0 - 18.0 g/dl',
          },
          {
            gender: 'female',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 11.5,
            normalHigh: 16.0,
            displayText: '11.5 - 16.0 g/dl',
          },
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 12.0,
            normalHigh: 17.0,
            displayText: '12.0 - 17.0 g/dl',
          },
        ],
      },
      {
        name: 'TLC (Total Leukocyte Count)',
        unit: 'x10³ul',
        type: 'numeric',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 4.0,
            normalHigh: 11.0,
            displayText: '4.0 - 11.0 x10³ul',
          },
        ],
      },
      {
        name: 'RBC',
        unit: 'x10⁶ul',
        type: 'numeric',
        displayOrder: 3,
        ranges: [
          {
            gender: 'male',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 4.5,
            normalHigh: 6.5,
            displayText: '4.5 - 6.5 x10⁶ul',
          },
          {
            gender: 'female',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 3.5,
            normalHigh: 5.8,
            displayText: '3.5 - 5.8 x10⁶ul',
          },
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 4.0,
            normalHigh: 6.0,
            displayText: '4.0 - 6.0 x10⁶ul',
          },
        ],
      },
      {
        name: 'Neutrophils',
        unit: '%',
        type: 'numeric',
        displayOrder: 4,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 45,
            normalHigh: 75,
            displayText: '45 - 75 %',
          },
        ],
      },
      {
        name: 'Lymphocytes',
        unit: '%',
        type: 'numeric',
        displayOrder: 5,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 20,
            normalHigh: 45,
            displayText: '20 - 45 %',
          },
        ],
      },
      {
        name: 'Monocytes',
        unit: '%',
        type: 'numeric',
        displayOrder: 6,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 4,
            normalHigh: 8,
            displayText: '04 - 08 %',
          },
        ],
      },
      {
        name: 'Eosinophil',
        unit: '%',
        type: 'numeric',
        displayOrder: 7,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 1,
            normalHigh: 3,
            displayText: '01 - 03 %',
          },
        ],
      },
      {
        name: 'Plateletes',
        unit: 'x10³ul',
        type: 'numeric',
        displayOrder: 8,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 150,
            normalHigh: 400,
            displayText: '150 - 400 x10³ul',
          },
        ],
      },
      {
        name: 'HCT',
        unit: '%',
        type: 'numeric',
        displayOrder: 9,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 40,
            normalHigh: 54,
            displayText: '40 - 54 %',
          },
        ],
      },
      {
        name: 'MCV',
        unit: 'FL',
        type: 'numeric',
        displayOrder: 10,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 83,
            normalHigh: 101,
            displayText: '83 - 101 FL',
          },
        ],
      },
      {
        name: 'MCH',
        unit: 'Pg',
        type: 'numeric',
        displayOrder: 11,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 27,
            normalHigh: 32,
            displayText: '27 - 32 Pg',
          },
        ],
      },
      {
        name: 'MCHC',
        unit: 'g/dl',
        type: 'numeric',
        displayOrder: 12,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 31,
            normalHigh: 35,
            displayText: '31 - 35 g/dl',
          },
        ],
      },
      {
        name: 'MPV',
        unit: 'FL',
        type: 'numeric',
        displayOrder: 13,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 7.5,
            normalHigh: 11.5,
            displayText: '7.5 - 11.5 FL',
          },
        ],
      },
      {
        name: 'ESR',
        unit: 'mm/Hr',
        type: 'numeric',
        displayOrder: 14,
        ranges: [
          {
            gender: 'male',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 13,
            displayText: '0 - 13 mm/Hr',
          },
          {
            gender: 'female',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 20,
            displayText: '0 - 20 mm/Hr',
          },
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 15,
            displayText: '0 - 15 mm/Hr',
          },
        ],
      },
    ],
  },
  {
    testCode: 'ESR',
    testName: 'Erythrocyte Sedimentation Rate (ESR)',
    category: 'Haematology',
    pricePaisa: 15000,
    sampleType: 'Whole Blood Citrate / EDTA',
    parameters: [
      {
        name: 'ESR',
        unit: 'mm/Hr',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'male',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 13,
            displayText: '0 - 13 mm/Hr',
          },
          {
            gender: 'female',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 20,
            displayText: '0 - 20 mm/Hr',
          },
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: 0,
            normalHigh: 15,
            displayText: '0 - 15 mm/Hr',
          },
        ],
      },
    ],
  },
  {
    testCode: 'MPICT',
    testName: 'MP (ICT)',
    category: 'Haematology',
    pricePaisa: 30000,
    sampleType: 'Whole Blood EDTA',
    parameters: [
      {
        name: 'MP (ICT)',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'BGRH',
    testName: 'Blood Group Th F',
    category: 'Haematology',
    pricePaisa: 20000,
    sampleType: 'Whole Blood EDTA',
    parameters: [
      {
        name: 'Blood Group',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Standard ABO Typing',
          },
        ],
      },
      {
        name: 'Rh Factor',
        unit: null,
        type: 'options',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Positive / Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'DENGUE',
    testName: 'Dengue IgM/IgG',
    category: 'Haematology',
    pricePaisa: 80000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Dengue IgM',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
      {
        name: 'Dengue IgG',
        unit: null,
        type: 'options',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 3. BASIC IMMUNOLOGY SEROLOGY VIROLOGY
  // ==========================================
  {
    testCode: 'WIDAL',
    testName: 'Widal Agglutination (S. Typhi)',
    category: 'Serology & Immunology',
    pricePaisa: 30000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'S. Typhi "O"',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative (< 1:80)',
          },
        ],
      },
      {
        name: 'S. Typhi "H"',
        unit: null,
        type: 'options',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative (< 1:80)',
          },
        ],
      },
    ],
  },
  {
    testCode: 'BRUCELLA',
    testName: 'Brucella Serology',
    category: 'Serology & Immunology',
    pricePaisa: 40000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Brucella Abortus',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
      {
        name: 'Brucella Melitensis',
        unit: null,
        type: 'options',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'HBSAG',
    testName: 'Hbs Ag Screening',
    category: 'Serology & Immunology',
    pricePaisa: 30000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Hbs Ag',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'HCV',
    testName: 'Anti HCV Screening',
    category: 'Serology & Immunology',
    pricePaisa: 35000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Anti HCV',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'HIV',
    testName: 'HIV Screening',
    category: 'Serology & Immunology',
    pricePaisa: 40000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'HIV',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'ASO',
    testName: 'A.S.O Titre',
    category: 'Serology & Immunology',
    pricePaisa: 35000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'A.S.O Titre',
        unit: 'IU/ml',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: 200,
            displayText: '< 200 IU/ml',
          },
        ],
      },
    ],
  },
  {
    testCode: 'RF',
    testName: 'Rheumatoid Factor',
    category: 'Serology & Immunology',
    pricePaisa: 30000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'Rheumatoid',
        unit: 'IU/ml',
        type: 'numeric',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: 20,
            displayText: '< 20 IU/ml (Negative)',
          },
        ],
      },
    ],
  },
  {
    testCode: 'HPYLORI',
    testName: 'H-Phylori',
    category: 'Serology & Immunology',
    pricePaisa: 40000,
    sampleType: 'Serum / Stool',
    parameters: [
      {
        name: 'H-Phylori',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },
  {
    testCode: 'THYPIDOT',
    testName: 'THYPIDOT',
    category: 'Serology & Immunology',
    pricePaisa: 50000,
    sampleType: 'Serum',
    parameters: [
      {
        name: 'THYPIDOT IgM',
        unit: null,
        type: 'options',
        displayOrder: 1,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
      {
        name: 'THYPIDOT IgG',
        unit: null,
        type: 'options',
        displayOrder: 2,
        ranges: [
          {
            gender: 'all',
            minAgeDays: 0,
            maxAgeDays: 47450,
            normalLow: null,
            normalHigh: null,
            displayText: 'Negative',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 4. URINE ANALYSIS
  // ==========================================
  {
    testCode: 'URINE',
    testName: 'Urine Analysis (Routine Examination)',
    category: 'Clinical Pathology',
    pricePaisa: 20000,
    sampleType: 'Random Clean-Catch Urine',
    parameters: [
      // Physical
      { name: 'Colour', unit: null, type: 'text', displayOrder: 1, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Pale Yellow' }] },
      { name: 'PH', unit: null, type: 'text', displayOrder: 2, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: '4.5 - 8.0' }] },
      { name: 'SP Gravity', unit: null, type: 'text', displayOrder: 3, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: '1.005 - 1.030' }] },
      // Chemical
      { name: 'Albumin', unit: null, type: 'options', displayOrder: 4, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Sugar', unit: null, type: 'options', displayOrder: 5, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Bile Salts', unit: null, type: 'options', displayOrder: 6, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Negative' }] },
      { name: 'Bile Pigments', unit: null, type: 'options', displayOrder: 7, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Negative' }] },
      { name: 'Ketone', unit: null, type: 'options', displayOrder: 8, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Negative' }] },
      { name: 'PREGNANCY TEST', unit: null, type: 'options', displayOrder: 9, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Negative' }] },
      // Microscopy
      { name: 'Pus Cells', unit: '/HPF', type: 'text', displayOrder: 10, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: '0 - 5 /HPF' }] },
      { name: 'Red Cells', unit: '/HPF', type: 'text', displayOrder: 11, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil - 2 /HPF' }] },
      { name: 'Epith Cells', unit: null, type: 'text', displayOrder: 12, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Few / Moderate' }] },
      { name: 'Crystal Calcium Oxalate', unit: null, type: 'text', displayOrder: 13, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Amorphous Urates', unit: null, type: 'text', displayOrder: 14, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Granular Casts', unit: null, type: 'text', displayOrder: 15, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Hayline Casts', unit: null, type: 'text', displayOrder: 16, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Muscus Thread', unit: null, type: 'text', displayOrder: 17, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Others', unit: null, type: 'text', displayOrder: 18, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
    ],
  },

  // ==========================================
  // 5. STOOL ANALYSIS
  // ==========================================
  {
    testCode: 'STOOL',
    testName: 'Stool Analysis (Routine Examination)',
    category: 'Clinical Pathology',
    pricePaisa: 20000,
    sampleType: 'Fresh Stool Specimen',
    parameters: [
      { name: 'Colour', unit: null, type: 'text', displayOrder: 1, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Brown / Yellow' }] },
      { name: 'Consistency', unit: null, type: 'text', displayOrder: 2, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Formed / Semi-formed' }] },
      { name: 'Mucus', unit: null, type: 'text', displayOrder: 3, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Blood', unit: null, type: 'text', displayOrder: 4, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil' }] },
      { name: 'Ova', unit: null, type: 'text', displayOrder: 5, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Not Seen' }] },
      { name: 'Protozoa', unit: null, type: 'text', displayOrder: 6, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Not Seen' }] },
      { name: 'Pus Cells', unit: '/HDF', type: 'text', displayOrder: 7, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: '0 - 2 /HDF' }] },
      { name: 'R.B.C', unit: '/HDF', type: 'text', displayOrder: 8, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Nil /HDF' }] },
      { name: 'Bacteria', unit: null, type: 'text', displayOrder: 9, ranges: [{ gender: 'all', minAgeDays: 0, maxAgeDays: 47450, normalLow: null, normalHigh: null, displayText: 'Normal Flora' }] },
    ],
  },
];

/**
 * Executes a transactional clean slate:
 * Disables foreign keys, wipes ALL data (users, hospital profile, doctors,
 * patients, visits, test results, old tests), resets sequences,
 * and seeds all official tests from the hospital slip template.
 */
export function wipeDatabaseAndSeedStandardCatalog(db: any): { testsInserted: number } {
  const now = new Date().toISOString();

  // Temporarily disable foreign keys so all tables can be purged without constraint errors
  db.pragma('foreign_keys = OFF');

  try {
    const transaction = db.transaction(() => {
      // 1. Wipe all audit logs, clinical transactional data, visits, and patient results
      db.prepare('DELETE FROM audit_logs').run();
      db.prepare('DELETE FROM test_results').run();
      db.prepare('DELETE FROM result_amendments').run();
      db.prepare('DELETE FROM report_snapshots').run();
      db.prepare('DELETE FROM order_items').run();
      db.prepare('DELETE FROM payments').run();
      db.prepare('DELETE FROM invoices').run();
      db.prepare('DELETE FROM visits').run();
      db.prepare('DELETE FROM patients').run();
      db.prepare('DELETE FROM doctors').run();

      // 2. Wipe previous test catalog entries
      db.prepare('DELETE FROM parameter_reference_ranges').run();
      db.prepare('DELETE FROM test_parameters').run();
      db.prepare('DELETE FROM lab_tests').run();

      // 3. Wipe hospital settings and users to start 100% fresh from setup screen
      db.prepare('DELETE FROM hospital_settings').run();
      db.prepare('DELETE FROM app_users').run();

      // 4. Reset autoincrement sequences
      try {
        db.prepare('DELETE FROM sqlite_sequence').run();
      } catch {
        // sqlite_sequence may not exist if never used
      }

      // 5. Prepare insert statements for tests, parameters, and ranges
      const insertTestStmt = db.prepare(`
        INSERT INTO lab_tests (
          test_code, test_name, category, price_paisa, sample_type, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `);

      const insertParamStmt = db.prepare(`
        INSERT INTO test_parameters (
          test_id, parameter_name, display_order, unit, parameter_type, is_active
        ) VALUES (?, ?, ?, ?, ?, 1)
      `);

      const insertRangeStmt = db.prepare(`
        INSERT INTO parameter_reference_ranges (
          parameter_id, gender, min_age_days, max_age_days, normal_low, normal_high, panic_low, panic_high, display_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let count = 0;

      for (const test of STANDARD_TEST_CATALOG) {
        const testResult = insertTestStmt.run(
          test.testCode.toUpperCase().trim(),
          test.testName.trim(),
          test.category.trim(),
          test.pricePaisa,
          test.sampleType || null,
          now,
          now
        );

        const testId = Number(testResult.lastInsertRowid);
        count++;

        test.parameters.forEach((param, pIdx) => {
          const paramResult = insertParamStmt.run(
            testId,
            param.name.trim(),
            param.displayOrder ?? pIdx + 1,
            param.unit?.trim() || null,
            param.type || 'numeric'
          );

          const paramId = Number(paramResult.lastInsertRowid);

          if (param.ranges && param.ranges.length > 0) {
            for (const range of param.ranges) {
              insertRangeStmt.run(
                paramId,
                range.gender || 'all',
                range.minAgeDays ?? 0,
                range.maxAgeDays ?? 47450,
                range.normalLow ?? null,
                range.normalHigh ?? null,
                range.panicLow ?? null,
                range.panicHigh ?? null,
                range.displayText.trim()
              );
            }
          }
        });
      }

      return count;
    });

    const testsInserted = transaction();
    return { testsInserted };
  } finally {
    // Re-enable foreign key constraints
    db.pragma('foreign_keys = ON');
  }
}

