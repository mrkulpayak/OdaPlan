import { memo, useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCatalogStore } from '../../store/catalogStore';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useDrag } from '../../hooks/useDrag';
import type { FurnitureCatalogItem } from '../../types';
import { Search, X, Star } from 'lucide-react';

function CatalogRow({ item, dealerId }: { item: FurnitureCatalogItem; dealerId: string }) {
  const { startDrag } = useDrag();
  const toggleFavorite = useCatalogStore((s) => s.toggleFavorite);
  const favorites = useCatalogStore((s) => s.favorites);
  const isFav = favorites.some((f) => f.targetType === 'product' && f.targetId === item.id);
  const addFurnitureInstance = usePlanStore((s) => s.addFurnitureInstance);
  const canvas = usePlanStore((s) => s.canvas);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const handlePointerDown = (e: React.PointerEvent) => {
    startDrag(e, item);
  };

  const handleDoubleClick = () => {
    const svg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    const r = svg?.getBoundingClientRect();
    const svgW = r?.width ?? 800;
    const svgH = r?.height ?? 600;
    // center of canvas in cm coordinates
    const centerPxX = svgW / 2;
    const centerPxY = svgH / 2;
    const cmX = (centerPxX - canvas.panX) / canvas.zoom / 4;
    const cmY = (centerPxY - canvas.panY) / canvas.zoom / 4;

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
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm text-[var(--color-text)] truncate">{item.name}</span>
        <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
          {item.widthCm} × {item.depthCm} cm · {item.category}
        </span>
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); toggleFavorite('product', item.id, dealerId); }}
        className="ml-2 cursor-pointer shrink-0"
        style={{ color: isFav ? 'var(--color-accent)' : 'var(--color-border)' }}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={13} fill={isFav ? 'var(--color-accent)' : 'none'} />
      </button>
    </div>
  );
}

export const FurnitureSection = memo(function FurnitureSection({ dealerId }: { dealerId: string }) {
  const { companies, models, products, isLoading, error, favorites } = useCatalogStore();

  const isFavCompany = (id: string) => favorites.some((f) => f.targetType === 'company' && f.targetId === id);

  const sortedCompanies = [...companies].sort((a, b) =>
    Number(isFavCompany(b.id)) - Number(isFavCompany(a.id)) || a.name.localeCompare(b.name)
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(val), 200);
  };

  const filteredModels = useMemo(
    () => models.filter((m) => !selectedCompanyId || m.companyId === selectedCompanyId),
    [models, selectedCompanyId]
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCompanyId) list = list.filter((p) => p.companyId === selectedCompanyId);
    if (selectedModelId) list = list.filter((p) => p.modelId === selectedModelId);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          companies.find((c) => c.id === p.companyId)?.name.toLowerCase().includes(q) ||
          models.find((m) => m.id === p.modelId)?.name.toLowerCase().includes(q)
      );
    }
    // Favorites first
    return [...list].sort((a, b) => {
      const aFav = favorites.some((f) => f.targetType === 'product' && f.targetId === a.id);
      const bFav = favorites.some((f) => f.targetType === 'product' && f.targetId === b.id);
      return Number(bFav) - Number(aFav);
    });
  }, [products, selectedCompanyId, selectedModelId, debouncedSearch, companies, models, favorites]);

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-sm text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        Loading catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-4 flex flex-col gap-2" style={{ fontFamily: 'var(--font-body)' }}>
        <span className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</span>
        <button
          onClick={() => useCatalogStore.getState().loadCatalog(dealerId)}
          className="text-sm cursor-pointer"
          style={{ color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, textAlign: 'left', textDecoration: 'underline' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 rounded border border-border px-2 py-1" style={{ background: 'var(--color-background)' }}>
          <Search size={13} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search products..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-text-muted outline-none"
            style={{ fontFamily: 'var(--font-body)' }}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }} className="cursor-pointer text-text-muted hover:text-[var(--color-text)]">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Company filter */}
      {!debouncedSearch && (
        <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
          <button
            onClick={() => { setSelectedCompanyId(null); setSelectedModelId(null); }}
            className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast"
            style={{
              fontFamily: 'var(--font-body)',
              background: !selectedCompanyId ? 'var(--color-primary)' : 'var(--color-surface)',
              color: !selectedCompanyId ? '#fff' : 'var(--color-text)',
              borderColor: !selectedCompanyId ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            All
          </button>
          {sortedCompanies.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedCompanyId(c.id); setSelectedModelId(null); }}
              className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-body)',
                background: selectedCompanyId === c.id ? 'var(--color-primary)' : 'var(--color-surface)',
                color: selectedCompanyId === c.id ? '#fff' : 'var(--color-text)',
                borderColor: selectedCompanyId === c.id ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {isFavCompany(c.id) && <Star size={10} fill="currentColor" />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Model filter */}
      {!debouncedSearch && selectedCompanyId && filteredModels.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedModelId(null)}
            className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast"
            style={{
              fontFamily: 'var(--font-body)',
              background: !selectedModelId ? 'var(--color-accent)' : 'var(--color-surface)',
              color: !selectedModelId ? '#fff' : 'var(--color-text)',
              borderColor: !selectedModelId ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            All Models
          </button>
          {filteredModels.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModelId(m.id)}
              className="text-xs px-2 py-0.5 rounded border cursor-pointer transition-colors duration-fast"
              style={{
                fontFamily: 'var(--font-body)',
                background: selectedModelId === m.id ? 'var(--color-accent)' : 'var(--color-surface)',
                color: selectedModelId === m.id ? '#fff' : 'var(--color-text)',
                borderColor: selectedModelId === m.id ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Product list — virtualized */}
      <ProductList products={filteredProducts} dealerId={dealerId} />
    </div>
  );
});

const ITEM_HEIGHT = 52;

const ProductList = memo(function ProductList({
  products,
  dealerId,
}: {
  products: FurnitureCatalogItem[];
  dealerId: string;
}) {
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
        No products found.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => (
          <div
            key={vItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vItem.start}px)`,
            }}
          >
            <CatalogRow item={products[vItem.index]} dealerId={dealerId} />
          </div>
        ))}
      </div>
    </div>
  );
});
