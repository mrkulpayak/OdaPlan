import { memo, useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCatalogStore } from '../../store/catalogStore';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useDrag } from '../../hooks/useDrag';
import type { FurnitureCatalogItem, FurnitureModel } from '../../types';
import { Search, X } from 'lucide-react';

// ── Renk swatch haritası ──────────────────────────────────────
const COLOR_SWATCH: Record<string, string> = {
  'Beyaz':    '#f5f5f0',
  'Antrasit': '#4a4a4a',
  'Ceviz':    '#8b5e3c',
  'Bej':      '#d4b896',
  'Siyah':    '#1a1a1a',
  'Meşe':     '#c09460',
  'Gri':      '#9e9e9e',
  'Lacivert': '#1e3a5f',
  'Mavi':     '#3b82f6',
};

// ── Küçük filtre chip'i ───────────────────────────────────────
function Chip({
  label, active, color, onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast shrink-0 select-none"
      style={{
        fontFamily: 'var(--font-body)',
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        color: active ? '#fff' : 'var(--color-text)',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
      }}
    >
      {color && (
        <span
          style={{
            display: 'inline-block',
            width: 8, height: 8,
            borderRadius: '50%',
            background: color,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  );
}

// ── Filtre grubu (başlık + yatay kaydırılabilir chip'ler) ─────
function FilterGroup({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-xs font-medium"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  );
}

// ── Aktif filtre pill'i (× ile kaldırılabilir) ────────────────
function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded"
      style={{
        fontFamily: 'var(--font-body)',
        background: 'var(--color-primary)',
        color: '#fff',
      }}
    >
      {label}
      <button onClick={onRemove} style={{ lineHeight: 1, cursor: 'pointer' }}>
        <X size={10} />
      </button>
    </span>
  );
}

// ── Model chip (tık = filtre, basılı tut = takımı sürükle) ────
const MODEL_HOLD_MS = 400;

function ModelChip({
  model, isSelected, allProducts, onSelect,
}: {
  model: FurnitureModel;
  isSelected: boolean;
  allProducts: FurnitureCatalogItem[];
  onSelect: () => void;
}) {
  const { startModelDrag } = useDrag();
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDragRef = useRef(false);

  const modelProducts = useMemo(
    () => allProducts.filter((p) => p.modelId === model.id),
    [allProducts, model.id]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (modelProducts.length === 0) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const element = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    didDragRef.current = false;

    holdTimerRef.current = setTimeout(() => {
      didDragRef.current = true;
      try { element.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
      startModelDrag(clientX, clientY, modelProducts);
    }, MODEL_HOLD_MS);
  }, [modelProducts, startModelDrag]);

  const handlePointerUp = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (!didDragRef.current) onSelect();
  }, [onSelect]);

  const handlePointerCancel = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }, []);

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast select-none"
      style={{
        fontFamily: 'var(--font-body)',
        background: isSelected ? 'var(--color-accent)' : 'var(--color-surface)',
        color: isSelected ? '#fff' : 'var(--color-text)',
        borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
        userSelect: 'none',
      }}
      title={
        modelProducts.length > 0
          ? `Basılı tut → tüm takımı sahneye ekle (${modelProducts.length} ürün)`
          : model.name
      }
    >
      {model.name}
    </button>
  );
}

// ── CatalogRow ────────────────────────────────────────────────
function CatalogRow({ item }: { item: FurnitureCatalogItem }) {
  const { startDrag } = useDrag();
  const addFurnitureInstance = usePlanStore((s) => s.addFurnitureInstance);
  const canvas = usePlanStore((s) => s.canvas);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const handleDoubleClick = () => {
    const svg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    const r = svg?.getBoundingClientRect();
    const svgW = r?.width ?? 800;
    const svgH = r?.height ?? 600;
    const cmX = (svgW / 2 - canvas.panX) / canvas.zoom / 4;
    const cmY = (svgH / 2 - canvas.panY) / canvas.zoom / 4;
    const id = crypto.randomUUID();
    addFurnitureInstance({
      id,
      catalogItemId: item.id,
      position: { x: cmX - item.widthCm / 2, y: cmY - item.depthCm / 2 },
      rotation: 0,
    });
    setSelectedItemId(id);
  };

  return (
    <div
      className="flex items-center justify-between px-3 py-2 border-b border-border cursor-grab hover:bg-surface-alt transition-colors duration-fast select-none"
      style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
      onPointerDown={(e) => startDrag(e, item)}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm text-[var(--color-text)] truncate">{item.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
          {item.widthCm} × {item.depthCm} cm
          {item.colorFamily && (
            <span
              style={{
                display: 'inline-block',
                width: 7, height: 7,
                borderRadius: '50%',
                background: COLOR_SWATCH[item.colorFamily] ?? '#ccc',
                border: '1px solid rgba(0,0,0,0.15)',
              }}
            />
          )}
          <span style={{ fontFamily: 'var(--font-body)' }}>{item.category}</span>
        </span>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────
export const FurnitureSection = memo(function FurnitureSection({ dealerId: _dealerId }: { dealerId: string }) {
  const { companies, models, products, isLoading, error } = useCatalogStore();

  // ── Filtre state ─────────────────────────────────────────────
  const [selCompanies,  setSelCompanies]  = useState<Set<string>>(new Set());
  const [selRoomTypes,  setSelRoomTypes]  = useState<Set<string>>(new Set());
  const [selCategories, setSelCategories] = useState<Set<string>>(new Set());
  const [selColors,     setSelColors]     = useState<Set<string>>(new Set());
  const [selModelId,    setSelModelId]    = useState<string | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 200);
  };

  // Toggle helpers
  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  };

  const anyFilter = selCompanies.size > 0 || selRoomTypes.size > 0 ||
    selCategories.size > 0 || selColors.size > 0 || selModelId !== null || debouncedSearch;

  const clearAll = () => {
    setSelCompanies(new Set()); setSelRoomTypes(new Set());
    setSelCategories(new Set()); setSelColors(new Set());
    setSelModelId(null); setSearchQuery(''); setDebouncedSearch('');
  };

  // ── Derived filter options (only show options that have results) ─
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  // Products matching all active filters EXCEPT the one being listed (for option availability)
  const filteredProducts = useMemo(() => {
    let list = products;

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        companyMap.get(p.companyId)?.name.toLowerCase().includes(q) ||
        (p.modelId ? modelMap.get(p.modelId)?.name.toLowerCase().includes(q) : false)
      );
    }
    if (selCompanies.size > 0)
      list = list.filter((p) => selCompanies.has(p.companyId));
    if (selRoomTypes.size > 0)
      list = list.filter((p) => {
        const rt = p.modelId ? modelMap.get(p.modelId)?.roomType : undefined;
        return rt ? selRoomTypes.has(rt) : false;
      });
    if (selCategories.size > 0)
      list = list.filter((p) => selCategories.has(p.category));
    if (selColors.size > 0)
      list = list.filter((p) => p.colorFamily ? selColors.has(p.colorFamily) : false);
    if (selModelId)
      list = list.filter((p) => p.modelId === selModelId);

    return list;
  }, [products, debouncedSearch, selCompanies, selRoomTypes, selCategories, selColors, selModelId, modelMap, companyMap]);

  // Available filter options (derived from all products, not filtered — to always show options)
  const availableRoomTypes = useMemo(() =>
    [...new Set(models.map((m) => m.roomType).filter(Boolean) as string[])].sort(),
    [models]
  );
  const availableCategories = useMemo(() =>
    [...new Set(products.map((p) => p.category))].sort(),
    [products]
  );
  const availableColors = useMemo(() =>
    [...new Set(products.map((p) => p.colorFamily).filter(Boolean) as string[])].sort(),
    [products]
  );

  // Models visible in the model row: those whose products appear in filteredProducts
  const visibleModels = useMemo(() => {
    const modelIdsInResults = new Set(filteredProducts.map((p) => p.modelId).filter(Boolean));
    return models.filter((m) => modelIdsInResults.has(m.id));
  }, [models, filteredProducts]);

  // ── Loading / error states ────────────────────────────────────
  if (isLoading) return (
    <div className="px-3 py-4 text-sm text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
      Yükleniyor...
    </div>
  );
  if (error) return (
    <div className="px-3 py-4 flex flex-col gap-2" style={{ fontFamily: 'var(--font-body)' }}>
      <span className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</span>
      <button
        onClick={() => useCatalogStore.getState().loadCatalog(_dealerId)}
        className="text-sm cursor-pointer"
        style={{ color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, textAlign: 'left', textDecoration: 'underline' }}
      >
        Tekrar dene
      </button>
    </div>
  );

  return (
    <div className="flex flex-col">

      {/* ── Arama ── */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 rounded border border-border px-2 py-1" style={{ background: 'var(--color-background)' }}>
          <Search size={13} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Ürün, marka veya model ara..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-text-muted outline-none"
            style={{ fontFamily: 'var(--font-body)' }}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }}
              className="cursor-pointer text-text-muted hover:text-[var(--color-text)]">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filtre grupları ── */}
      <div className="px-3 py-2 border-b border-border flex flex-col gap-2.5">

        {/* Marka */}
        <FilterGroup label="Marka">
          {companies.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={selCompanies.has(c.id)}
              onClick={() => setSelCompanies(toggle(selCompanies, c.id))}
            />
          ))}
        </FilterGroup>

        {/* Oda Tipi */}
        {availableRoomTypes.length > 0 && (
          <FilterGroup label="Oda">
            {availableRoomTypes.map((rt) => (
              <Chip
                key={rt}
                label={rt}
                active={selRoomTypes.has(rt)}
                onClick={() => setSelRoomTypes(toggle(selRoomTypes, rt))}
              />
            ))}
          </FilterGroup>
        )}

        {/* Kategori */}
        <FilterGroup label="Kategori">
          {availableCategories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              active={selCategories.has(cat)}
              onClick={() => setSelCategories(toggle(selCategories, cat))}
            />
          ))}
        </FilterGroup>

        {/* Renk */}
        {availableColors.length > 0 && (
          <FilterGroup label="Renk">
            {availableColors.map((col) => (
              <Chip
                key={col}
                label={col}
                active={selColors.has(col)}
                color={COLOR_SWATCH[col]}
                onClick={() => setSelColors(toggle(selColors, col))}
              />
            ))}
          </FilterGroup>
        )}
      </div>

      {/* ── Aktif filtreler özeti ── */}
      {anyFilter && (
        <div className="px-3 py-1.5 border-b border-border flex flex-wrap items-center gap-1">
          {[...selCompanies].map((id) => (
            <ActivePill key={id} label={companyMap.get(id)?.name ?? id}
              onRemove={() => setSelCompanies(toggle(selCompanies, id))} />
          ))}
          {[...selRoomTypes].map((rt) => (
            <ActivePill key={rt} label={rt}
              onRemove={() => setSelRoomTypes(toggle(selRoomTypes, rt))} />
          ))}
          {[...selCategories].map((cat) => (
            <ActivePill key={cat} label={cat}
              onRemove={() => setSelCategories(toggle(selCategories, cat))} />
          ))}
          {[...selColors].map((col) => (
            <ActivePill key={col} label={col}
              onRemove={() => setSelColors(toggle(selColors, col))} />
          ))}
          {selModelId && (
            <ActivePill label={modelMap.get(selModelId)?.name ?? selModelId}
              onRemove={() => setSelModelId(null)} />
          )}
          {debouncedSearch && (
            <ActivePill label={`"${debouncedSearch}"`}
              onRemove={() => { setSearchQuery(''); setDebouncedSearch(''); }} />
          )}
          <button
            onClick={clearAll}
            className="text-xs cursor-pointer ml-auto"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', background: 'none', border: 'none', padding: 0 }}
          >
            Temizle
          </button>
        </div>
      )}

      {/* ── Model chip'leri (takım sürükleme için) ── */}
      {visibleModels.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
          <span className="text-xs self-center" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
            Takım:
          </span>
          {visibleModels.map((m) => (
            <ModelChip
              key={m.id}
              model={m}
              isSelected={selModelId === m.id}
              allProducts={products}
              onSelect={() => setSelModelId(selModelId === m.id ? null : m.id)}
            />
          ))}
        </div>
      )}

      {/* ── Ürün listesi ── */}
      <ProductList products={filteredProducts} />
    </div>
  );
});

// ── Virtualized list ──────────────────────────────────────────
const ITEM_HEIGHT = 50;

const ProductList = memo(function ProductList({ products }: { products: FurnitureCatalogItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  if (products.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        Ürün bulunamadı.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: '300px' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => (
          <div
            key={vItem.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
          >
            <CatalogRow item={products[vItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
});
