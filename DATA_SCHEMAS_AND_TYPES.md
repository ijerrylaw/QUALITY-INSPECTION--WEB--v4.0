# Data Schemas & TypeScript Contracts

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the strict data structures, TypeScript interfaces, and ORM database shapes. 
*(Note: Algorithms that process this data live in ISO2859_MATH_ENGINE.md).*

---

## 1. SUBMISSION & INSPECTION SCHEMAS

```typescript
export type AmendmentStatus = 'UNMODIFIED' | 'AMENDMENT_DRAFTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface Submission {
  id: string; // e.g., 'sub_123456789'
  productCode: string;
  productionDate: string;
  samplingTime: string;
  submissionTimestamp: string;
  machineId: string;
  shift: string;
  batchNumber: string;
  size: string;
  sampleSize: number;
  dimensions: DimensionMeasurements;
  dimensionMins: DimensionMinimums;
  defects: Record<string, number>; // Record<DefectId, Count>
  verdict: 'PASSED' | 'FAILED';
  aadObjectId: string;
  userPrincipalName: string;
  amendmentStatus: AmendmentStatus;
  totalCarton?: number;
  gloveWeight?: number;
  operatorToken?: string;
  amendmentLogs: AmendmentLog[];
  profileId: string; // REQUIRED — every submission must reference an InspectionProfile
}

export interface AmendmentLog {
  id: string;
  submissionId: string;
  requestedBy: string;
  approvedBy?: string;
  timestamp: string;
  originalValues: Partial<Submission>;
  newValues: Partial<Submission>;
  reason: string;
}
```

## 2. CONFIGURATION & RULES SCHEMAS

```typescript
export type EvaluationMode = 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';

export interface AQLCategory {
  id: string;
  name: string;
  aqlLevel: string; // e.g., '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', 'AND', 'PASS/FAIL/NIL'
  evaluationMode: EvaluationMode;
}

export interface DefectDefinition {
  id: string;
  name: string;
  categoryId: string;   // links this defect to its parent AQLCategory within a profile
  defaultClass: string;
  currentClass: string;
}

export interface InspectionProfile {
  id: string;
  name: string;
  isDefault: boolean;
  aqlCategories: AQLCategory[];          // all defect categories for this profile
  defectDefinitions: DefectDefinition[];  // all defects nested under this profile
}
```

## 3. PRODUCT & SKU ENGINE SCHEMAS

```typescript
export interface AppConfig {
  productCodes: string[];
  lines: { id: string; name: string }[];
  shifts: { id: string; name: string }[];
  sizes: string[];
  sampleSizes: number[];               // ISO 2859-1 global bracket sizes — stored at AppConfig root level
  inspectionProfiles?: InspectionProfile[]; // all profiles; categories & defects live here, NOT at root
  productMatrixConfig?: Record<string, ProductConfig>;
  skuMaterials?: SkuOption[];
  skuWeights?: SkuOption[];
  skuColors?: SkuOption[];
}

export interface SkuOption {
  value: string;
  label: string;
}

export interface ProductConfig {
  dimensionDefs: ProductDimensionDef[];
  sizes: Record<string, SizeConfig>;
}

export interface ProductDimensionDef {
  id: string;
  name: string;
  unit: string;
  isMin?: boolean;
}

export interface SizeConfig {
  weightTarget: string;
  weightTolerance: string;
  dimensions: Record<string, { minSpec: string; tolerance: string }>;
}
```