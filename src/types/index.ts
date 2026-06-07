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
  isPinned: boolean; // fully anchors both endpoints in space — top of the constraint hierarchy
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

export interface Column {
  id: string;
  widthCm: number;
  depthCm: number;
  position: Point; // top-left of unrotated bounding box, cm
  rotation: number; // degrees
  snappedToWall?: {
    wallId: string;
    side: 'top' | 'right' | 'bottom' | 'left';
  };
}

export interface Room {
  points: Point[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  constraints: Constraint[];
  columns: Column[];
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
  | 'Konsol' | 'TV Ünitesi' | 'Büfe' | 'Kitaplık' | 'Çalışma Masası'
  | 'Yatak' | 'Komodin' | 'Gardırop' | 'Şifonyer' | 'Dresuar'
  | 'Dolap' | 'Mutfak Köşe' | 'Özel';

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
  colorFamily?: string; // 'Beyaz' | 'Antrasit' | 'Ceviz' | 'Bej' | 'Siyah' | 'Meşe' | 'Gri'
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
  /** Furniture fill color (hex) */
  furnitureColor: string;
  /** Floor/room fill color (hex) */
  floorColor: string;
  /** Show 50 cm grid overlay */
  showGrid: boolean;
  /** Enable snap-to-wall and snap-to-furniture */
  snapEnabled: boolean;
  /** Lock all walls: hide editing UI, show 10 cm outward wall-thickness band */
  wallsLocked: boolean;
}

// ── Custom Shapes ──────────────────────────────────────────────────────────
/** Parametric shape type for user-defined furniture outlines */
export type CustomShapeType = 'rect' | 'l-shape' | 'chamfered';

export interface CustomShapeInstance {
  id: string;
  shapeType: CustomShapeType;
  /** Top-left of the bounding box in cm */
  position: Point;
  rotation: number; // degrees
  /**
   * rect:      { A: width, B: depth }
   * l-shape:   { A: outerWidth, B: outerDepth, C: notchWidth, D: notchDepth }
   * chamfered: { A: width, B: depth, C: chamfer }  (symmetric 45° corner)
   */
  dims: Record<string, number>;
  name?: string; // optional user label (for future save)
}
// ── /Custom Shapes ─────────────────────────────────────────────────────────

export interface PlanState {
  version: number;
  room: Room | null;
  furnitureInstances: FurnitureInstance[];
  customShapeInstances: CustomShapeInstance[];
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
  roomType?: string; // 'Yatak Odası' | 'Oturma Odası' | 'Yemek Odası' | 'Çocuk Odası' | 'Ofis'
  isGlobal: boolean;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error';
  message: string;
}
