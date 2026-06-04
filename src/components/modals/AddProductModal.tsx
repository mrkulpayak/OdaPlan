import { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { FurnitureShape } from '../canvas/FurnitureShape';
import { useCatalogStore } from '../../store/catalogStore';
import { useUiStore } from '../../store/uiStore';
import { supabase } from '../../lib/supabase';
import type { FurnitureShapeType, FurnitureFrontSide, FurnitureCategory } from '../../types';

interface Props {
  dealerId: string;
  onClose: () => void;
}

const SHAPE_TYPES: FurnitureShapeType[] = [
  'rectangle', 'square', 'circle', 'semicircle', 'quarterCircle', 'chamferedRectangle', 'cornerCabinet',
];

const SHAPE_LABELS: Record<FurnitureShapeType, string> = {
  rectangle: 'Rect',
  square: 'Square',
  circle: 'Circle',
  semicircle: 'Semi',
  quarterCircle: '¼ Arc',
  chamferedRectangle: 'Chamfer',
  cornerCabinet: 'Corner',
};

const CATEGORIES: FurnitureCategory[] = [
  'Koltuk', 'Berjer', 'Sehpa', 'Yemek Masası', 'Sandalye', 'Konsol',
  'TV Ünitesi', 'Yatak', 'Komodin', 'Gardırop', 'Şifonyer', 'Dolap', 'Mutfak Köşe', 'Özel',
];

const FRONT_SIDES: FurnitureFrontSide[] = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

const fieldStyle: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: '13px' };
const labelCls = 'text-xs text-text-muted mb-1 block';
const inputCls = 'w-full px-2 py-1.5 rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary text-sm';

export function AddProductModal({ dealerId, onClose }: Props) {
  const { companies, models, addProduct, addCompany, addModel } = useCatalogStore();
  const addToast = useUiStore((s) => s.addToast);

  const [companyId, setCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [modelId, setModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory | ''>('');
  const [shapeType, setShapeType] = useState<FurnitureShapeType>('rectangle');
  const [frontSide, setFrontSide] = useState<FurnitureFrontSide>('bottom');
  const [widthCm, setWidthCm] = useState('');
  const [depthCm, setDepthCm] = useState('');
  const [chamferCm, setChamferCm] = useState('20');
  const [chamferCorner, setChamferCorner] = useState('topLeft');
  const [quarterCorner, setQuarterCorner] = useState('topLeft');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const companyModels = useMemo(
    () => models.filter((m) => m.companyId === companyId),
    [models, companyId]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!companyId && !newCompanyName.trim()) e.company = 'Company is required.';
    if (!name.trim()) e.name = 'Product name is required.';
    if (!category) e.category = 'Category is required.';
    if (!widthCm || Number(widthCm) <= 0) e.width = 'Valid width required.';
    if (!depthCm || Number(depthCm) <= 0) e.depth = 'Valid depth required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    let finalCompanyId = companyId;
    let finalModelId = modelId || null;

    // Insert new company if needed
    if (newCompanyName.trim()) {
      const { data, error } = await supabase
        .from('furniture_companies')
        .insert({ dealer_id: dealerId, name: newCompanyName.trim(), is_global: false })
        .select()
        .single();
      if (error || !data) {
        addToast({ type: 'error', message: 'Could not save. Check your connection.' });
        setSaving(false);
        return;
      }
      finalCompanyId = data.id;
      addCompany({ id: data.id, dealerId, name: newCompanyName.trim(), isGlobal: false });
    }

    // Insert new model if needed
    if (newModelName.trim() && finalCompanyId) {
      const { data, error } = await supabase
        .from('furniture_models')
        .insert({ dealer_id: dealerId, company_id: finalCompanyId, name: newModelName.trim(), is_global: false })
        .select()
        .single();
      if (error || !data) {
        addToast({ type: 'error', message: 'Could not save. Check your connection.' });
        setSaving(false);
        return;
      }
      finalModelId = data.id;
      addModel({ id: data.id, dealerId, companyId: finalCompanyId, name: newModelName.trim(), isGlobal: false });
    }

    // Build params
    let params: Record<string, unknown> | null = null;
    if (shapeType === 'chamferedRectangle') params = { chamferCm: Number(chamferCm), corner: chamferCorner };
    if (shapeType === 'quarterCircle') params = { corner: quarterCorner };

    const { data, error } = await supabase
      .from('furniture_products')
      .insert({
        dealer_id: dealerId,
        company_id: finalCompanyId,
        model_id: finalModelId,
        name: name.trim(),
        category,
        shape_type: shapeType,
        front_side: frontSide,
        width_cm: Math.min(9999, Math.max(1, Number(widthCm))),
        depth_cm: Math.min(9999, Math.max(1, Number(depthCm))),
        params,
        is_global: false,
      })
      .select()
      .single();

    if (error || !data) {
      addToast({ type: 'error', message: 'Could not save. Check your connection.' });
      setSaving(false);
      return;
    }

    addProduct({
      id: data.id,
      dealerId,
      companyId: finalCompanyId,
      modelId: finalModelId,
      name: name.trim(),
      category: category as FurnitureCategory,
      shapeType,
      frontSide,
      widthCm: Math.min(9999, Math.max(1, Number(widthCm))),
      depthCm: Math.min(9999, Math.max(1, Number(depthCm))),
      params,
      isGlobal: false,
    });

    addToast({ type: 'success', message: 'Product saved.' });
    onClose();
  };

  const err = (key: string) =>
    errors[key] ? (
      <span className="text-xs" style={{ color: 'var(--color-error, #c0392b)', fontFamily: 'var(--font-body)' }}>
        {errors[key]}
      </span>
    ) : null;

  return (
    <Modal
      title="Add New Product"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-border text-sm cursor-pointer hover:bg-surface-alt transition-colors duration-fast"
            style={fieldStyle}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded text-sm cursor-pointer transition-colors duration-fast"
            style={{ ...fieldStyle, background: 'var(--color-primary)', color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Company */}
        <div>
          <label className={labelCls} style={fieldStyle}>Company *</label>
          {newCompanyName.trim() ? (
            <div className="flex gap-2">
              <input
                className={inputCls}
                style={fieldStyle}
                placeholder="New company name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                maxLength={200}
                autoFocus
              />
              <button
                onClick={() => setNewCompanyName('')}
                className="text-xs text-text-muted hover:text-[var(--color-text)] cursor-pointer whitespace-nowrap"
                style={fieldStyle}
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              className={inputCls}
              style={fieldStyle}
              value={companyId}
              onChange={(e) => {
                if (e.target.value === '__new__') { setNewCompanyName(' '); setCompanyId(''); }
                else { setCompanyId(e.target.value); setModelId(''); }
              }}
            >
              <option value="">Select company...</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ New Company</option>
            </select>
          )}
          {err('company')}
        </div>

        {/* Model (optional) */}
        {(companyId || newCompanyName.trim()) && (
          <div>
            <label className={labelCls} style={fieldStyle}>Model / Set (optional)</label>
            {newModelName.trim() ? (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  style={fieldStyle}
                  placeholder="New model name"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  maxLength={200}
                />
                <button
                  onClick={() => setNewModelName('')}
                  className="text-xs text-text-muted hover:text-[var(--color-text)] cursor-pointer whitespace-nowrap"
                  style={fieldStyle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                className={inputCls}
                style={fieldStyle}
                value={modelId}
                onChange={(e) => {
                  if (e.target.value === '__new__') setNewModelName(' ');
                  else setModelId(e.target.value);
                }}
              >
                <option value="">No model</option>
                {companyModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__new__">+ New Model</option>
              </select>
            )}
          </div>
        )}

        {/* Product Name */}
        <div>
          <label className={labelCls} style={fieldStyle}>Product Name *</label>
          <input
            className={inputCls}
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laguna 3'lü Koltuk"
            maxLength={200}
          />
          {err('name')}
        </div>

        {/* Category */}
        <div>
          <label className={labelCls} style={fieldStyle}>Category *</label>
          <select
            className={inputCls}
            style={fieldStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {err('category')}
        </div>

        {/* Dimensions */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} style={fieldStyle}>Width (cm) *</label>
            <input
              type="number" min={1} max={9999}
              className={inputCls}
              style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              placeholder="e.g. 220"
            />
            {err('width')}
          </div>
          <div className="flex-1">
            <label className={labelCls} style={fieldStyle}>Depth (cm) *</label>
            <input
              type="number" min={1} max={9999}
              className={inputCls}
              style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
              value={depthCm}
              onChange={(e) => setDepthCm(e.target.value)}
              placeholder="e.g. 95"
            />
            {err('depth')}
          </div>
        </div>

        {/* Shape type */}
        <div>
          <label className={labelCls} style={fieldStyle}>Shape</label>
          <div className="flex flex-wrap gap-1">
            {SHAPE_TYPES.map((st) => (
              <button
                key={st}
                onClick={() => setShapeType(st)}
                className="px-2 py-1 rounded border text-xs cursor-pointer transition-colors duration-fast"
                style={{
                  ...fieldStyle,
                  background: shapeType === st ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: shapeType === st ? '#fff' : 'var(--color-text)',
                  borderColor: shapeType === st ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              >
                {SHAPE_LABELS[st]}
              </button>
            ))}
          </div>

          {/* Shape params */}
          {shapeType === 'chamferedRectangle' && (
            <div className="flex gap-3 mt-2">
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Chamfer size (cm)</label>
                <input type="number" min={1} className={inputCls} style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }} value={chamferCm} onChange={(e) => setChamferCm(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Corner</label>
                <select className={inputCls} style={fieldStyle} value={chamferCorner} onChange={(e) => setChamferCorner(e.target.value)}>
                  {CORNERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}
          {shapeType === 'quarterCircle' && (
            <div className="mt-2">
              <label className={labelCls} style={fieldStyle}>Corner</label>
              <select className={inputCls} style={fieldStyle} value={quarterCorner} onChange={(e) => setQuarterCorner(e.target.value)}>
                {CORNERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Preview + front side */}
        {widthCm && depthCm && Number(widthCm) > 0 && Number(depthCm) > 0 && (
          <div>
            <label className={labelCls} style={fieldStyle}>Front side</label>
            <div className="flex gap-4 items-start">
              {/* Shape preview with clickable sides */}
              <div className="relative" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80} viewBox="0 0 80 80">
                  <g transform="translate(10,10)">
                    <FurnitureShape
                      shapeType={shapeType}
                      widthCm={Math.min(Number(widthCm), 200)}
                      depthCm={Math.min(Number(depthCm), 200)}
                      params={
                        shapeType === 'chamferedRectangle' ? { chamferCm: Number(chamferCm), corner: chamferCorner } :
                        shapeType === 'quarterCircle' ? { corner: quarterCorner } : null
                      }
                      frontSide={frontSide}
                    />
                  </g>
                </svg>
                {/* Clickable side overlays */}
                {FRONT_SIDES.map((side) => {
                  const s: React.CSSProperties = {
                    position: 'absolute', cursor: 'pointer',
                    background: frontSide === side ? 'rgba(44,95,138,0.25)' : 'transparent',
                    border: frontSide === side ? '2px solid var(--color-primary)' : '1px solid transparent',
                    transition: 'all 0.1s',
                  };
                  if (side === 'top') Object.assign(s, { top: 0, left: 10, right: 10, height: 10 });
                  if (side === 'right') Object.assign(s, { top: 10, right: 0, bottom: 10, width: 10 });
                  if (side === 'bottom') Object.assign(s, { bottom: 0, left: 10, right: 10, height: 10 });
                  if (side === 'left') Object.assign(s, { top: 10, left: 0, bottom: 10, width: 10 });
                  return <div key={side} style={s} onClick={() => setFrontSide(side)} title={side} />;
                })}
              </div>

              <select
                className={inputCls}
                style={{ ...fieldStyle, width: 'auto', flex: 1 }}
                value={frontSide}
                onChange={(e) => setFrontSide(e.target.value as FurnitureFrontSide)}
              >
                {FRONT_SIDES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
