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
  profileId?: string;
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

## 2. CONFIGURATION & RULES SCHEMAS

export type EvaluationMode = 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';

export interface AQLCategory {
  id: string;
  name: string;
  aqlLevel: string; // e.g., '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', 'AND'
  evaluationMode: EvaluationMode;
}

export interface DefectDefinition {
  id: string;
  name: string;
  defaultClass: string;
  currentClass: string;
}

export interface InspectionProfile {
  id: string;               
  name: string;             
  isDefault: boolean;
  aqlCategories: AQLCategory[]; 
  defectDefinitions: DefectDefinition[]; 
}

## 3. PRODUCT & SKU ENGINE SCHEMAS

export interface AppConfig {
  productCodes: string[];
  defectDefinitions: DefectDefinition[];
  lines: { id: string; name: string }[];
  shifts: { id: string; name: string }[];
  sizes: string[];
  sampleSizes: number[];
  aqlCategories?: AQLCategory[];
  inspectionProfiles?: InspectionProfile[];
  productProfileMap?: Record<string, string[]>;
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