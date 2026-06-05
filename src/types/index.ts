export interface Point {
  x: number; // centimeters
  y: number; // centimeters
}

export interface Wall {
  id: string;
  startPointIndex: number;
  endPointIndex: number;
  isLengthLocked: boolean;
  lockedLength?: number;
}

export type ConstraintType = 'angle';

export interface Constraint {
  id: string;
  type: ConstraintType;
  sharedPointIndex: number; // PRIMARY KEY: the corner point where the two walls meet
  angleDeg: number; // locked angle between the two walls in degrees
}

export type DoorOpensTo = 'inside' | 'outside';
export type DoorHingeSide = 'left' | 'right';

export interface DoorConfig {
  opensTo: DoorOpensTo;
  hingeSide: DoorHingeSide;
}

export interface Door {
  id: string;
  wallId: string;
  positionOnWall: number; // 0–1 normalized
  widthCm: number;
  opensTo: DoorOpensTo;
  hingeSide: DoorHingeSide;
}

export interface Window {
  id: string;
  wallId: string;
  positionOnWall: number; // 0–1 normalized
  widthCm: number;
}

export interface Room {
  points: Point[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  constraints: Constraint[];
}

export type FurnitureShapeType =
  | 'rectangle'
  | 'square'
  | 'circle'
  | 'semicircle'
  | 'quarterCircle'
  | 'chamferedRectangle'
  | 'cornerCabinet';

export type FurnitureFrontSide = 'top' | 'right' | 'bottom' | 'left';

export type FurnitureCategory =
  | 'Koltuk' | 'Berjer' | 'Sehpa' | 'Yemek Masası' | 'Sandalye'
  | 'Konsol' | 'TV Ünitesi' | 'Yatak' | 'Komodin' | 'Gardırop'
  | 'Şifonyer' | 'Dolap' | 'Mutfak Köşe' | 'Özel';

export interface FurnitureCatalogItem {
  id: string;
  dealerId: string | null;
  companyId: string;
  modelId: string | null;
  name: string;
  category: FurnitureCategory;
  shapeType: FurnitureShapeType;
  frontSide: FurnitureFrontSide;
  widthCm: number;
  depthCm: number;
  params: Record<string, unknown> | null;
  isGlobal: boolean;
}

export interface FurnitureInstance {
  id: string;
  catalogItemId: string;
  position: Point; // centimeters
  rotation: number; // degrees
  snappedTo?: { wallId: string; side: FurnitureFrontSide };
}

export type SnapTargetType = 'wall' | 'corner' | 'furniture';

export interface SnapTarget {
  type: SnapTargetType;
  wallId?: string;
  furnitureId?: string;
  side: FurnitureFrontSide;
  position: Point;
  rotation: number;
}

export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  viewRotation: 0 | 90 | 180 | 270;
  showDimensionsOnExport: boolean;
}

export interface PlanState {
  version: number;
  room: Room | null;
  furnitureInstances: FurnitureInstance[];
  canvas: CanvasState;
}

export interface CatalogBrowseState {
  selectedCompanyId: string | null;
  selectedModelId: string | null;
  searchQuery: string;
}

export interface FurnitureCompany {
  id: string;
  dealerId: string | null;
  name: string;
  isGlobal: boolean;
}

export interface FurnitureModel {
  id: string;
  dealerId: string | null;
  companyId: string;
  name: string;
  isGlobal: boolean;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error';
  message: string;
}
