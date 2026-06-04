import { memo } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { Star } from 'lucide-react';

export const FavoritesSection = memo(function FavoritesSection() {
  const { companies, models, products, favorites } = useCatalogStore();

  const favCompanies = companies.filter((c) =>
    favorites.some((f) => f.targetType === 'company' && f.targetId === c.id)
  );
  const favModels = models.filter((m) =>
    favorites.some((f) => f.targetType === 'model' && f.targetId === m.id)
  );
  const favProducts = products.filter((p) =>
    favorites.some((f) => f.targetType === 'product' && f.targetId === p.id)
  );

  if (favorites.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        No favorites yet. Star a company, model, or product in the Furniture section.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {favCompanies.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-xs text-text-muted border-b border-border" style={{ fontFamily: 'var(--font-body)', background: 'var(--color-background)' }}>
            Companies
          </div>
          {favCompanies.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 border-b border-border" style={{ fontFamily: 'var(--font-body)' }}>
              <Star size={12} style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }} />
              <span className="text-sm text-[var(--color-text)]">{c.name}</span>
            </div>
          ))}
        </div>
      )}

      {favModels.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-xs text-text-muted border-b border-border" style={{ fontFamily: 'var(--font-body)', background: 'var(--color-background)' }}>
            Models
          </div>
          {favModels.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2 border-b border-border" style={{ fontFamily: 'var(--font-body)' }}>
              <Star size={12} style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }} />
              <span className="text-sm text-[var(--color-text)]">{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {favProducts.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-xs text-text-muted border-b border-border" style={{ fontFamily: 'var(--font-body)', background: 'var(--color-background)' }}>
            Products
          </div>
          {favProducts.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-border" style={{ fontFamily: 'var(--font-body)' }}>
              <Star size={12} style={{ color: 'var(--color-accent)', fill: 'var(--color-accent)' }} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-[var(--color-text)] truncate">{p.name}</span>
                <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                  {p.widthCm} × {p.depthCm} cm
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
