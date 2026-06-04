import { create } from 'zustand';
import type { FurnitureCatalogItem, FurnitureCompany, FurnitureModel } from '../types';
import { supabase } from '../lib/supabase';

interface CatalogState {
  companies: FurnitureCompany[];
  models: FurnitureModel[];
  products: FurnitureCatalogItem[];
  favorites: { targetType: string; targetId: string }[];
  isLoading: boolean;
  error: string | null;
}

interface CatalogActions {
  loadCatalog: (dealerId: string) => Promise<void>;
  addProduct: (product: FurnitureCatalogItem) => void;
  addCompany: (company: FurnitureCompany) => void;
  addModel: (model: FurnitureModel) => void;
  toggleFavorite: (targetType: string, targetId: string, dealerId: string) => Promise<void>;
}

export const useCatalogStore = create<CatalogState & CatalogActions>()((set, _get) => ({
  companies: [],
  models: [],
  products: [],
  favorites: [],
  isLoading: false,
  error: null,

  loadCatalog: async (dealerId) => {
    set({ isLoading: true, error: null });

    const [companiesRes, modelsRes, productsRes, favoritesRes] = await Promise.all([
      supabase.from('furniture_companies').select('*').order('name'),
      supabase.from('furniture_models').select('*').order('name'),
      supabase.from('furniture_products').select('*').order('name'),
      supabase.from('dealer_favorites').select('*').eq('dealer_id', dealerId),
    ]);

    if (companiesRes.error || modelsRes.error || productsRes.error) {
      set({ isLoading: false, error: 'Could not load catalog. Check your connection.' });
      return;
    }

    const companies: FurnitureCompany[] = (companiesRes.data ?? []).map((c) => ({
      id: c.id,
      dealerId: c.dealer_id,
      name: c.name,
      isGlobal: c.is_global,
    }));

    const models: FurnitureModel[] = (modelsRes.data ?? []).map((m) => ({
      id: m.id,
      dealerId: m.dealer_id,
      companyId: m.company_id,
      name: m.name,
      isGlobal: m.is_global,
    }));

    const products: FurnitureCatalogItem[] = (productsRes.data ?? []).map((p) => ({
      id: p.id,
      dealerId: p.dealer_id,
      companyId: p.company_id,
      modelId: p.model_id,
      name: p.name,
      category: p.category,
      shapeType: p.shape_type,
      frontSide: p.front_side,
      widthCm: p.width_cm,
      depthCm: p.depth_cm,
      params: p.params,
      isGlobal: p.is_global,
    }));

    const favorites = (favoritesRes.data ?? []).map((f) => ({
      targetType: f.target_type,
      targetId: f.target_id,
    }));

    set({ companies, models, products, favorites, isLoading: false });
  },

  addProduct: (product) =>
    set((s) => ({ products: [...s.products, product] })),

  addCompany: (company) =>
    set((s) => ({ companies: [...s.companies, company] })),

  addModel: (model) =>
    set((s) => ({ models: [...s.models, model] })),

  toggleFavorite: async (targetType, targetId, dealerId) => {
    const state = (await import('./catalogStore')).useCatalogStore.getState();
    const exists = state.favorites.some(
      (f) => f.targetType === targetType && f.targetId === targetId
    );

    if (exists) {
      await (await import('../lib/supabase')).supabase
        .from('dealer_favorites')
        .delete()
        .eq('dealer_id', dealerId)
        .eq('target_type', targetType)
        .eq('target_id', targetId);
      set((s) => ({
        favorites: s.favorites.filter(
          (f) => !(f.targetType === targetType && f.targetId === targetId)
        ),
      }));
    } else {
      await (await import('../lib/supabase')).supabase
        .from('dealer_favorites')
        .insert({ dealer_id: dealerId, target_type: targetType, target_id: targetId });
      set((s) => ({
        favorites: [...s.favorites, { targetType, targetId }],
      }));
    }
  },
}));
